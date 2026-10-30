# 개발 문서

## 실행

```bash
npm install
npm run dev     # 개발 서버
npm test        # 테스트 (Vitest)
npm run build   # 타입 검사 + 빌드
npm run lint    # 린트 (oxlint)
```

## 구조

```
src/
  rules/rules.ts        탐지 룰 정의 (주민등록번호, 전화번호, 이메일, 카드번호)
  masking/detect.ts     텍스트 → 탐지 구간 목록 (위치만, 실제 값은 담지 않음)
  masking/mask.ts       원문 + 선택한 구간 → 가림 문자로 바꾼 새 문자열
```

- 룰 id(`rrn`, `phone`, `email`, `card`)는 Supabase `rules` 테이블의 룰 이름과 같게 맞춘다.
- 카드번호는 룬(Luhn) 체크섬을 검사한다. 샘플 데이터의 가짜 카드번호도 체크섬을 통과하는 값으로 만든다. (예: `4111-1111-1111-1111`)
- 화면(`pages/`), 공통 컴포넌트(`components/`), Supabase 클라이언트(`lib/`)는 해당 이슈에서 추가한다.

## 규칙

- 작업 규칙은 `AGENTS.md`를 따른다.
- 파일, 텍스트 원문, 탐지된 실제 값은 서버에 저장하거나 로그로 남기지 않는다.
- `.env`는 커밋하지 않는다. 프론트에는 Supabase 공개용(anon) 키만 쓴다.
