begin;

-- 기존 룰을 유지하면서 계좌번호 룰과 탐지 기록 저장을 허용한다.
alter table public.rules drop constraint if exists rules_known_id;
alter table public.rules add constraint rules_known_id
  check (id in ('rrn', 'phone', 'email', 'card', 'name', 'address', 'account'));

insert into public.rules (id, name) values ('account', 'account')
  on conflict (id) do nothing;

commit;
