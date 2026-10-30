begin;

-- 기업 공통 가림 단어 탐지 건수를 기존 기록과 같은 형태로 저장할 수 있게 한다.
alter table public.rules drop constraint if exists rules_known_id;
alter table public.rules add constraint rules_known_id
  check (id in ('rrn', 'phone', 'email', 'card', 'name', 'address', 'account', 'custom'));

insert into public.rules (id, name) values ('custom', 'custom')
  on conflict (id) do nothing;

create table public.custom_words (
  id uuid primary key default gen_random_uuid(),
  word text not null check (length(btrim(word)) > 0 and length(word) <= 100),
  created_at timestamptz not null default now()
);

comment on table public.custom_words is '관리자가 등록한 기업 공통 가림 단어. 직원과 관리자의 결과에 강제로 가려진다.';

-- 영문 대소문자만 다른 단어는 같은 단어로 보고 중복 등록을 막는다.
create unique index custom_words_word_lower_idx on public.custom_words (lower(word));

alter table public.custom_words enable row level security;

revoke all on public.custom_words from public, anon, authenticated;
grant select, delete on public.custom_words to authenticated;
grant insert (word) on public.custom_words to authenticated;
grant all on public.custom_words to service_role;

create policy custom_words_read_authenticated
on public.custom_words for select to authenticated
using (true);

create policy custom_words_insert_admin
on public.custom_words for insert to authenticated
with check ((select private.is_admin()));

create policy custom_words_delete_admin
on public.custom_words for delete to authenticated
using ((select private.is_admin()));

commit;
