-- 시연용 가짜 기록 시드. 이름, 이메일, 건수는 모두 가짜이며 실제 개인정보를 쓰지 않는다.
--
-- 사용 순서
--   1. Supabase 대시보드 Authentication > Users에서 아래 계정을 먼저 만든다. (Auto Confirm User 체크)
--      관리자 1명(admin@example.com)과 직원 최대 8명(employee01~08@example.com)이다.
--      비밀번호는 이 파일과 깃에 적지 않고 팀 내부 채널로만 공유한다.
--   2. 대시보드 SQL Editor에 이 파일 전체를 붙여넣어 실행한다. (관리자 연결로 실행된다)
--   3. 마지막에 계정별 이름, 역할, 총 탐지 건수 표가 나오면 성공이다.
--
-- 여러 번 실행해도 같은 결과가 된다. 시연 계정의 탐지 기록만 지우고 다시 넣으며, 다른 계정은 건드리지 않는다.
-- 직원 계정은 일부만 만들어도 된다. 없는 계정은 건너뛰고 알림만 남긴다.

begin;

-- 시연 계정 목록. 이메일로 auth.users를 찾아 연결하므로 고유 번호를 적지 않는다.
create temp table demo_users (
  email text primary key,
  name text not null,
  role text not null
) on commit drop;

insert into demo_users (email, name, role) values
    ('admin@example.com', '오세린', 'admin'),
    ('employee01@example.com', '김가람', 'employee'),
    ('employee02@example.com', '이서준', 'employee'),
    ('employee03@example.com', '박하늘', 'employee'),
    ('employee04@example.com', '최도윤', 'employee'),
    ('employee05@example.com', '정유나', 'employee'),
    ('employee06@example.com', '강민재', 'employee'),
    ('employee07@example.com', '조예린', 'employee'),
    ('employee08@example.com', '윤지호', 'employee');

-- 시연 탐지 기록 계획. (이메일, 룰, 걸린 건수, 입력 방식, 며칠 전, 몇 시)
-- 마스킹 1번에 룰마다 한 줄씩 들어가므로 같은 날짜와 시각이 한 번의 마스킹이다.
create temp table demo_plan (
  email text not null,
  rule_id text not null,
  count integer not null,
  input_type text not null,
  days_ago integer not null,
  hour integer not null
) on commit drop;

insert into demo_plan (email, rule_id, count, input_type, days_ago, hour) values
    ('employee01@example.com', 'email', 5, 'text', 2, 14),
    ('employee01@example.com', 'phone', 5, 'text', 2, 14),
    ('employee01@example.com', 'card', 3, 'text', 2, 14),
    ('employee01@example.com', 'email', 4, 'text', 3, 18),
    ('employee01@example.com', 'phone', 5, 'text', 3, 18),
    ('employee01@example.com', 'name', 4, 'text', 3, 18),
    ('employee01@example.com', 'rrn', 3, 'text', 3, 18),
    ('employee01@example.com', 'email', 1, 'text', 4, 12),
    ('employee01@example.com', 'phone', 1, 'text', 4, 12),
    ('employee01@example.com', 'name', 5, 'text', 4, 12),
    ('employee01@example.com', 'rrn', 4, 'text', 4, 12),
    ('employee01@example.com', 'email', 2, 'text', 5, 11),
    ('employee01@example.com', 'name', 1, 'text', 5, 11),
    ('employee01@example.com', 'rrn', 1, 'text', 5, 11),
    ('employee01@example.com', 'address', 4, 'text', 5, 11),
    ('employee01@example.com', 'phone', 3, 'pdf', 5, 14),
    ('employee01@example.com', 'name', 4, 'pdf', 5, 14),
    ('employee01@example.com', 'rrn', 6, 'pdf', 5, 14),
    ('employee01@example.com', 'email', 5, 'text', 6, 10),
    ('employee01@example.com', 'name', 1, 'text', 6, 10),
    ('employee01@example.com', 'email', 1, 'text', 7, 14),
    ('employee01@example.com', 'phone', 2, 'text', 7, 14),
    ('employee01@example.com', 'rrn', 4, 'text', 7, 14),
    ('employee01@example.com', 'address', 4, 'text', 7, 14),
    ('employee01@example.com', 'email', 3, 'text', 8, 13),
    ('employee01@example.com', 'phone', 6, 'text', 8, 13),
    ('employee01@example.com', 'address', 4, 'text', 8, 13),
    ('employee01@example.com', 'email', 4, 'text', 10, 10),
    ('employee01@example.com', 'name', 6, 'text', 10, 10),
    ('employee01@example.com', 'rrn', 3, 'text', 10, 10),
    ('employee01@example.com', 'card', 1, 'text', 10, 10),
    ('employee02@example.com', 'email', 1, 'text', 3, 11),
    ('employee02@example.com', 'name', 4, 'text', 3, 11),
    ('employee02@example.com', 'phone', 6, 'text', 4, 10),
    ('employee02@example.com', 'rrn', 2, 'text', 4, 10),
    ('employee02@example.com', 'email', 5, 'text', 7, 11),
    ('employee02@example.com', 'name', 1, 'text', 7, 11),
    ('employee02@example.com', 'address', 1, 'text', 7, 11),
    ('employee02@example.com', 'phone', 3, 'text', 8, 9),
    ('employee02@example.com', 'name', 6, 'text', 8, 9),
    ('employee02@example.com', 'rrn', 1, 'text', 8, 9),
    ('employee02@example.com', 'address', 6, 'text', 8, 9),
    ('employee02@example.com', 'email', 1, 'text', 9, 9),
    ('employee02@example.com', 'phone', 2, 'text', 9, 9),
    ('employee02@example.com', 'name', 1, 'text', 9, 9),
    ('employee02@example.com', 'rrn', 2, 'text', 9, 9),
    ('employee02@example.com', 'email', 4, 'pdf', 13, 12),
    ('employee02@example.com', 'phone', 4, 'pdf', 13, 12),
    ('employee02@example.com', 'rrn', 4, 'pdf', 13, 12),
    ('employee02@example.com', 'email', 2, 'text', 13, 18),
    ('employee02@example.com', 'phone', 6, 'text', 13, 18),
    ('employee02@example.com', 'name', 5, 'text', 13, 18),
    ('employee03@example.com', 'email', 3, 'text', 5, 9),
    ('employee03@example.com', 'phone', 4, 'text', 5, 9),
    ('employee03@example.com', 'name', 6, 'text', 5, 9),
    ('employee03@example.com', 'email', 3, 'text', 5, 14),
    ('employee03@example.com', 'phone', 2, 'text', 5, 14),
    ('employee03@example.com', 'phone', 6, 'pdf', 7, 18),
    ('employee03@example.com', 'name', 1, 'pdf', 7, 18),
    ('employee03@example.com', 'email', 5, 'pdf', 10, 12),
    ('employee03@example.com', 'rrn', 4, 'pdf', 10, 12),
    ('employee03@example.com', 'email', 4, 'text', 13, 10),
    ('employee03@example.com', 'phone', 4, 'text', 13, 10),
    ('employee03@example.com', 'rrn', 4, 'text', 13, 10),
    ('employee03@example.com', 'card', 6, 'text', 13, 10),
    ('employee03@example.com', 'email', 5, 'pdf', 13, 13),
    ('employee03@example.com', 'phone', 5, 'pdf', 13, 13),
    ('employee03@example.com', 'address', 3, 'pdf', 13, 13),
    ('employee04@example.com', 'email', 4, 'text', 1, 11),
    ('employee04@example.com', 'name', 6, 'text', 1, 11),
    ('employee04@example.com', 'phone', 2, 'pdf', 1, 17),
    ('employee04@example.com', 'address', 1, 'pdf', 1, 17),
    ('employee04@example.com', 'email', 1, 'pdf', 2, 18),
    ('employee04@example.com', 'phone', 6, 'pdf', 2, 18),
    ('employee04@example.com', 'name', 6, 'pdf', 2, 18),
    ('employee04@example.com', 'email', 3, 'text', 4, 12),
    ('employee04@example.com', 'phone', 4, 'text', 4, 12),
    ('employee04@example.com', 'name', 6, 'text', 4, 12),
    ('employee04@example.com', 'address', 5, 'text', 4, 12),
    ('employee04@example.com', 'email', 5, 'text', 13, 17),
    ('employee04@example.com', 'phone', 1, 'text', 13, 17),
    ('employee04@example.com', 'rrn', 2, 'text', 13, 17),
    ('employee04@example.com', 'address', 2, 'text', 13, 17),
    ('employee05@example.com', 'email', 1, 'text', 2, 15),
    ('employee05@example.com', 'phone', 2, 'text', 2, 15),
    ('employee05@example.com', 'name', 6, 'text', 2, 15),
    ('employee05@example.com', 'email', 5, 'pdf', 2, 16),
    ('employee05@example.com', 'phone', 1, 'pdf', 2, 16),
    ('employee05@example.com', 'name', 2, 'pdf', 2, 16),
    ('employee05@example.com', 'rrn', 2, 'pdf', 2, 16),
    ('employee05@example.com', 'email', 5, 'text', 4, 9),
    ('employee05@example.com', 'phone', 5, 'text', 4, 9),
    ('employee05@example.com', 'address', 2, 'text', 4, 9),
    ('employee05@example.com', 'card', 6, 'text', 4, 9),
    ('employee05@example.com', 'email', 3, 'pdf', 4, 16),
    ('employee05@example.com', 'phone', 5, 'pdf', 4, 16),
    ('employee05@example.com', 'rrn', 2, 'pdf', 4, 16),
    ('employee05@example.com', 'address', 4, 'pdf', 4, 16),
    ('employee06@example.com', 'email', 4, 'text', 2, 12),
    ('employee06@example.com', 'phone', 6, 'text', 2, 12),
    ('employee06@example.com', 'name', 1, 'text', 2, 12),
    ('employee06@example.com', 'rrn', 4, 'text', 2, 12),
    ('employee06@example.com', 'email', 2, 'pdf', 5, 17),
    ('employee06@example.com', 'phone', 1, 'pdf', 5, 17),
    ('employee06@example.com', 'card', 1, 'pdf', 5, 17),
    ('employee06@example.com', 'email', 1, 'text', 10, 14),
    ('employee06@example.com', 'address', 4, 'text', 10, 14),
    ('employee06@example.com', 'card', 4, 'text', 10, 14),
    ('employee07@example.com', 'email', 6, 'text', 4, 13),
    ('employee07@example.com', 'phone', 3, 'text', 4, 13),
    ('employee07@example.com', 'email', 6, 'pdf', 6, 11),
    ('employee07@example.com', 'phone', 1, 'pdf', 6, 11),
    ('employee07@example.com', 'name', 3, 'pdf', 6, 11),
    ('employee07@example.com', 'address', 1, 'pdf', 6, 11),
    ('employee08@example.com', 'phone', 3, 'text', 9, 12),
    ('employee08@example.com', 'name', 5, 'text', 9, 12),
    ('employee08@example.com', 'address', 2, 'text', 9, 12);

-- 계정이 만들어져 있는지 확인한다. 관리자가 없거나 직원이 하나도 없으면 멈춘다.
do $$
declare
  missing text;
begin
  if not exists (
    select 1 from demo_users d join auth.users u on lower(u.email) = lower(d.email)
    where d.role = 'admin'
  ) then
    raise exception '관리자 계정(admin@example.com)이 없습니다. 대시보드 Authentication > Users에서 먼저 만드세요.';
  end if;

  if not exists (
    select 1 from demo_users d join auth.users u on lower(u.email) = lower(d.email)
    where d.role = 'employee'
  ) then
    raise exception '직원 계정이 하나도 없습니다. employee01@example.com 같은 계정을 먼저 만드세요.';
  end if;

  select string_agg(d.email, ', ' order by d.email) into missing
  from demo_users d
  where not exists (select 1 from auth.users u where lower(u.email) = lower(d.email));

  if missing is not null then
    raise notice '아직 만들지 않은 계정은 건너뜁니다: %', missing;
  end if;
end;
$$;

-- 프로필 이름과 역할을 채운다. 계정을 만들면 프로필은 직원 기본값으로 이미 생겨 있다.
update public.profiles p
set name = d.name, role = d.role
from demo_users d
join auth.users u on lower(u.email) = lower(d.email)
where p.id = u.id;

-- 다시 실행할 때 중복되지 않도록 시연 계정의 기존 탐지 기록을 지운다.
delete from public.detections
where user_id in (
  select u.id from demo_users d join auth.users u on lower(u.email) = lower(d.email)
);

-- 탐지 기록을 넣는다. 생성 시각은 현재 시각을 넘지 않게 맞춘다.
insert into public.detections (user_id, rule_id, count, input_type, created_at)
select
  u.id,
  p.rule_id,
  p.count,
  p.input_type,
  least(
    date_trunc('day', now()) - make_interval(days => p.days_ago) + make_interval(hours => p.hour),
    now()
  )
from demo_plan p
join auth.users u on lower(u.email) = lower(p.email);

commit;

-- 결과 확인: 계정별 이름, 역할, 마스킹 횟수, 총 탐지 건수
select
  pr.name as 이름,
  pr.role as 역할,
  count(distinct d.created_at) as 마스킹_횟수,
  coalesce(sum(d.count), 0) as 총_탐지_건수
from public.profiles pr
join auth.users u on u.id = pr.id
left join public.detections d on d.user_id = pr.id
where lower(u.email) = 'admin@example.com'
   or lower(u.email) like 'employee0_@example.com'
group by pr.id, pr.name, pr.role
order by 총_탐지_건수 desc, pr.name;
