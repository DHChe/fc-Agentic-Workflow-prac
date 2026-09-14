# Step 9: csv-export

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `docs/PRD.md` — 핵심 기능 8, MVP 제외(행 단위 내보내기 없음)
- `docs/USER_FLOWS.md` — 10절 UC-26
- `docs/UI_GUIDE.md` — 버튼(secondary), 아이콘
- `src/types/analysis.ts` — `AnalysisSummary`, `DocumentType`
- `src/lib/utils/format.ts`
- `src/app/(app)/dashboard/page.tsx`, `src/components/dashboard/analysis-list.tsx` (step 6, 7)
- `src/components/ui/button.tsx`

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 작업

### 1. 순수 함수 `src/lib/csv.ts`

```ts
export const CSV_HEADERS = ['일자', '유형', '가맹점', '카테고리', '금액', '통화', '파일명', '생성일시'] as const
export function analysesToCsv(items: AnalysisSummary[]): string
```

규칙:
- 첫 글자는 UTF-8 BOM(`﻿`). 이유: Excel이 한글을 깨뜨리지 않게.
- RFC 4180: 셀에 쉼표·큰따옴표·줄바꿈이 있으면 큰따옴표로 감싸고 내부 큰따옴표는 두 번 쓴다. 행 구분은 `\r\n`.
- 유형은 한국어(`receipt`→영수증, `card_statement`→카드명세서, `unknown`→미분류). 금액은 숫자 그대로(천 단위 구분 없음). `null`은 빈 셀. 생성일시는 `formatDateTime`.
- 분석 1건 = 1행. 품목·거래는 포함하지 않는다.
- 수식 주입 방지: 텍스트 셀(가맹점, 파일명)이 `=`, `+`, `-`, `@`, 탭, CR로 시작하면 앞에 작은따옴표(`'`)를 붙인다. 금액 셀은 숫자이므로 적용하지 않는다. 이유: 가맹점명은 외부 문서에서 온 값이라 Excel이 수식으로 실행할 수 있다.

### 2. 버튼 `src/components/dashboard/export-csv-button.tsx` (`'use client'`)

```ts
export function ExportCsvButton(props: { items: AnalysisSummary[] }): React.JSX.Element
```

- secondary 스타일, lucide `Download`, 라벨 "CSV 내보내기". `items`가 비면 `disabled`.
- 클릭 → `analysesToCsv(items)` → `new Blob([csv], { type: 'text/csv;charset=utf-8' })` → `URL.createObjectURL` → 임시 `<a download="slipscan-YYYYMMDD.csv">`를 클릭 → `URL.revokeObjectURL`. 날짜는 오늘(Asia/Seoul).

### 3. 연결

- `src/app/(app)/dashboard/page.tsx`: "분석 내역" 섹션 제목 줄을 `flex items-baseline justify-between`으로 바꾸고 우측에 `<ExportCsvButton items={items} />`.

### 4. 테스트 (먼저 작성)

- `src/lib/csv.test.ts`: 2건 → 헤더 1행 + 데이터 2행, 문자열이 `﻿`로 시작, 가맹점 `"이마트, 성수점"`이 큰따옴표로 감싸이고 내부 따옴표가 이중화됨, 가맹점 `=SUM(A1)`이 `'=SUM(A1)`으로 시작함, 금액 `-5000`은 그대로, `null` 카테고리가 빈 셀, `receipt`가 `영수증`으로, 행 구분이 `\r\n`.
- `src/components/dashboard/export-csv-button.test.tsx`: `URL.createObjectURL`·`revokeObjectURL`을 `vi.stubGlobal`로 대체. 클릭 → `createObjectURL`이 `text/csv` Blob으로 호출되고 `download` 속성이 `/^slipscan-\d{8}\.csv$/`. `items`가 비면 `disabled`.

## Acceptance Criteria

```bash
npm run lint
npm run build
npm run test
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 데이터 흐름(서버가 목록을 props로, 클라이언트가 생성)을 따르는가?
   - ADR 기술 스택을 벗어나지 않았는가? (CSV 라이브러리 없음)
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/0-mvp/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- CSV를 만드는 API 라우트를 추가하지 마라. 이유: 데이터는 이미 서버 컴포넌트가 조회해 넘긴다.
- 품목·거래를 행으로 펼치지 마라. 이유: PRD MVP 제외.
- 외부 CSV 라이브러리를 설치하지 마라. 이유: 규칙이 단순해 40줄이면 충분하다.
- xlsx 형식을 만들지 마라. 이유: PRD MVP 제외.
- 기존 테스트를 깨뜨리지 마라.
