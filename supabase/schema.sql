-- =====================================================================
-- 問答遊戲 Supabase 資料庫結構
-- 使用方式：登入 Supabase 專案 → SQL Editor → 貼上整份執行一次即可。
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

-- ---------- attempts：作答紀錄（每人每題只計一次） ----------
create table if not exists public.attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id bigint not null references public.questions(id) on delete cascade,
  selected_index int not null,
  is_correct boolean not null,
  created_at timestamptz not null default now(),
  unique (user_id, question_id)
);

alter table public.attempts enable row level security;

-- 只能讀取自己的作答；沒有 insert policy → 只能透過下方 security definer 函式寫入
drop policy if exists "attempts_select_own" on public.attempts;
create policy "attempts_select_own" on public.attempts
  for select using (auth.uid() = user_id);

-- =====================================================================
-- 伺服器端函式 (security definer)：玩家所有讀寫都經過這裡，
-- 因此答案不會外洩、分數也無法偽造。
-- =====================================================================

-- 取得「尚未作答」的題目（不含正確答案）
create or replace function public.get_quiz_questions()
returns table (id bigint, text text, options jsonb)
language sql
security definer
set search_path = public
as $$
  select q.id, q.text, q.options
  from public.questions q
  where q.id not in (
    select a.question_id from public.attempts a where a.user_id = auth.uid()
  )
  order by q.id;
$$;

-- 提交作答：伺服器評分並記錄，回傳是否答對與正確答案索引
create or replace function public.submit_answer(p_question_id bigint, p_selected_index int)
returns table (is_correct boolean, correct_index int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_correct int;
  v_is boolean;
begin
  if auth.uid() is null then
    raise exception '尚未登入';
  end if;

  select q.correct_index into v_correct from public.questions q where q.id = p_question_id;
  if v_correct is null then
    raise exception '題目不存在';
  end if;

  v_is := (v_correct = p_selected_index);

  insert into public.attempts (user_id, question_id, selected_index, is_correct)
  values (auth.uid(), p_question_id, p_selected_index, v_is)
  on conflict (user_id, question_id) do nothing;

  -- 回傳實際記錄（若先前已作答，回傳先前結果），正確答案索引一律回傳真實值
  return query
    select a.is_correct, v_correct
    from public.attempts a
    where a.user_id = auth.uid() and a.question_id = p_question_id;
end;
$$;

-- 排行榜：每人答對的不重複題數由高到低
create or replace function public.get_leaderboard()
returns table (user_id uuid, nickname text, correct_count bigint, answered_count bigint)
language sql
security definer
set search_path = public
as $$
  select
    p.id,
    p.nickname,
    count(distinct case when a.is_correct then a.question_id end) as correct_count,
    count(distinct a.question_id) as answered_count
  from public.profiles p
  join public.attempts a on a.user_id = p.id
  group by p.id, p.nickname
  order by correct_count desc, max(a.created_at) asc;
$$;

-- 自己的成績
create or replace function public.get_my_score()
returns table (correct bigint, total bigint)
language sql
security definer
set search_path = public
as $$
  select
    count(distinct case when is_correct then question_id end) as correct,
    count(distinct question_id) as total
  from public.attempts
  where user_id = auth.uid();
$$;

-- 授權
grant execute on function public.get_quiz_questions() to authenticated;
grant execute on function public.submit_answer(bigint, int) to authenticated;
grant execute on function public.get_leaderboard() to anon, authenticated;
grant execute on function public.get_my_score() to authenticated;

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
-- =====================================================================
