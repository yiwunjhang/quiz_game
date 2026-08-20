-- =====================================================================
-- 問答遊戲 Supabase 資料庫結構（Kahoot 式即時多人對戰版）
-- 使用方式：登入 Supabase 專案 → SQL Editor → 貼上整份執行一次即可。
-- 可重複執行（全部為 if not exists / create or replace）。
-- =====================================================================

-- ---------- profiles：使用者個人資料（對應 auth.users） ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text unique not null,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);

-- ---------- questions：題庫（僅管理者可讀寫） ----------
create table if not exists public.questions (
  id bigint generated always as identity primary key,
  text text not null,
  options jsonb not null,
  correct_index int not null,
  created_at timestamptz not null default now()
);

alter table public.questions enable row level security;

drop policy if exists "questions_admin_all" on public.questions;
create policy "questions_admin_all" on public.questions
  for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

-- =====================================================================
-- 即時對戰：房間 / 玩家 / 作答
-- =====================================================================

-- ---------- games：一場遊戲（房間） ----------
create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  pin text not null,
  host_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'lobby' check (status in ('lobby', 'question', 'reveal', 'ended')),
  question_ids bigint[] not null default '{}',
  current_index int not null default -1,      -- -1 = 尚未開始
  seconds_per_question int not null default 20,
  question_started_at timestamptz,
  created_at timestamptz not null default now(),
  ended_at timestamptz
);

-- 房間代碼只在「進行中的房間」之間唯一，結束後可被重複使用
create unique index if not exists games_pin_active on public.games (pin) where status <> 'ended';
create index if not exists games_host_idx on public.games (host_id);

-- ---------- game_players：房間內的玩家與即時分數 ----------
create table if not exists public.game_players (
  game_id uuid not null references public.games(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  nickname text not null,
  score int not null default 0,
  correct_count int not null default 0,
  streak int not null default 0,
  joined_at timestamptz not null default now(),
  primary key (game_id, user_id)
);

-- ---------- game_answers：每題每人只能作答一次 ----------
create table if not exists public.game_answers (
  id bigint generated always as identity primary key,
  game_id uuid not null references public.games(id) on delete cascade,
  question_id bigint not null references public.questions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  selected_index int not null,
  is_correct boolean not null,
  points int not null default 0,
  ms_taken int not null default 0,
  created_at timestamptz not null default now(),
  unique (game_id, question_id, user_id)
);

alter table public.games enable row level security;
alter table public.game_players enable row level security;
alter table public.game_answers enable row level security;

-- 「我是不是這個房間的成員」。必須是 security definer，policy 才不會因為
-- 查詢自己所保護的資料表而觸發 infinite recursion。
create or replace function public.is_game_member(p_game_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.games g
    where g.id = p_game_id and g.host_id = auth.uid()
  ) or exists (
    select 1 from public.game_players gp
    where gp.game_id = p_game_id and gp.user_id = auth.uid()
  );
$$;

grant execute on function public.is_game_member(uuid) to authenticated;

-- 只有房主與房內玩家能讀到房間資料（Realtime 推播也依這條規則過濾）
drop policy if exists "games_select_members" on public.games;
create policy "games_select_members" on public.games
  for select using (public.is_game_member(id));

drop policy if exists "game_players_select_members" on public.game_players;
create policy "game_players_select_members" on public.game_players
  for select using (
    user_id = auth.uid() or public.is_game_member(game_id)
  );

-- 作答紀錄只看得到自己的；統計數字一律走 RPC，避免中途偷看別人答案
drop policy if exists "game_answers_select_own" on public.game_answers;
create policy "game_answers_select_own" on public.game_answers
  for select using (user_id = auth.uid());

-- 三張表都沒有 insert / update policy → 只能透過下方 security definer 函式寫入

-- Realtime：UPDATE / DELETE 事件要套用 RLS 需要完整的舊列資料
alter table public.games replica identity full;
alter table public.game_players replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.games;
    exception when duplicate_object then null;
    end;
    begin
      alter publication supabase_realtime add table public.game_players;
    exception when duplicate_object then null;
    end;
  end if;
end $$;

-- =====================================================================
-- 伺服器端函式 (security definer)
-- 玩家所有讀寫都經過這裡，因此答案不會提前外洩、分數也無法偽造。
-- =====================================================================

-- ---------- 建立房間（任何登入者皆可當主持人） ----------
create or replace function public.create_game(p_seconds int default 20, p_count int default 10)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pin text;
  v_ids bigint[];
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception '尚未登入';
  end if;

  select array(
    select q.id from public.questions q order by random() limit greatest(coalesce(p_count, 10), 1)
  ) into v_ids;

  if coalesce(array_length(v_ids, 1), 0) = 0 then
    raise exception '題庫是空的，請先到後台新增題目';
  end if;

  -- 產生不與進行中房間重複的 6 位數代碼
  loop
    v_pin := lpad((floor(random() * 1000000))::int::text, 6, '0');
    exit when not exists (
      select 1 from public.games g where g.pin = v_pin and g.status <> 'ended'
    );
  end loop;

  insert into public.games (pin, host_id, question_ids, seconds_per_question)
  values (v_pin, auth.uid(), v_ids, greatest(5, least(120, coalesce(p_seconds, 20))))
  returning id into v_id;

  return jsonb_build_object('game_id', v_id, 'pin', v_pin);
end;
$$;

-- ---------- 以房間代碼加入 ----------
create or replace function public.join_game(p_pin text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game public.games%rowtype;
  v_nick text;
begin
  if auth.uid() is null then
    raise exception '尚未登入';
  end if;

  select * into v_game
  from public.games
  where pin = trim(p_pin) and status <> 'ended'
  order by created_at desc
  limit 1;

  if v_game.id is null then
    raise exception '找不到這個房間代碼，請確認主持人畫面上的號碼';
  end if;

  if v_game.host_id = auth.uid() then
    return v_game.id;  -- 主持人直接回到自己的控台
  end if;

  -- 遊戲開始後只允許已在房內的玩家重新連線
  if v_game.status <> 'lobby'
     and not exists (
       select 1 from public.game_players
       where game_id = v_game.id and user_id = auth.uid()
     ) then
    raise exception '這場遊戲已經開始了，無法中途加入';
  end if;

  select nickname into v_nick from public.profiles where id = auth.uid();

  insert into public.game_players (game_id, user_id, nickname)
  values (v_game.id, auth.uid(), coalesce(v_nick, '玩家'))
  on conflict (game_id, user_id) do update set nickname = excluded.nickname;

  return v_game.id;
end;
$$;

-- ---------- 讀取房間即時狀態（玩家/主持人共用） ----------
create or replace function public.get_game_state(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.games%rowtype;
  v_q public.questions%rowtype;
  v_ans public.game_answers%rowtype;
  v_qid bigint;
  v_phase text;
  v_is_host boolean;
begin
  select * into g from public.games where id = p_game_id;
  if g.id is null then
    raise exception '房間不存在或已結束';
  end if;

  v_is_host := (g.host_id = auth.uid());
  if not v_is_host and not exists (
    select 1 from public.game_players where game_id = g.id and user_id = auth.uid()
  ) then
    raise exception '你不在這個房間裡';
  end if;

  if g.current_index >= 0 then
    v_qid := g.question_ids[g.current_index + 1];
    select * into v_q from public.questions where id = v_qid;
  end if;

  -- 時間到就自動視為「公布答案」階段，不必等主持人按鈕
  v_phase := g.status;
  if g.status = 'question'
     and g.question_started_at is not null
     and now() > g.question_started_at + make_interval(secs => g.seconds_per_question) then
    v_phase := 'reveal';
  end if;

  select * into v_ans
  from public.game_answers
  where game_id = g.id and question_id = v_qid and user_id = auth.uid();

  return jsonb_build_object(
    'game_id', g.id,
    'pin', g.pin,
    'status', g.status,
    'phase', v_phase,
    'is_host', v_is_host,
    'index', g.current_index,
    'total', coalesce(array_length(g.question_ids, 1), 0),
    'seconds', g.seconds_per_question,
    'started_at', g.question_started_at,
    'server_now', now(),
    'question', case
      when v_q.id is null then null
      else jsonb_build_object('id', v_q.id, 'text', v_q.text, 'options', v_q.options)
    end,
    'correct_index', case when v_phase in ('reveal', 'ended') then v_q.correct_index else null end,
    'my_answer', case
      when v_ans.id is null then null
      else jsonb_build_object(
        'selected_index', v_ans.selected_index,
        'is_correct', v_ans.is_correct,
        'points', v_ans.points
      )
    end,
    'my_score', (
      select score from public.game_players where game_id = g.id and user_id = auth.uid()
    ),
    'player_count', (select count(*) from public.game_players where game_id = g.id),
    'answer_count', (
      select count(*) from public.game_answers where game_id = g.id and question_id = v_qid
    ),
    'players', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'user_id', gp.user_id,
            'nickname', gp.nickname,
            'score', gp.score,
            'correct_count', gp.correct_count
          )
          order by gp.score desc, gp.joined_at
        ), '[]'::jsonb)
      from public.game_players gp where gp.game_id = g.id
    ),
    'stats', case
      when v_phase in ('reveal', 'ended') and v_q.id is not null then (
        select coalesce(jsonb_agg(t.c order by t.i), '[]'::jsonb)
        from (
          select i,
            (select count(*) from public.game_answers a
              where a.game_id = g.id and a.question_id = v_qid and a.selected_index = i) as c
          from generate_series(0, jsonb_array_length(v_q.options) - 1) as i
        ) t
      )
      else null
    end
  );
end;
$$;

-- ---------- 作答（伺服器計時、計分） ----------
create or replace function public.submit_live_answer(p_game_id uuid, p_selected_index int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.games%rowtype;
  v_qid bigint;
  v_correct int;
  v_is boolean;
  v_elapsed_ms int;
  v_limit_ms int;
  v_points int;
  v_new_id bigint;
begin
  if auth.uid() is null then
    raise exception '尚未登入';
  end if;

  select * into g from public.games where id = p_game_id;
  if g.id is null then
    raise exception '房間不存在';
  end if;
  if g.status <> 'question' or g.question_started_at is null then
    raise exception '現在不是作答時間';
  end if;
  if not exists (
    select 1 from public.game_players where game_id = g.id and user_id = auth.uid()
  ) then
    raise exception '你不在這個房間裡';
  end if;

  v_qid := g.question_ids[g.current_index + 1];
  v_limit_ms := g.seconds_per_question * 1000;
  v_elapsed_ms := greatest(0, (extract(epoch from (now() - g.question_started_at)) * 1000)::int);

  -- 多給 1 秒容忍網路延遲
  if v_elapsed_ms > v_limit_ms + 1000 then
    raise exception '時間已經到了';
  end if;

  select correct_index into v_correct from public.questions where id = v_qid;
  v_is := (v_correct = p_selected_index);

  -- 答對才有分數，越快分數越高（1000 ~ 500 分）
  v_points := case
    when v_is then round(1000 * (1 - (least(v_elapsed_ms, v_limit_ms)::numeric / v_limit_ms) / 2))::int
    else 0
  end;

  insert into public.game_answers (game_id, question_id, user_id, selected_index, is_correct, points, ms_taken)
  values (p_game_id, v_qid, auth.uid(), p_selected_index, v_is, v_points, v_elapsed_ms)
  on conflict (game_id, question_id, user_id) do nothing
  returning id into v_new_id;

  -- 只有第一次作答會加分（重送不會重複計分）
  if v_new_id is not null then
    update public.game_players
    set score = score + v_points,
        correct_count = correct_count + case when v_is then 1 else 0 end,
        streak = case when v_is then streak + 1 else 0 end
    where game_id = p_game_id and user_id = auth.uid();
  end if;

  return (
    select jsonb_build_object(
      'selected_index', selected_index,
      'is_correct', is_correct,
      'points', points
    )
    from public.game_answers
    where game_id = p_game_id and question_id = v_qid and user_id = auth.uid()
  );
end;
$$;

-- ---------- 主持人控制 ----------
create or replace function public.host_action(p_game_id uuid, p_action text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.games%rowtype;
  v_total int;
begin
  select * into g from public.games where id = p_game_id for update;
  if g.id is null then
    raise exception '房間不存在';
  end if;
  if g.host_id <> auth.uid() then
    raise exception '只有主持人可以控制遊戲';
  end if;

  v_total := coalesce(array_length(g.question_ids, 1), 0);

  if p_action = 'start' then
    if g.status <> 'lobby' then
      raise exception '遊戲已經開始了';
    end if;
    if not exists (select 1 from public.game_players where game_id = g.id) then
      raise exception '還沒有玩家加入';
    end if;
    update public.games
    set status = 'question', current_index = 0, question_started_at = now()
    where id = g.id;

  elsif p_action = 'reveal' then
    update public.games set status = 'reveal' where id = g.id and status = 'question';

  elsif p_action = 'next' then
    if g.current_index + 1 < v_total then
      update public.games
      set status = 'question', current_index = g.current_index + 1, question_started_at = now()
      where id = g.id;
    else
      update public.games set status = 'ended', ended_at = now() where id = g.id;
    end if;

  elsif p_action = 'end' then
    update public.games set status = 'ended', ended_at = now() where id = g.id;

  else
    raise exception '不支援的操作：%', p_action;
  end if;

  return public.get_game_state(p_game_id);
end;
$$;

-- ---------- 我主持中／參加中的房間（重新整理後可回到現場） ----------
create or replace function public.get_my_active_game()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object('game_id', g.id, 'pin', g.pin, 'is_host', g.host_id = auth.uid())
  from public.games g
  where g.status <> 'ended'
    and (
      g.host_id = auth.uid()
      or exists (
        select 1 from public.game_players gp
        where gp.game_id = g.id and gp.user_id = auth.uid()
      )
    )
  order by g.created_at desc
  limit 1;
$$;

-- ---------- 總排行榜：累計所有已結束場次的得分 ----------
create or replace function public.get_global_leaderboard()
returns table (
  user_id uuid,
  nickname text,
  total_score bigint,
  games_played bigint,
  best_score int,
  correct_total bigint
)
language sql
security definer
set search_path = public
as $$
  select
    gp.user_id                as user_id,
    max(gp.nickname)          as nickname,
    sum(gp.score)::bigint     as total_score,
    count(*)::bigint          as games_played,
    max(gp.score)             as best_score,
    sum(gp.correct_count)::bigint as correct_total
  from public.game_players gp
  join public.games g on g.id = gp.game_id and g.status = 'ended'
  group by gp.user_id
  -- 用序號排序，避免輸出欄位名稱與 returns table 的參數名互相衝突
  order by 3 desc, 4 asc;
$$;

-- ---------- 授權 ----------
grant execute on function public.create_game(int, int) to authenticated;
grant execute on function public.join_game(text) to authenticated;
grant execute on function public.get_game_state(uuid) to authenticated;
grant execute on function public.submit_live_answer(uuid, int) to authenticated;
grant execute on function public.host_action(uuid, text) to authenticated;
grant execute on function public.get_my_active_game() to authenticated;
grant execute on function public.get_global_leaderboard() to anon, authenticated;

-- =====================================================================
-- 範例題目（以 SQL Editor 執行時具管理權限，會略過 RLS）
-- =====================================================================
insert into public.questions (text, options, correct_index)
select * from (values
  ('Vue 3 的預設回應式系統是基於哪個 JavaScript 特性？',
   '["Object.defineProperty","Proxy","Getter/Setter 手寫","MutationObserver"]'::jsonb, 1),
  ('Tailwind CSS 屬於哪一種 CSS 方法論？',
   '["BEM","OOCSS","Utility-First","Atomic Design"]'::jsonb, 2),
  ('下列何者是 Supabase 內建提供的功能？',
   '["Postgres 資料庫","自動產生 REST API","身分驗證","以上皆是"]'::jsonb, 3),
  ('GitHub Pages 主要用來託管哪種內容？',
   '["靜態網站","Docker 容器","SQL 資料庫","背景排程任務"]'::jsonb, 0),
  ('HTTP 狀態碼 404 代表什麼？',
   '["伺服器內部錯誤","找不到資源","未授權","請求逾時"]'::jsonb, 1)
) as v(text, options, correct_index)
where not exists (select 1 from public.questions);

-- =====================================================================
-- 設定管理者：先在遊戲首頁用某個暱稱註冊，再把該暱稱設為 admin。
-- 例如註冊暱稱 admin 後執行：
--   update public.profiles set is_admin = true where nickname = 'admin';
--
-- 舊版「單人循序作答」留下的物件（attempts 表與相關函式）已不再使用，
-- 確認不需要保留紀錄後，可自行執行下列指令清除：
--   drop function if exists public.get_quiz_questions();
--   drop function if exists public.submit_answer(bigint, int);
--   drop function if exists public.get_my_score();
--   drop function if exists public.get_leaderboard();
--   drop table if exists public.attempts;
-- =====================================================================
