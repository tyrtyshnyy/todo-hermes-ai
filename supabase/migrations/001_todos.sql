-- Тихо: run the complete script in Supabase > SQL Editor.
-- No passwords or secret API keys are needed in this script.
begin;

create table if not exists public.todos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  project text not null default 'Личное' check (project in ('Работа', 'Личное', 'Идеи')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  due date check (due between date '0001-01-01' and date '9999-12-31'),
  done boolean not null default false,
  is_public boolean not null default false,
  author_name text not null default 'Участник' check (char_length(btrim(author_name)) between 1 and 40),
  created_at timestamptz not null default now()
);

create index if not exists todos_user_created_idx on public.todos (user_id, created_at desc);
create index if not exists todos_public_created_idx on public.todos (created_at desc) where is_public;

alter table public.todos enable row level security;
-- Revoke inherited default privileges, especially TRUNCATE (not covered by RLS).
revoke all on table public.todos from public, anon, authenticated;
grant usage on schema public to anon, authenticated;
grant select on table public.todos to anon;
grant select, insert, update, delete on table public.todos to authenticated;

-- Only the author sees a private task. Published tasks are visible to everyone.
drop policy if exists tikho_select on public.todos;
create policy tikho_select on public.todos for select to anon, authenticated
  using (is_public or user_id = (select auth.uid()));

drop policy if exists tikho_insert on public.todos;
create policy tikho_insert on public.todos for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists tikho_update on public.todos;
create policy tikho_update on public.todos for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists tikho_delete on public.todos;
create policy tikho_delete on public.todos for delete to authenticated
  using (user_id = (select auth.uid()));

comment on table public.todos is 'Тихо: private by default; only explicitly published tasks are public. Author names are user-chosen labels, not verified identities.';
notify pgrst, 'reload schema';
commit;
