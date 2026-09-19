# Step 1: shared-constants

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/USER_FLOWS.md` 7절 전체(7.1~7.9. 문구의 단일 출처)
- `/docs/design.md` 6.3(금액·숫자 표기), 10절(문구 톤), 12.1(랜딩 문구)
- `/docs/ARCHITECTURE.md` 6절의 "카테고리 키" 표, 8절(에러 응답 규약, 실패 원인 → 문구 표)
- `/AGENTS.md` (문구는 `lib/messages.ts` 한 곳, 날짜 경계는 `lib/stats/aggregate.ts` 한 곳)
- 이전 step이 만든 파일: `/package.json`, `/vitest.config.ts`, `/tsconfig.json`

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 작업

화면과 서버가 함께 쓰는 상수 세 파일을 만든다. 세 파일 모두 **테스트를 먼저 쓰고** 통과시키는 구현을 쓴다. 의존 패키지는 추가하지 않는다.

### 1. `lib/messages.ts`

```ts
export const MESSAGES = {
  empty:   { documents, stats, reports, detailNoTransactions, detailProcessing },        // USER_FLOWS 7.1
  upload:  { invalidType, tooLarge, failed },                                            // 7.2
  api:     { badRequest, unauthorized, documentNotFound, reportNotFound, limitReached, upstream, internal, demoLoginFailed }, // 7.3
  failure: { unreadable, unparsable, upstream, tooManyPages, encryptedPdf, timedOut, unknown }, // 7.4
  report:  { noTransactions, leaveWarning, interrupted, saved },                         // 7.5
  remove:  { confirm, processingDisabled, done },                                        // 7.6
  label:   { status: { processing, completed, failed }, badge: { amountMissing, dateEstimated, duplicate },
             placeholder /* "—" */, button: { demoLogin, signIn, upload, sample, createReport, copy, viewOriginal /* 원본 보기 */, openOriginal /* 원본 열기 */, signOut },
             usage: (used: number) => string /* "오늘 사용 n/50" */ },                  // 7.8
  landing: { title, features: [{ title, body } x3], notice1, notice2 },                  // 7.9 + design.md 12.1
  ui:      { /* 7절에 없는 화면 글자. 아래 고정 목록 */ }
} as const
export type FailureCode = keyof typeof MESSAGES.failure
```

키와 문장의 짝(문장은 USER_FLOWS 7절에서 글자 그대로 옮긴다. 마침표·괄호·가운뎃점까지 같아야 한다):

| 키 | 출처 |
|---|---|
| `empty.documents` / `stats` / `reports` / `detailNoTransactions` / `detailProcessing` | 7.1의 문서 목록 / 통계 / 보고서 목록 / 문서 상세(완료, 거래 0건) / 문서 상세(처리 중) |
| `upload.invalidType` / `tooLarge` / `failed` | 7.2의 형식 / 크기 / 업로드 실패 |
| `api.badRequest` / `unauthorized` / `limitReached` / `upstream` / `internal` / `demoLoginFailed` | 7.3의 400 / 401 / 429 / 502 / 500 / 시연 로그인 실패 |
| `api.documentNotFound`, `api.reportNotFound` | 7.3의 404 줄을 ` / `로 나눈 앞 문장, 뒤 문장 |
| `failure.unreadable` / `unparsable` / `upstream` / `tooManyPages` / `encryptedPdf` / `timedOut` / `unknown` | 7.4의 표 위에서부터 차례로 |
| `report.noTransactions` / `leaveWarning` / `interrupted` / `saved` | 7.5의 0건 / 이탈 경고 / 글이 오던 중 끊김 / 완료 |
| `remove.confirm` / `processingDisabled` / `done` | 7.6의 확인 대화 / 처리 중 / 완료 |
| `label.*` | 7.8(`[G-n]` 표기는 문장이 아니므로 뺀다). `usage(3)`은 `"오늘 사용 3/50"` |
| `landing.notice1`, `notice2` | 7.9의 1, 2 |
| `landing.title`, `landing.features` | design.md 12.1. 특징의 `title`은 굵은 글씨 부분, `body`는 줄표(—) 뒤 문장 |

`MESSAGES.ui` 고정 목록(키 이름은 뜻이 드러나게 정한다):

- 구획 제목: `업로드`, `월 통계`, `문서`, `보고서`
- 업로드 안내: `영수증 사진이나 카드 명세서 PDF를 선택해 주세요.`
- 업로드 제한: `JPG, PNG, PDF · 파일당 10MB · PDF는 20페이지까지`
- 업로드 뒤 안내: `올렸습니다. 분석이 끝나면 목록에 표시됩니다. 화면을 떠나도 됩니다.`
- 문서 종류: `영수증`, `카드명세서`, `기타`
- 문서 목록 열: `상태`, `종류`, `거래`, `합계`, `올린 시각`
- 거래 표 열: `거래일`, `가맹점`, `금액`, `카테고리`, `카드`
- 통계 표 열: `카테고리`, `금액`, `비율`
- 보고서 목록 열: `기간`, `만든 시각`
- `문서 합계`, 합계 기준: `추출된 금액의 합입니다. 중복으로 표시된 거래도 포함합니다.`
- 통계 기준: `금액 미인식과 중복 거래는 뺐습니다.`
- 건수: `(n: number) => "거래 n건"` 형태의 함수
- `사용 모델`, 돌아가기 `대시보드`, `삭제`, `취소`, `열기`
- 오류 화면 링크: `대시보드로 가기`, 없는 주소: `페이지를 찾을 수 없습니다.`
- 복사 뒤: `복사했습니다.`, 생성 중 제목: `보고서 작성 중`

뒤의 UI step이 글자가 더 필요하면 design.md 10절 말투로 `MESSAGES.ui`에 추가한다.

### 2. `lib/categories.ts`

```ts
export const CATEGORY_KEYS = ['food_welfare','transport_travel','entertainment_client','office_equipment','it_telecom','ads_outsourcing_education','rent_utilities_vehicle','other'] as const
export type CategoryKey = (typeof CATEGORY_KEYS)[number]
export const CATEGORY_LABELS: Record<CategoryKey, string>   // ARCH 6절 "카테고리 키" 표의 표시명 그대로
```

### 3. `lib/format.ts`

```ts
export function formatAmount(amount: number): string            // 1126600 → "1,126,600원", -8900 → "-8,900원", 0 → "0원"
export function formatRatio(ratio: number | null): string       // 0.366 → "36.6%", null → "—"
export function formatMonthLabel(month: string): string         // "2026-09" → "2026년 9월"
export function formatDateTime(d: Date | string): string        // 서울 시각 "2026.09.03 12:41"
export function formatDate(d: Date | string): string            // 서울 날짜 "2026.09.03"
```

ratio는 0~1 분수다(음수 가능). 소수 첫째 자리까지 쓴다. 날짜 표기는 `Intl.DateTimeFormat`의 `timeZone: 'Asia/Seoul'`로 한다. `null`의 표기는 `MESSAGES.label.placeholder`를 쓴다.

### 테스트 (먼저 쓴다)

- `lib/messages.test.ts`: `docs/USER_FLOWS.md`를 **파일로 읽어** `## 7.`부터 `## 8.` 앞까지를 자른다. 7.1~7.6과 7.9 표에서 문구 칸(마지막 칸)을 모으고, 404 줄은 ` / `로 나눈다. 모은 문장이 하나도 빠짐없이 `MESSAGES`의 (깊은) 문자열 값 중에 있는지 확인한다. 7.8 표는 값 칸을 ` · `로 나누고 `[G-n]`을 떼어 낸 뒤 같은 방식으로 확인하되, `오늘 사용 n/50`은 건너뛰고 대신 `MESSAGES.label.usage(3) === '오늘 사용 3/50'`을 확인한다. design.md 12.1의 제목도 `MESSAGES.landing.title`과 같은지 확인한다.
- `lib/categories.test.ts`: 키가 8개이고, 표시명이 ARCH 6절 표와 같다.
- `lib/format.test.ts`: `1126600 → "1,126,600원"`, `-8900 → "-8,900원"`, `0 → "0원"`, `0.366 → "36.6%"`, `null → "—"`, `"2026-09" → "2026년 9월"`, UTC 시각 `2026-09-02T15:30:00Z` → `formatDateTime`은 `"2026.09.03 00:30"`, `formatDate`는 `"2026.09.03"`.

### 핵심 규칙

- 문장은 글자 그대로 옮긴다. 서버가 `{ error }`로 주는 문장을 화면이 그대로 보여주고(ARCH 8절), `failure_reason`에는 `MESSAGES.failure`의 값이 그대로 저장된다.
- `lib/messages.ts`, `lib/categories.ts`, `lib/format.ts`는 서버와 브라우저가 함께 쓴다. 서버 전용 모듈(`fs`, DB, 환경변수)을 import하지 않는다.
- `api.upstream`과 `failure.upstream`은 문장이 같아도 키를 따로 둔다(쓰이는 곳이 다르다).

## Acceptance Criteria

```bash
set -eu
npm run lint
npm run build
npm run test
grep -q "오늘 한도(50회)를 모두 사용했습니다. 한국 시간 자정에 초기화됩니다." lib/messages.ts
grep -q "암호가 걸린 PDF는 처리할 수 없습니다. 암호를 풀어 저장한 뒤 올려 주세요." lib/messages.ts
grep -q "영수증 사진을 올리면 지출 표와 월간 보고서가 됩니다" lib/messages.ts
test -f lib/messages.test.ts
test -f lib/categories.test.ts
test -f lib/format.test.ts
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 4절 디렉토리 구조를 따르는가(`lib/messages.ts`, `lib/categories.ts`, `lib/format.ts`)?
   - ADR 기술 스택을 벗어나지 않았는가(새 패키지 없음)?
   - AGENTS.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/0-foundation/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

summary에 담을 것: 세 파일이 내보내는 이름(`MESSAGES`, `FailureCode`, `CATEGORY_KEYS`, `CategoryKey`, `CATEGORY_LABELS`, format 함수 5개)과 `MESSAGES.ui`의 키 이름 목록.

## 금지사항

- 문장을 다듬거나 마침표를 빼지 마라. 이유: USER_FLOWS 7절이 단일 출처이고 서버가 주는 문장을 화면이 그대로 쓴다. 테스트가 문서와 글자 단위로 대조한다.
- 테스트에 문장을 다시 손으로 적어 비교하지 마라. 이유: 문서와 코드가 같이 틀려도 통과한다. 테스트는 `docs/USER_FLOWS.md`를 읽어 대조한다.
- i18n 라이브러리와 날짜 라이브러리(dayjs, date-fns 등)를 설치하지 마라. 이유: 한국어 전용이고 `Intl`로 충분하다.
- 월 경계·서울 자정 계산을 `lib/format.ts`에 넣지 마라. 이유: 날짜 경계 계산은 `lib/stats/aggregate.ts` 한 곳 규칙이다. format은 표기만 한다.
- 금액을 줄여 쓰는 표기("약 113만원")를 만들지 마라. 이유: design.md 6.3.
- PRD 10절에 있는 기능의 문구(재시도 버튼, 검색, 초대 화면 등)를 만들지 마라. 이유: 제외로 확정된 범위다.
- 이 step에 적히지 않은 파일을 만들지 마라. 이유: 다음 step과 충돌한다.
- 기존 테스트를 깨뜨리지 마라
