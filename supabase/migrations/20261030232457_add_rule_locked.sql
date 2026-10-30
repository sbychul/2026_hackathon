begin;

-- 관리자가 기본 탐지 룰마다 기업 사용자의 가림을 강제할지 정한다. 기존 동작과 같도록 처음에는 모두 고정한다.
alter table public.rules add column if not exists locked boolean not null default true;

comment on column public.rules.locked is 'true면 기업 사용자가 해제할 수 없고, false면 항목별로 해제할 수 있다. 공통 단어(custom)는 화면에서 항상 고정한다.';

grant update (locked) on public.rules to authenticated;

create policy rules_update_locked_admin
on public.rules for update to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

commit;
