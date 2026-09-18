# Step 0: date-and-stats-lib

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/ARCHITECTURE.md` 5.4(기간 통계, 날짜 계약), 6절(데이터 모델), 9.1(단위 테스트 대상), 12절 ADR-7·ADR-18
- `/docs/PRD.md` F7(기간 통계), 10.1(제외 목록: 미래 날짜 보정, 일·주·연 통계)
- `/docs/USER_FLOWS.md` UC-13
- `/AGENTS.md` 아키텍처 규칙("날짜 경계 계산은 `lib/stats/aggregate.ts` 한 곳")
- phase `0-foundation`이 만든 파일: `/lib/categories.ts`, `/lib/db/schema.ts`, `/lib/db/client.ts`, `/lib/format.ts`(표기 전용. 경계 계산은 여기 없다)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 작업

`lib/stats/aggregate.ts`와 `lib/stats/aggregate.test.ts`를 만든다. 이 파일이 서울 시간 날짜 경계의 **유일한** 계산 장소다. 뒤 step의 사용량(`lib/usage/limit.ts`), 중복 감지, 후처리, 대시보드 API가 모두 여기서 가져다 쓴다.

**테스트를 먼저 쓴다(TDD).** 순수 함수의 테스트를 먼저 쓰고 실패를 확인한 뒤 구현한다. 단위 테스트는 DB에 접속하지 않는다.

### 시그니처

```ts
// lib/stats/aggregate.ts
import type { CategoryKey } from '@/lib/categories'

export function seoulDayStart(now: Date): Date                  // now가 속한 서울 날짜의 00:00 (UTC Date로 돌려준다)
export function seoulDateKey(d: Date): string                   // 'YYYY-MM-DD' (서울)
export function currentSeoulMonth(now: Date): string            // 'YYYY-MM'
export function isValidMonth(s: string): boolean
export function monthRange(month: string): { start: Date; end: Date }   // [1일 00:00 서울, 다음 달 1일 00:00 서울)
export function shiftMonth(month: string, delta: number): string
export function parseTransactedAt(raw: string | null, uploadedAt: Date): { transactedAt: Date; dateEstimated: boolean }
export type StatRow = { totalAmount: number | null; isDuplicate: boolean; category: CategoryKey }
export type MonthStats = { total: number; count: number; categories: Array<{ key: CategoryKey; amount: number; ratio: number | null }> }
export function aggregateMonth(rows: StatRow[]): MonthStats     // 8개 카테고리 모두, 금액 내림차순(같으면 CATEGORY_KEYS 순)
export function pickDefaultMonth(latestTransactedAt: Date | null, now: Date): string
export async function getMonthStats(userId: string, month: string): Promise<MonthStats>
export async function getDefaultMonth(userId: string, now: Date): Promise<string>
export async function countReportableTransactions(userId: string, month: string): Promise<number>
```

### 핵심 규칙

- 서울은 서머타임이 없다. UTC+9 고정 오프셋으로 계산한다. 날짜 라이브러리를 쓰지 않는다.
- 월 경계는 `[그 달 1일 00:00 서울, 다음 달 1일 00:00 서울)`이다. `end`는 포함하지 않는다.
- `isValidMonth`는 `^\d{4}-(0[1-9]|1[0-2])$`만 통과시킨다.
- `parseTransactedAt(raw, uploadedAt)`:
  - `raw`가 null이거나 해석할 수 없는 문자열이면 `{ transactedAt: uploadedAt, dateEstimated: true }`.
  - 날짜만(`YYYY-MM-DD`)이면 그 날의 서울 자정.
  - 시각이 있고 오프셋(`Z`, `+09:00` 등)이 없으면 서울 시각으로 해석한다.
  - 오프셋이 있으면 적힌 그대로.
  - **미래 날짜를 코드로 고치지 않는다.** 미래 날짜는 프롬프트 규칙("미래 날짜는 null")이 처리한다(PRD 10.1).
- `aggregateMonth(rows)`:
  - `isDuplicate === true`인 행과 `totalAmount === null`인 행을 뺀다. 미인식 판정은 `=== null`로만 한다. 0원은 정상 거래라 건수와 합계에 들어간다. 음수(취소·환불)는 그대로 더한다(순지출).
  - `count`는 포함된 행의 수, `total`은 포함된 금액의 합이다.
  - `categories`는 항상 8개를 모두 돌려준다. 금액 내림차순, 금액이 같으면 `CATEGORY_KEYS` 순서.
  - `ratio = amount / total`(0~1 분수, 음수 가능). `total <= 0`이면 모든 카테고리의 `ratio`가 null이다.
- `pickDefaultMonth(latest, now)`: `latest`가 있으면 그 시각의 서울 달, null이면 `currentSeoulMonth(now)`.
- DB 함수 셋은 얇게 둔다(단위 테스트 대상 아님). `getDb()`를 직접 쓰고 모든 조회에 `user_id` 조건을 건다.
  - `getDefaultMonth`: `max(transacted_at)`을 `user_id`, `is_duplicate = false`, `total_amount IS NOT NULL`, **`transacted_at < 내일 00:00 서울`**(오늘 이후 거래 제외) 조건으로 구해 `pickDefaultMonth`에 넘긴다. 미래 날짜로 잘못 읽힌 거래 한 건이 첫 화면을 빈 달로 옮기는 것을 막는 장치는 이 SQL 조건 하나다.
  - `getMonthStats`: `user_id` + `monthRange` 범위의 행을 읽어 `aggregateMonth`에 넘긴다. 통계를 저장하지 않는다.
  - `countReportableTransactions`: 같은 범위에서 `is_duplicate = false AND total_amount IS NOT NULL`인 행 수(보고서 버튼 0건 판정용).
- 이 모듈을 import만 해서는 DB에 연결되지 않아야 한다(`getDb()`는 함수 안에서만 부른다).
- 모듈 맨 위에서 `@/lib/db/client`와 `@/lib/db/schema`를 import하지 않는다. DB 함수 셋 안에서 `await import(...)`로 불러온다. 이유: 뒤의 화면 step이 브라우저 코드에서 `shiftMonth`·`isValidMonth` 같은 순수 함수를 이 파일에서 가져다 쓴다. 맨 위에서 DB 코드를 불러오면 DB 드라이버가 브라우저 묶음에 딸려 들어간다. 타입만 필요하면 `import type`을 쓴다.

### 테스트 케이스 (`lib/stats/aggregate.test.ts`)

- 월 경계(서울): `2026-08-31T15:00:00Z`는 9월에 속한다. `2026-09-30T14:59:59Z`는 9월, `2026-09-30T15:00:00Z`는 10월이다. `monthRange('2026-09')`의 `start`/`end`가 이 값과 일치한다.
- `seoulDayStart`: 서울 23:59:59와 다음 날 00:00:00이 서로 다른 날의 시작을 돌려준다. `seoulDateKey`도 같은 경계로 바뀐다.
- `shiftMonth('2026-01', -1) === '2025-12'`, `shiftMonth('2026-12', 1) === '2027-01'`.
- `isValidMonth`: `'2026-09'` 통과, `'2026-13'`·`'2026-9'`·`'abcd-ef'`·`''` 거부.
- `parseTransactedAt`: null → 업로드일 + 추정, 쓰레기 문자열 → 업로드일 + 추정, `'2026-09-03'` → `2026-09-02T15:00:00Z`, `'2026-09-03T12:41:00'` → `2026-09-03T03:41:00Z`, `'2026-09-03T12:41:00+09:00'`와 `Z` 표기는 적힌 그대로, 미래 날짜도 고치지 않고 그대로.
- `aggregateMonth`: 중복 제외, 미인식(null) 제외, 0원 포함(건수 +1), 음수 합산, 8개 카테고리 모두 반환, 정렬(금액 내림차순·동률은 키 순서), 총액 `<= 0`이면 모든 `ratio`가 null, 빈 배열이면 `total 0 / count 0 / ratio null`.
- `pickDefaultMonth`: `latest`가 서울 기준 9월이면 `'2026-09'`(UTC로는 8월 31일 15시인 경우 포함), null이면 이번 달. 미래 거래 제외는 이 함수가 아니라 `getDefaultMonth`의 SQL 조건이 맡는다는 점을 테스트 파일 주석 한 줄로 남긴다.

## Acceptance Criteria

```bash
set -eu
npm run lint
npm run build
npm run test
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가?
   - ADR 기술 스택을 벗어나지 않았는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/1-documents/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 (API 키, 외부 인증, 수동 설정 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

summary에 담을 것: 만든 파일과 `lib/stats/aggregate.ts`가 내보내는 함수·타입 이름 전부(다음 step이 이름 그대로 가져다 쓴다).

## 금지사항

- 날짜 라이브러리(dayjs, date-fns, luxon 등)를 설치하지 마라. 이유: 서울은 UTC+9 고정이라 산술로 충분하다.
- 자정·월 경계 계산을 다른 파일에 복제하지 마라. 이유: 날짜 경계는 이 파일 한 곳에 둔다는 프로젝트 규칙이다. `lib/format.ts`는 표기만 한다.
- 미래 날짜를 코드로 보정하지 마라. 이유: PRD 10.1에서 제외했다. 프롬프트 한 줄과 기본 달 SQL 조건으로 대신한다.
- 통계를 표나 캐시에 저장하지 마라. 이유: PRD F7. 볼 때마다 거래에서 계산한다.
- 일·주·연 단위 함수를 만들지 마라. 이유: PRD 10.1. 월 단위만 있다.
- Vitest에서 DB에 접속하지 마라. 이유: 단위 테스트는 순수 함수만 다룬다. DB를 거치는 흐름은 Cypress와 리허설로 확인한다.
- 이 step에 적히지 않은 파일·기능(API 라우트, 화면)을 만들지 마라. 이유: 다음 step과 충돌한다.
- 기존 테스트를 깨뜨리지 마라
