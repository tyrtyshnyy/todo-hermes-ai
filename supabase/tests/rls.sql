\set ON_ERROR_STOP on
begin;
-- Helpers deliberately SECURITY INVOKER: every query executes as SET ROLE's caller.
create schema security_tests;
create table security_tests.results (name text primary key);
grant usage on schema security_tests to anon, authenticated;
grant insert, select on security_tests.results to anon, authenticated;
create function security_tests.ok(condition boolean, label text) returns void
language plpgsql security invoker as $$
begin
  if condition is distinct from true then raise exception 'FAIL: %', label; end if;
  insert into security_tests.results values (label);
  raise notice 'PASS: %', label;
end $$;
create function security_tests.denied(statement text, expected_state text, label text) returns void
language plpgsql security invoker as $$
declare actual_state text;
begin
  begin
    execute statement;
  exception when others then
    get stacked diagnostics actual_state = returned_sqlstate;
  end;
  perform security_tests.ok(actual_state = expected_state, label);
end $$;
grant execute on all functions in schema security_tests to anon, authenticated;

set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select security_tests.ok(current_user = 'authenticated' and not (select rolsuper or rolbypassrls from pg_roles where rolname = current_user), 'authenticated role cannot bypass RLS');
select security_tests.ok(row_security_active('public.todos'), 'RLS active for authenticated');
insert into public.todos(id,title) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Private fixture');
select security_tests.ok((select not is_public and not done and project = 'Личное' and priority = 'normal' and due is null and user_id = auth.uid() and created_at is not null from public.todos where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 'owner INSERT defaults private with expected defaults');
select security_tests.ok((select count(*) = 1 from public.todos), 'owner SELECT private');
insert into public.todos(id,title,is_public) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Published fixture',true);
with changed as (update public.todos set title = 'Owner edited',done = true where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' returning *)
select security_tests.ok((select count(*) = 1 and bool_and(done and title = 'Owner edited') from changed), 'owner UPDATE private');
insert into public.todos(id,title) values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','Delete me');
with removed as (delete from public.todos where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' returning *)
select security_tests.ok((select count(*) = 1 from removed), 'owner DELETE');
select security_tests.denied($q$insert into public.todos(title,user_id) values ('Forged owner','22222222-2222-4222-8222-222222222222')$q$, '42501', 'foreign owner INSERT denied');
select security_tests.denied($q$update public.todos set user_id = '22222222-2222-4222-8222-222222222222' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$q$, '42501', 'owner reassignment denied');
select security_tests.denied('truncate public.todos', '42501', 'authenticated TRUNCATE denied');

-- Bounds: exercise CHECK constraints under the real owning role, not superuser.
select security_tests.denied($q$insert into public.todos(title) values ('   ')$q$, '23514', 'blank title denied');
select security_tests.denied($q$insert into public.todos(title) values (repeat('x',201))$q$, '23514', 'title over 200 denied');
select security_tests.denied($q$insert into public.todos(title) values (null)$q$, '23502', 'null title denied');
select security_tests.denied($q$insert into public.todos(title,project) values ('Invalid project','Other')$q$, '23514', 'invalid project denied');
select security_tests.denied($q$insert into public.todos(title,priority) values ('Invalid priority','urgent')$q$, '23514', 'invalid priority denied');
select security_tests.denied($q$insert into public.todos(title,due) values ('Too early',date '0001-12-31 BC')$q$, '23514', 'date below minimum denied');
select security_tests.denied($q$insert into public.todos(title,due) values ('Too late',date '10000-01-01')$q$, '23514', 'date above maximum denied');
select security_tests.denied($q$insert into public.todos(title,due) values ('Infinite',date 'infinity')$q$, '23514', 'infinite date denied');
select security_tests.denied($q$update public.todos set title = '' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$q$, '23514', 'invalid owner UPDATE denied');
insert into public.todos(id,title,due) values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd',repeat('x',200),date '0001-01-01');
select security_tests.ok((select due = date '0001-01-01' and length(title) = 200 from public.todos where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'), 'maximum title and minimum date accepted');
update public.todos set due = date '9999-12-31' where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
select security_tests.ok((select due = date '9999-12-31' from public.todos where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'), 'maximum date accepted');
delete from public.todos where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

set local role anon;
set local request.jwt.claim.sub = '';
select security_tests.ok(current_user = 'anon' and not (select rolsuper or rolbypassrls from pg_roles where rolname = current_user), 'anon role cannot bypass RLS');
select security_tests.ok(row_security_active('public.todos'), 'RLS active for anon');
select security_tests.ok((select count(*) = 1 and bool_and(id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid) from public.todos), 'anon SELECT only published');
select security_tests.denied($q$insert into public.todos(title) values ('Anonymous insert')$q$, '42501', 'anon INSERT denied');
select security_tests.denied($q$update public.todos set title = 'Anonymous edit' where is_public$q$, '42501', 'anon UPDATE denied');
select security_tests.denied('delete from public.todos where is_public', '42501', 'anon DELETE denied');
select security_tests.denied('truncate public.todos', '42501', 'anon TRUNCATE denied');

set local role authenticated;
set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
select security_tests.ok((select count(*) = 1 and bool_and(id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid) from public.todos), 'other authenticated SELECT only published');
with changed as (update public.todos set title = 'Attack' where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' returning *)
select security_tests.ok((select count(*) = 0 from changed), 'non-owner public UPDATE affects zero');
with removed as (delete from public.todos where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' returning *)
select security_tests.ok((select count(*) = 0 from removed), 'non-owner public DELETE affects zero');
with changed as (update public.todos set title = 'Attack' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' returning *)
select security_tests.ok((select count(*) = 0 from changed), 'non-owner private UPDATE affects zero');
with removed as (delete from public.todos where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' returning *)
select security_tests.ok((select count(*) = 0 from removed), 'non-owner private DELETE affects zero');
insert into public.todos(id,title) values ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','Second owner');
select security_tests.ok((select count(*) = 2 from public.todos), 'second user can create and read own private row');

set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select security_tests.ok((select count(*) = 2 from public.todos), 'first owner cannot read second owner private row');
select security_tests.ok((select title = 'Published fixture' from public.todos where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'), 'non-owner attacks left published row unchanged');
with changed as (update public.todos set is_public = false where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' returning *)
select security_tests.ok((select count(*) = 1 and bool_and(not is_public) from changed), 'owner can unpublish');
set local role anon;
set local request.jwt.claim.sub = '';
select security_tests.ok((select count(*) = 0 from public.todos), 'unpublished row disappears for anon');
set local role authenticated;
set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
select security_tests.ok(not exists(select 1 from public.todos where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'), 'unpublished row disappears for non-owner');
reset role;
select count(*) as passed_local_postgresql_assertions from security_tests.results;
rollback;
