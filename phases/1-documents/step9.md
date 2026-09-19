# Step 9: documents-dashboard-api

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/ARCHITECTURE.md` 5.2(목록 조회와 실패 판정), 5.4(기간 통계, 응답 형태), 5.6(문서 삭제), 6절, 8절(API 목록, 입력 규칙, 에러 응답 규약), 13.1(Next 16, Vercel Blob)
- `/docs/PRD.md` F5(문서 합계, 삭제), F7, F9, 10.1·10.3
- `/docs/USER_FLOWS.md` UC-04, UC-08 E1, UC-11 S7, UC-12, 7.3
- `/lib/messages.ts`, `/lib/categories.ts`
- `/lib/db/schema.ts`, `/lib/db/client.ts`
- `/proxy.ts`
- `/lib/stats/aggregate.ts` (이 묶음 step 0)
- `/lib/usage/limit.ts` (step 1)
- `/lib/claude/client.ts` (step 2. `isTestMode`)
- `/lib/pipeline/process-document.ts` (step 7. `expireStaleDocuments`)
- `/app/api/documents/route.ts`, `/lib/upload/rules.ts` (step 8. 오류 응답을 쓰는 방식)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 작업

대시보드 조회 하나, 문서 상세 조회, 문서 삭제를 만든다. 화면은 이 API만 읽는다(서버 컴포넌트에서 DB를 직접 읽는 길은 쓰지 않는다).

만들 파일:

- `lib/stats/document-summary.ts`, `lib/stats/document-summary.test.ts` (테스트를 먼저 쓴다)
- `lib/api-types.ts` (응답 타입. 화면 step이 가져다 쓴다)
- `app/api/dashboard/route.ts` (GET)
- `app/api/documents/[id]/route.ts` (GET, DELETE)

### 이 step이 부르는 함수 (이미 있다. 다시 만들지 마라)

```ts
// lib/stats/aggregate.ts
export function isValidMonth(s: string): boolean
export type MonthStats = { total: number; count: number; categories: Array<{ key: CategoryKey; amount: number; ratio: number | null }> }
export async function getMonthStats(userId: string, month: string): Promise<MonthStats>
export async function getDefaultMonth(userId: string, now: Date): Promise<string>
// lib/usage/limit.ts
export const DAILY_LIMIT = 50
export async function countTodayUsage(userId: string, now: Date): Promise<number>
// lib/pipeline/process-document.ts
export async function expireStaleDocuments(userId: string, now: Date): Promise<void>
// lib/claude/client.ts
export function isTestMode(): boolean
```

### 1. `lib/stats/document-summary.ts` (순수 함수. 테스트 먼저)

```ts
// 문서 합계 = 추출된 금액의 합. 금액 미인식(null)은 빼고 중복 표시 거래는 포함한다(PRD F5). 통계와 기준이 다르다.
export function summarizeDocument(
  status: DocumentStatus,
  amounts: Array<number | null>,
): { transactionCount: number | null; totalAmount: number | null }
```

테스트 케이스: `completed` + 거래 0건 → `{ 0, 0 }` / null 금액은 합계에서 빠지되 건수에는 들어간다 / 중복 거래의 금액도 합계에 들어간다(호출자가 중복을 걸러내지 않는다) / 음수는 그대로 더한다 / 0원은 정상 금액 / `processing`·`failed`는 둘 다 null.

### 2. `lib/api-types.ts`

```ts
export type DashboardDocument = { id: string; docType: DocType; status: DocumentStatus; failureReason: string | null; transactionCount: number | null; totalAmount: number | null; uploadedAt: string }
export type DashboardResponse = { month: string; usage: { used: number; limit: 50 }; stats: MonthStats; documents: DashboardDocument[] }
export type TransactionItem = { id: string; transactedAt: string; dateEstimated: boolean; merchantName: string | null; totalAmount: number | null; cardLast4: string | null; category: CategoryKey; isDuplicate: boolean; duplicateOfDocumentId: string | null }
export type DocumentDetailResponse = { id: string; docType: DocType; status: DocumentStatus; failureReason: string | null; originalUrl: string; originalMime: string; modelUsed: string | null; uploadedAt: string; processedAt: string | null; totalAmount: number | null; transactions: TransactionItem[] }
export type ApiError = { error: string }
```

날짜는 ISO 문자열이다. 필드 이름은 이 타입 그대로다(화면과 Cypress가 이 이름에 기댄다). 타입만 두는 파일이다. 다른 모듈의 타입은 `import type`으로만 가져온다(`import type { DocType, DocumentStatus } from '@/lib/db/schema'`, `import type { MonthStats } from '@/lib/stats/aggregate'`, `import type { CategoryKey } from '@/lib/categories'`). 값 import를 쓰면 DB 코드가 브라우저 묶음에 들어간다. `DocType`·`DocumentStatus` 같은 유니온을 여기서 다시 선언하지 않는다(두 벌이 되어 어긋난다).

### 3. `GET /api/dashboard?month=YYYY-MM`

순서:
1. `auth()` → 없으면 401.
2. `month`가 있는데 `isValidMonth`가 false면 400.
3. `expireStaleDocuments(userId, now)`. 10분 넘게 `processing`인 문서가 이때 `failed`로 바뀐다(ARCH 5.2).
4. `month ?? await getDefaultMonth(userId, now)`.
5. `usage: { used: await countTodayUsage(userId, now), limit: DAILY_LIMIT }`, `stats: await getMonthStats(userId, month)`.
6. 내 문서 목록을 `uploaded_at DESC, id DESC`로 읽고, 문서마다 `summarizeDocument`로 건수·합계를 붙인다. 시연 규모에서는 내 거래의 `document_id`·`total_amount`를 한 번에 읽어 JS에서 문서별로 묶어도 된다.

핵심 규칙:
- `transactionCount`·`totalAmount`는 `status === 'completed'`일 때만 값이 있고 그 외에는 null이다. 처리 중 문서의 `docType`은 `'unknown'` 그대로다.
- 목록은 월로 거르지 않는다(전체 문서). `month`는 통계에만 쓰인다.
- 첫 로드, 폴링, 업로드·삭제·보고서 직후 모두 이 라우트 하나를 쓴다(ADR-25).

### 4. `GET /api/documents/[id]`

Next 16에서 `params`는 Promise다: `const { id } = await params`.

1. `auth()` → 401. 2. `id`가 uuid 모양이 아니거나, 없거나, 남의 문서면 404 + `MESSAGES.api.documentNotFound`(403을 쓰지 않는다). 3. `expireStaleDocuments(userId, now)`를 먼저 부른 뒤 문서를 읽는다. 4. 거래는 `transacted_at, id` 순. `duplicateOfDocumentId`는 `duplicate_of`로 같은 표를 다시 조인해 원본 거래의 `document_id`를 넣는다(중복이 아니면 null). 5. `totalAmount`는 `summarizeDocument`로 구한다.

### 5. `DELETE /api/documents/[id]` (ARCH 5.6)

1. `auth()` → 401. 소유자 확인 실패 → 404.
2. **DB 트랜잭션 먼저.** 순서: 이 문서의 거래 id를 읽는다 → 그 id를 `duplicate_of`로 가리키던 **다른 문서의 거래 전부**를 `is_duplicate = false, duplicate_of = null`로 되돌린다 → 이 문서의 거래 삭제 → 문서 삭제. FK의 `ON DELETE SET NULL`만으로는 `is_duplicate`가 true로 남으므로 되돌리기를 먼저 한다.
3. 트랜잭션이 끝난 뒤 `del(original_url)`(`@vercel/blob`). 실패하면 로그만 남긴다(고아 파일 감수). 테스트 모드(`isTestMode()`)에서는 Blob을 부르지 않는다.
4. 200 `{ ok: true }`.

핵심 규칙:
- 되돌린 거래끼리 다시 중복인지는 판정하지 않는다(PRD 10.3).
- `reports`와 `usage_log`는 건드리지 않는다. 지워도 오늘 사용 횟수는 줄지 않는다(PRD F9).
- 처리 중 문서도 API는 받는다. 화면이 버튼을 비활성으로 둔다(G-9).
- 모든 조회·수정·삭제에 `user_id = 현재 userId` 조건이 들어간다.
- 오류 본문은 `{ error: MESSAGES.api.* }`다. 그 외 오류는 500 + `MESSAGES.api.internal`, 예외 내용은 서버 로그에만.

확인된 사용법(2026-09-18 조사). 설치된 패키지의 타입 정의와 다르면 타입 정의가 우선이다. 다르면 summary에 적어라.
- Next 16: `params`·`searchParams`는 Promise다. 쿼리는 `new URL(request.url).searchParams`로 읽는다.
- `@vercel/blob`: `del(urlOrPathname)`. `del`은 고급 작업에 들어가지 않는다. `list()`는 고급 작업이다.
- Drizzle: `db.transaction(async (tx) => …)`는 던지면 롤백한다.

## Acceptance Criteria

```bash
set -eu
npm run lint
npm run build
npm run test

LOG=$(mktemp); npx next start -p 3917 > "$LOG" 2>&1 & SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null || true; lsof -ti tcp:3917 | xargs kill 2>/dev/null || true' EXIT
for i in $(seq 1 60); do curl -s -o /dev/null http://localhost:3917/ && break; sleep 1; done
check401() {
  out=$(curl -s -X "$1" -w '\n%{http_code}' "http://localhost:3917$2")
  test "$(echo "$out" | tail -n1)" = "401"
  echo "$out" | grep -q '로그인이 필요합니다.'
}
DOC=/api/documents/00000000-0000-4000-8000-000000000000
check401 GET /api/dashboard
check401 GET "$DOC"
check401 DELETE "$DOC"
echo "server checks ok"
if grep -rnE "import \{[^}]*\blist\b[^}]*\} from ['\"]@vercel/blob['\"]" app lib; then echo "AC 실패: 있으면 안 되는 것이 발견됐다(위 출력)"; exit 1; fi
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가? (`lib/stats/document-summary.ts`, `lib/api-types.ts`는 추가 파일이다)
   - ADR 기술 스택을 벗어나지 않았는가? (ADR-25: 대시보드 조회는 하나)
   - AGENTS.md CRITICAL 규칙을 위반하지 않았는가? (`user_id` 조건, 남의 id는 404, Blob `list()` 금지)
3. 결과에 따라 `phases/1-documents/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "..."`. summary에는 라우트 파일 2개, `summarizeDocument`의 위치, `lib/api-types.ts`의 타입 이름과 JSON 필드 이름(`transactionCount`, `totalAmount`, `failureReason`, `duplicateOfDocumentId` 등), 삭제 트랜잭션의 순서를 적는다.
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- 목록·통계·사용량을 API 여러 개로 나누지 마라. 이유: ADR-25. 폴링이 요청 1개이고 세 값이 같은 시점의 것이어야 한다.
- 문서 목록 상한, "더 보기", 검색·필터·정렬 옵션을 만들지 마라. 이유: PRD 10.1에서 제외했다.
- 통계나 문서 합계를 DB에 저장하지 마라. 이유: PRD F7. 볼 때마다 거래에서 계산한다.
- Blob `list()`를 호출하지 마라. 이유: 월 2,000회 한도를 넘기면 30일 차단된다. 지울 주소는 DB의 `original_url`이다.
- 삭제할 때 `usage_log`를 지우거나 줄이지 마라. 이유: 지우고 다시 올리기로 하루 한도를 피할 수 없어야 한다(PRD F9).
- 되돌린 거래의 재중복 판정, 처리 중 문서 삭제 차단, 고아 파일 청소를 만들지 마라. 이유: PRD 10.3에서 감수로 확정했다.
- 남의 문서에 403을 돌려주지 마라. 이유: 있는지 없는지를 알려 주지 않는다. 404로 통일한다(ARCH 8절).
- 재시도·재분석·편집용 API(PUT/PATCH 등)를 만들지 마라. 이유: PRD 10.1. 읽기 전용이다.
- 자정·월 경계·10분 판정을 이 라우트 안에서 다시 계산하지 마라. 이유: 날짜 경계는 `lib/stats/aggregate.ts`, 10분 규칙은 `lib/pipeline/process-document.ts` 한 곳에 있다.
- 오류 응답에 예외 메시지·SQL을 넣지 마라. `.env.local`의 값을 출력·커밋하지 마라.
- 기존 테스트를 깨뜨리지 마라
