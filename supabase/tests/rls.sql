-- 관리자 연결에서 실행한다. 검증용 계정과 기록은 마지막에 전부 되돌린다.
-- psql 전용 검증 파일이다. pgTAP 형식이 아니므로 supabase test db로 실행하지 않는다.
-- 실행 예: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls.sql
\set ON_ERROR_STOP on
begin;

-- 실패해야 할 구문이 지정한 오류로 거부되는지 검사한다.
create function pg_temp.expect_error(statement text, expected_state text)
returns void
language plpgsql
as $$
declare
  actual_state text;
begin
  begin
    execute statement;
  exception when others then
    get stacked diagnostics actual_state = returned_sqlstate;
    if actual_state <> expected_state then
      raise exception '예상 오류 %, 실제 오류 %: %', expected_state, actual_state, statement;
    end if;
    return;
  end;
  raise exception '차단되어야 할 구문이 실행됨: %', statement;
end;
$$;

insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000000601', '{"name":"검증 직원 가","role":"admin"}'),
  ('00000000-0000-4000-8000-000000000602', '{"name":"검증 직원 나"}'),
  ('00000000-0000-4000-8000-000000000603', '{"name":"검증 관리자"}');

do $$
begin
  assert (select role = 'employee' from public.profiles where id = '00000000-0000-4000-8000-000000000601'),
    '가입 메타데이터로 관리자 역할을 얻으면 안 됨';
  assert (select array_agg(name order by name) = array['account', 'address', 'card', 'email', 'name', 'phone', 'rrn'] from public.rules),
    '기본 룰 일곱 개가 정확히 일치해야 함';
  assert (select bool_and(enabled and id = name) from public.rules), '기본 룰은 켜져 있고 이름과 식별자가 같아야 함';
  assert (select array_agg(column_name::text order by ordinal_position)
    = array['id', 'user_id', 'rule_id', 'count', 'input_type', 'created_at']
    from information_schema.columns where table_schema = 'public' and table_name = 'detections'),
    '탐지 기록에는 원문이나 실제 값 컬럼이 없어야 함';
end;
$$;

-- 실제 관리자 지정은 신뢰할 수 있는 관리 연결로만 수행한다.
update public.profiles set role = 'admin' where id = '00000000-0000-4000-8000-000000000603';
insert into public.detections (user_id, rule_id, count, input_type) values
  ('00000000-0000-4000-8000-000000000601', 'phone', 1, 'text'),
  ('00000000-0000-4000-8000-000000000602', 'address', 2, 'pdf');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000601';
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000601","role":"authenticated"}';

do $$
begin
  assert current_user = 'authenticated', '검증은 관리자 데이터베이스 역할로 실행하면 안 됨';
  assert not (select rolbypassrls from pg_roles where rolname = current_user), '행 보안을 우회하면 안 됨';
  assert (select count(*) = 1 from public.detections), '직원에게 자기 기록만 보여야 함';
  assert not exists (select 1 from public.detections where user_id = '00000000-0000-4000-8000-000000000602'),
    '다른 직원의 기록 조회는 빈 결과여야 함';
  assert (select count(*) = 1 from public.profiles), '직원에게 다른 프로필이 보이면 안 됨';
  assert not private.is_admin(), '직원은 관리자가 아님';
end;
$$;

insert into public.detections (user_id, rule_id, count, input_type)
values ('00000000-0000-4000-8000-000000000601', 'account', 3, 'pdf');
update public.profiles set name = '검증 직원 이름 수정' where id = '00000000-0000-4000-8000-000000000601';

select pg_temp.expect_error($q$insert into public.detections (user_id, rule_id, count, input_type)
  values ('00000000-0000-4000-8000-000000000602', 'phone', 1, 'text')$q$, '42501');
select pg_temp.expect_error($q$update public.detections set count = 99$q$, '42501');
select pg_temp.expect_error($q$delete from public.detections$q$, '42501');
select pg_temp.expect_error($q$truncate public.detections$q$, '42501');
select pg_temp.expect_error($q$update public.profiles set role = 'admin'
  where id = '00000000-0000-4000-8000-000000000601'$q$, '42501');
select pg_temp.expect_error($q$update public.profiles set id = '00000000-0000-4000-8000-000000000602'
  where id = '00000000-0000-4000-8000-000000000601'$q$, '42501');
select pg_temp.expect_error($q$insert into public.profiles (id, name, role)
  values ('00000000-0000-4000-8000-000000000601', '검증', 'admin')
  on conflict (id) do update set role = 'admin'$q$, '42501');
select pg_temp.expect_error($q$delete from public.profiles$q$, '42501');
select pg_temp.expect_error($q$update public.rules set enabled = false$q$, '42501');
select pg_temp.expect_error($q$insert into public.detections (user_id, rule_id, count, input_type)
  values ('00000000-0000-4000-8000-000000000601', 'phone', 0, 'text')$q$, '23514');
select pg_temp.expect_error($q$insert into public.detections (user_id, rule_id, count, input_type)
  values ('00000000-0000-4000-8000-000000000601', 'phone', -1, 'text')$q$, '23514');
select pg_temp.expect_error($q$insert into public.detections (user_id, rule_id, count, input_type)
  values ('00000000-0000-4000-8000-000000000601', 'phone', 1, 'other')$q$, '23514');
select pg_temp.expect_error($q$insert into public.detections (user_id, rule_id, count, input_type)
  values ('00000000-0000-4000-8000-000000000601', 'unknown', 1, 'text')$q$, '23503');
select pg_temp.expect_error($q$insert into public.detections (user_id, rule_id, count, input_type, created_at)
  values ('00000000-0000-4000-8000-000000000601', 'phone', 1, 'text', '2000-01-01')$q$, '42501');

set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000603';
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000603","role":"authenticated"}';

do $$
begin
  assert private.is_admin(), '관리자 역할을 데이터베이스에서 확인해야 함';
  assert (select count(*) = 3 from public.detections
    where user_id in ('00000000-0000-4000-8000-000000000601', '00000000-0000-4000-8000-000000000602')),
    '관리자는 두 직원의 기록 세 개를 조회해야 함';
  assert (select count(*) = 3 from public.profiles
    where id in ('00000000-0000-4000-8000-000000000601', '00000000-0000-4000-8000-000000000602', '00000000-0000-4000-8000-000000000603')),
    '관리자는 통계 표시용 직원 이름을 조회해야 함';
end;
$$;

insert into public.detections (user_id, rule_id, count, input_type)
values ('00000000-0000-4000-8000-000000000603', 'email', 1, 'text');
select pg_temp.expect_error($q$insert into public.detections (user_id, rule_id, count, input_type)
  values ('00000000-0000-4000-8000-000000000601', 'phone', 1, 'text')$q$, '42501');
select pg_temp.expect_error($q$update public.detections set count = 99$q$, '42501');
select pg_temp.expect_error($q$delete from public.detections$q$, '42501');
select pg_temp.expect_error($q$update public.profiles set role = 'admin'
  where id = '00000000-0000-4000-8000-000000000602'$q$, '42501');

set local request.jwt.claim.sub = '';
set local request.jwt.claims = '{"role":"authenticated"}';
do $$
begin
  assert not exists (select 1 from public.profiles), '사용자 식별자가 없으면 프로필을 읽으면 안 됨';
  assert not exists (select 1 from public.detections), '사용자 식별자가 없으면 기록을 읽으면 안 됨';
end;
$$;
select pg_temp.expect_error($q$insert into public.detections (user_id, rule_id, count, input_type)
  values ('00000000-0000-4000-8000-000000000601', 'phone', 1, 'text')$q$, '42501');

set local role anon;
set local request.jwt.claim.sub = '';
set local request.jwt.claims = '{"role":"anon"}';
select pg_temp.expect_error($q$select * from public.detections$q$, '42501');
select pg_temp.expect_error($q$select * from public.profiles$q$, '42501');
select pg_temp.expect_error($q$insert into public.detections (user_id, rule_id, count, input_type)
  values ('00000000-0000-4000-8000-000000000601', 'phone', 1, 'text')$q$, '42501');

reset role;

-- 관리 경로에서 계정을 지우면 해당 프로필과 기록만 연쇄 삭제되는지 검사한다.
delete from auth.users where id = '00000000-0000-4000-8000-000000000601';
do $$
begin
  assert not exists (select 1 from public.profiles where id = '00000000-0000-4000-8000-000000000601'),
    '삭제된 계정의 프로필이 남으면 안 됨';
  assert not exists (select 1 from public.detections where user_id = '00000000-0000-4000-8000-000000000601'),
    '삭제된 계정의 탐지 기록이 남으면 안 됨';
  assert (select count(*) = 1 from public.detections where user_id = '00000000-0000-4000-8000-000000000602'),
    '다른 직원의 기록을 삭제하면 안 됨';
  assert (select count(*) = 1 from public.detections where user_id = '00000000-0000-4000-8000-000000000603'),
    '관리자의 기록을 삭제하면 안 됨';
end;
$$;
rollback;
\echo '접근 제한 검증 통과. 검증용 계정과 기록은 되돌렸습니다.'
