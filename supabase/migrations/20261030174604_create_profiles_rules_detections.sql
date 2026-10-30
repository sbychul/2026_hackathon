begin;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  role text not null default 'employee' check (role in ('employee', 'admin'))
);

create table public.rules (
  id text primary key,
  name text not null unique,
  enabled boolean not null default true,
  constraint rules_known_id check (id in ('rrn', 'phone', 'email', 'card', 'name', 'address')),
  constraint rules_name_matches_id check (name = id)
);

create table public.detections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  rule_id text not null references public.rules (id),
  count integer not null check (count > 0),
  input_type text not null check (input_type in ('text', 'pdf')),
  created_at timestamptz not null default now()
);

comment on column public.profiles.role is '직원은 employee, 관리자는 admin. 관리자 지정은 관리 경로에서만 한다.';
comment on table public.detections is '룰별 건수만 보관한다. 문서 원문과 탐지된 실제 값은 보관하지 않는다.';
comment on column public.detections.input_type is '텍스트는 text, PDF는 pdf.';
comment on column public.rules.name is '화면 표시명이 아니라 src/rules/rules.ts의 룰 식별자와 일치한다.';

create index detections_user_id_created_at_idx on public.detections (user_id, created_at desc);
create index detections_rule_id_idx on public.detections (rule_id);

insert into public.rules (id, name) values
  ('rrn', 'rrn'),
  ('phone', 'phone'),
  ('email', 'email'),
  ('card', 'card'),
  ('name', 'name'),
  ('address', 'address');

-- 관리 권한 확인 함수는 외부 API에 노출되지 않는 스키마에 둔다.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

-- 현재 사용자의 저장된 역할을 확인하여 프로필 정책의 재귀 호출을 피한다.
create function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

revoke all on function private.is_admin() from public, anon, authenticated;
grant execute on function private.is_admin() to authenticated;

-- 가입 시 이름만 읽고 역할은 메타데이터와 무관하게 직원으로 고정한다.
create function private.create_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, name, role)
  values (new.id, coalesce(nullif(btrim(new.raw_user_meta_data ->> 'name'), ''), '직원'), 'employee');
  return new;
end;
$$;

revoke all on function private.create_profile() from public, anon, authenticated;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.create_profile();

-- 이미 만들어진 계정도 같은 직원 기본값으로 프로필을 만든다.
insert into public.profiles (id, name, role)
select id, coalesce(nullif(btrim(raw_user_meta_data ->> 'name'), ''), '직원'), 'employee'
from auth.users;

alter table public.profiles enable row level security;
alter table public.rules enable row level security;
alter table public.detections enable row level security;

-- 기본 테이블 권한을 먼저 회수해야 열 단위 역할 변경 제한이 유효하다.
revoke all on public.profiles, public.rules, public.detections from public, anon, authenticated;
grant select on public.profiles, public.rules, public.detections to authenticated;
grant update (name) on public.profiles to authenticated;
-- 식별자와 생성 시각은 데이터베이스가 생성하며 호출자가 조작할 수 없다.
grant insert (user_id, rule_id, count, input_type) on public.detections to authenticated;
grant all on public.profiles, public.rules, public.detections to service_role;

create policy profiles_read_self_or_admin
on public.profiles for select to authenticated
using (id = (select auth.uid()) or (select private.is_admin()));

create policy profiles_update_own_name
on public.profiles for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

create policy rules_read_authenticated
on public.rules for select to authenticated
using (true);

create policy detections_read_self_or_admin
on public.detections for select to authenticated
using (user_id = (select auth.uid()) or (select private.is_admin()));

create policy detections_insert_self
on public.detections for insert to authenticated
with check (user_id = (select auth.uid()));

-- 탐지 기록 수정·삭제 정책과 권한은 직원 및 관리자 모두에게 주지 않는다.
commit;
