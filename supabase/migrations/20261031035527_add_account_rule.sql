begin;

-- 기존 룰을 유지하면서 계좌번호 룰과 탐지 기록 저장을 허용한다.
alter table public.rules drop constraint if exists rules_known_id;
-- 공통 단어 마이그레이션(20261030223129)이 파일 순서상 먼저 실행되므로 custom도 함께 허용한다.
alter table public.rules add constraint rules_known_id
  check (id in ('rrn', 'phone', 'email', 'card', 'name', 'address', 'account', 'custom'));

insert into public.rules (id, name) values ('account', 'account')
  on conflict (id) do nothing;

commit;
