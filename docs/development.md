# 개발 문서

## 실행

```bash
npm install
npm run dev     # 개발 서버
npm test        # 테스트 (Vitest)
npm run build   # 타입 검사 + 빌드
npm run lint    # 린트 (oxlint)
```

## 로컬 수파베이스

도커 데스크톱을 실행한 뒤 저장소 루트에서 아래 명령을 실행한다. 처음에는 공식 이미지 다운로드에 시간이 걸린다.
자세한 실행 방식은 [공식 로컬 개발 안내](https://supabase.com/docs/guides/local-development)를 참고한다.

```powershell
npx --yes supabase start
```

- 로컬 관리 화면: `http://127.0.0.1:54323`
- 로컬 접속 주소: `http://127.0.0.1:54321`
- 처음 시작할 때 `supabase/migrations/`의 변경을 순서대로 적용한다. 시연용 시드는 계정을 만든 뒤 별도로 실행한다.
- `.env.local`에 로컬 주소와 로컬 공개 키만 설정한다. 기존 `.env`보다 우선하며 두 파일 모두 커밋하지 않는다. 관리용 키는 프론트 설정에 넣지 않는다.
- 기존 로컬 데이터에 새 변경을 적용할 때는 `npx --yes supabase migration up --local`을 실행한다. `db reset`은 데이터를 지우므로 사용하지 않는다.
- 중지할 때는 `npx --yes supabase stop`을 실행한다. 클라우드 프로젝트 연결이나 변경은 필요하지 않다.

접근 제한 검증은 실행 중인 로컬 데이터베이스에서 아래처럼 실행한다. 검증용 계정과 기록은 마지막에 되돌린다.

```powershell
Get-Content -Raw supabase/tests/rls.sql | docker exec -i supabase_db_2026_hackathon psql -U postgres -v ON_ERROR_STOP=1
```

다른 작업 폴더가 저장소 안에 있다면 현재 브랜치 테스트만 다음과 같이 실행한다.

```powershell
npx vitest run --exclude '**/.worktrees/**'
```

## 구조

```
src/
  rules/rules.ts        탐지 룰 정의 (주민등록번호, 전화번호, 이메일, 카드번호, 이름, 주소, 계좌번호)
  masking/detect.ts     텍스트 → 탐지 구간 목록 (위치만, 실제 값은 담지 않음)
  masking/mask.ts       원문 + 선택한 구간 → 가림 문자로 바꾼 새 문자열
```

- 룰 id(`rrn`, `phone`, `email`, `card`, `name`, `address`, `account`)는 Supabase `rules` 테이블의 룰 이름과 같게 맞춘다.
- 카드번호는 룬(Luhn) 체크섬을 검사한다. 샘플 데이터의 가짜 카드번호도 체크섬을 통과하는 값으로 만든다. (예: `4111-1111-1111-1111`)
- 화면(`pages/`), 공통 컴포넌트(`components/`), Supabase 클라이언트(`lib/`)는 해당 이슈에서 추가한다.

## 규칙

- 작업 규칙은 `AGENTS.md`를 따른다.
- 파일, 텍스트 원문, 탐지된 실제 값은 서버에 저장하거나 로그로 남기지 않는다.
- `.env`는 커밋하지 않는다. 프론트에는 Supabase 공개용(anon) 키만 쓴다.
