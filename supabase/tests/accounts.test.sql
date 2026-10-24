-- pgTAP tests for the accounts migration: profiles, user_data, auth_attempts,
-- the sign-up trigger, RLS, username_available and put_user_data.
begin;
create extension if not exists pgtap with schema extensions;

select plan(56);

-- Runs a statement and returns the number of affected rows (as the current role).
create function pg_temp.affected(sql text) returns integer
language plpgsql as $$
declare n integer;
begin
  execute sql;
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------------------------------------------------------------- schema
select has_table('public', 'profiles', 'profiles exists');
select has_table('public', 'user_data', 'user_data exists');
select has_table('public', 'auth_attempts', 'auth_attempts exists');
select col_is_pk('public', 'profiles', 'username', 'profiles.username is the primary key');
select col_is_pk('public', 'user_data', array['user_id', 'key'], 'user_data primary key is (user_id, key)');

-- ---------------------------------------------------------------- sign-up trigger
select lives_ok(
  $$insert into auth.users (id, email, raw_user_meta_data) values
    ('11111111-1111-1111-1111-111111111111', 'a@example.com',
     '{"username":"Budi_1","display_name":"Budi","age":"34"}')$$,
  'user A with valid metadata is created'
);

select results_eq(
  $$select username, display_name from public.profiles
    where user_id = '11111111-1111-1111-1111-111111111111'$$,
  $$values ('budi_1'::text, 'Budi'::text)$$,
  'trigger creates a lowercased profile for user A'
);

select results_eq(
  $$select value, version from public.user_data
    where user_id = '11111111-1111-1111-1111-111111111111' and key = 'w150.prefs'$$,
  $$values ('{"age": 34}'::jsonb, 1)$$,
  'trigger creates w150.prefs {"age": 34} at version 1'
);

select throws_ok(
  $$insert into auth.users (id, email, raw_user_meta_data) values
    ('a0000000-0000-0000-0000-000000000001', 'dup@example.com',
     '{"username":"budi_1","display_name":"Dup","age":"30"}')$$,
  '23505', null,
  'duplicate username is rejected'
);

select throws_ok(
  $$insert into auth.users (id, email, raw_user_meta_data) values
    ('a0000000-0000-0000-0000-000000000002', 'short@example.com',
     '{"username":"ab","display_name":"Short","age":"30"}')$$,
  '22023', null,
  'username shorter than 3 characters is rejected'
);

select throws_ok(
  $$insert into auth.users (id, email, raw_user_meta_data) values
    ('a0000000-0000-0000-0000-000000000003', 'old@example.com',
     '{"username":"old_one","display_name":"Old","age":"121"}')$$,
  '22023', null,
  'age 121 is rejected'
);

select throws_ok(
  $$insert into auth.users (id, email, raw_user_meta_data) values
    ('a0000000-0000-0000-0000-000000000004', 'frac@example.com',
     '{"username":"frac_one","display_name":"Frac","age":"3.5"}')$$,
  '22023', null,
  'age "3.5" is rejected'
);

select throws_ok(
  $$insert into auth.users (id, email, raw_user_meta_data) values
    ('a0000000-0000-0000-0000-000000000005', 'long@example.com',
     jsonb_build_object('username', 'long_one', 'display_name', repeat('x', 41), 'age', '30'))$$,
  '22023', null,
  'display name of 41 characters is rejected'
);

select throws_ok(
  $$insert into auth.users (id, email, raw_user_meta_data) values
    ('a0000000-0000-0000-0000-000000000006', 'nouser@example.com',
     '{"display_name":"No User","age":"30"}')$$,
  '22023', null,
  'missing username is rejected'
);

select throws_ok(
  $$insert into auth.users (id, email, raw_user_meta_data) values
    ('a0000000-0000-0000-0000-000000000007', 'blank@example.com',
     '{"username":"blank_one","display_name":"   ","age":"30"}')$$,
  '22023', null,
  'blank display name is rejected'
);

select throws_ok(
  $$insert into auth.users (id, email, raw_user_meta_data) values
    ('a0000000-0000-0000-0000-000000000008', 'noage@example.com',
     '{"username":"noage_one","display_name":"No Age"}')$$,
  '22023', null,
  'missing age is rejected'
);

select throws_ok(
  $$insert into auth.users (id, email, raw_user_meta_data) values
    ('a0000000-0000-0000-0000-000000000009', 'numfrac@example.com',
     '{"username":"numfrac","display_name":"Num Frac","age":3.5}')$$,
  '22023', null,
  'age as JSON number 3.5 is rejected'
);

select throws_ok(
  $$insert into auth.users (id, email, raw_user_meta_data) values
    ('a0000000-0000-0000-0000-000000000010', 'neg@example.com',
     '{"username":"neg_one","display_name":"Neg","age":"-1"}')$$,
  '22023', null,
  'age "-1" is rejected'
);

select throws_ok(
  $$insert into auth.users (id, email, raw_user_meta_data) values
    ('a0000000-0000-0000-0000-000000000011', 'nometa@example.com', null)$$,
  '22023', null,
  'user without metadata is rejected'
);

select lives_ok(
  $$insert into auth.users (id, email, raw_user_meta_data) values
    ('33333333-3333-3333-3333-333333333333', 'c@example.com',
     '{"username":"  Cici ","display_name":"  Cici  ","age":"3"}')$$,
  'age 3 is accepted (under 5 allowed)'
);

select results_eq(
  $$select p.username, p.display_name, d.value
    from public.profiles p join public.user_data d on d.user_id = p.user_id and d.key = 'w150.prefs'
    where p.user_id = '33333333-3333-3333-3333-333333333333'$$,
  $$values ('cici'::text, 'Cici'::text, '{"age": 3}'::jsonb)$$,
  'username and display name are trimmed, age 3 stored'
);

select lives_ok(
  $$insert into auth.users (id, email, raw_user_meta_data) values
    ('44444444-4444-4444-4444-444444444444', 'd@example.com',
     '{"username":"dewi","display_name":"Dewi","age":40}')$$,
  'age as a whole JSON number is accepted'
);

select is(
  (select value from public.user_data
   where user_id = '44444444-4444-4444-4444-444444444444' and key = 'w150.prefs'),
  '{"age": 40}'::jsonb,
  'numeric age 40 stored as {"age": 40}'
);

select lives_ok(
  $$insert into auth.users (id, email, raw_user_meta_data) values
    ('22222222-2222-2222-2222-222222222222', 'b@example.com',
     '{"username":"bambang","display_name":"Bambang","age":"50"}')$$,
  'user B is created'
);

-- ---------------------------------------------------------------- function privileges
select is(has_function_privilege('anon', 'public.handle_new_user()', 'execute'), false,
  'anon cannot execute handle_new_user');
select is(has_function_privilege('authenticated', 'public.handle_new_user()', 'execute'), false,
  'authenticated cannot execute handle_new_user');
select is(has_function_privilege('anon', 'public.put_user_data(text, jsonb, integer)', 'execute'), false,
  'anon cannot execute put_user_data');
select is(has_function_privilege('authenticated', 'public.put_user_data(text, jsonb, integer)', 'execute'), true,
  'authenticated can execute put_user_data');

-- ---------------------------------------------------------------- username_available
select is(public.username_available('BUDI_1'), false, 'BUDI_1 is taken (case insensitive)');
select is(public.username_available('new_user'), true, 'new_user is available');
select is(public.username_available('a b'), false, '"a b" is not a valid username');

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select is(public.username_available('new_user'), true, 'username_available is callable as anon');
select is(public.username_available('  Budi_1 '), false, 'username_available trims and lowercases');
reset role;

-- ---------------------------------------------------------------- put_user_data as user A
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select results_eq(
  $$select ok, version from public.put_user_data('w150.sessions', '[]', null)$$,
  $$values (true, 1)$$,
  'insert with null expected version gives version 1'
);

select results_eq(
  $$select ok, version from public.put_user_data('w150.sessions', '[]', null)$$,
  $$values (false, 1)$$,
  'second insert with null expected version reports the existing version'
);

select results_eq(
  $$select ok, version from public.put_user_data('w150.sessions', '[{"id":"s1"}]', 1)$$,
  $$values (true, 2)$$,
  'update with matching version gives version 2'
);

select results_eq(
  $$select ok, version, value from public.put_user_data('w150.sessions', '[{"id":"s2"}]', 1)$$,
  $$values (false, 2, '[{"id":"s1"}]'::jsonb)$$,
  'stale version returns the current server version and value'
);

select results_eq(
  $$select ok, version, value from public.put_user_data('w150.plan', '{}', 5)$$,
  $$values (false, null::integer, null::jsonb)$$,
  'expected version on a missing row returns nulls'
);

select throws_ok(
  $$select * from public.put_user_data('w150.theme', '"dark"', null)$$,
  '23514', null,
  'w150.theme is not an allowed server key'
);

select throws_ok(
  $$select * from public.put_user_data('w150.theme', '"dark"', 3)$$,
  '23514', null,
  'disallowed key throws even with an expected version'
);

reset role;

-- updated_at trigger
update public.user_data set updated_at = '2000-01-01'
where user_id = '11111111-1111-1111-1111-111111111111' and key = 'w150.sessions';
select is(
  (select updated_at from public.user_data
   where user_id = '11111111-1111-1111-1111-111111111111' and key = 'w150.sessions'),
  now(),
  'updated_at is set to now() on update'
);

-- ---------------------------------------------------------------- RLS as user B
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select results_eq(
  $$select count(*)::integer from public.user_data$$,
  $$values (1)$$,
  'user B sees only own user_data rows'
);

select is(
  pg_temp.affected($$update public.user_data set value = '1'
    where user_id = '11111111-1111-1111-1111-111111111111'$$),
  0,
  'user B cannot update user A rows'
);

select is(
  pg_temp.affected($$delete from public.user_data
    where user_id = '11111111-1111-1111-1111-111111111111'$$),
  0,
  'user B cannot delete user A rows'
);

select throws_ok(
  $$insert into public.user_data (user_id, key, value) values
    ('11111111-1111-1111-1111-111111111111', 'w150.plan', '{}')$$,
  '42501', null,
  'user B cannot insert rows for user A'
);

select results_eq(
  $$select ok, version from public.put_user_data('w150.sessions', '["b"]', null)$$,
  $$values (true, 1)$$,
  'put_user_data as B writes B''s own row'
);

select results_eq(
  $$select count(*)::integer from public.profiles$$,
  $$values (1)$$,
  'user B sees only own profile'
);

select throws_ok(
  $$insert into public.profiles (username, user_id, display_name) values
    ('hacker', '22222222-2222-2222-2222-222222222222', 'Hacker')$$,
  '42501', null,
  'user B cannot insert into profiles'
);

select throws_ok(
  $$update public.profiles set username = 'zzz'
    where user_id = '22222222-2222-2222-2222-222222222222'$$,
  '42501', null,
  'user B cannot change username'
);

select is(
  pg_temp.affected($$update public.profiles set display_name = 'Bams'
    where user_id = '22222222-2222-2222-2222-222222222222'$$),
  1,
  'user B can change own display name'
);

select is(
  pg_temp.affected($$update public.profiles set display_name = 'Owned'
    where user_id = '11111111-1111-1111-1111-111111111111'$$),
  0,
  'user B cannot change user A display name'
);

select throws_ok(
  $$delete from public.profiles where user_id = '22222222-2222-2222-2222-222222222222'$$,
  '42501', null,
  'user B cannot delete profiles'
);

select throws_ok(
  $$select count(*) from public.auth_attempts$$,
  '42501', null,
  'authenticated cannot read auth_attempts'
);

reset role;

-- user A rows untouched by B
select results_eq(
  $$select version, value from public.user_data
    where user_id = '11111111-1111-1111-1111-111111111111' and key = 'w150.sessions'$$,
  $$values (2, '[{"id":"s1"}]'::jsonb)$$,
  'user A sessions are unchanged after user B actions'
);

-- ---------------------------------------------------------------- anon
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select throws_ok(
  $$select count(*) from public.user_data$$,
  '42501', null,
  'anon cannot read user_data'
);

select throws_ok(
  $$select count(*) from public.auth_attempts$$,
  '42501', null,
  'anon cannot read auth_attempts'
);

reset role;

select * from finish();
rollback;
