# Step 7: process-document

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/ARCHITECTURE.md` 5.1(후처리 전체, 시퀀스 그림과 "후처리" 규칙), 5.2(10분 규칙), 5.5, 6절, 7.1(테스트 모드), 8절(실패 원인 → 문구 표, 로그 필드 규칙), 9.1, 12절 ADR-4·ADR-5·ADR-24·ADR-27
- `/docs/PRD.md` F4(예외 규칙), F5(10분 초과), 7절, 10.1·10.3
- `/docs/USER_FLOWS.md` UC-08, UC-10, 6.1(문서 상태), 7.4(실패 사유 문장)
- phase `0-foundation`이 만든 파일: `/lib/messages.ts`(`MESSAGES.failure`, `FailureCode`), `/lib/db/schema.ts`, `/lib/db/client.ts`(`getDb`, `Tx`)
- 이 phase의 이전 step: `/lib/stats/aggregate.ts`(`parseTransactedAt`, `seoulDateKey`), `/lib/claude/schemas.ts`, `/lib/claude/client.ts`(`isTestMode`), `/lib/claude/fixtures/index.ts`(`throwFailApi`), `/lib/claude/extract.ts`(`extractDocument`, `ExtractionError`), `/lib/pipeline/image.ts`, `/lib/pipeline/pdf.ts`, `/lib/pipeline/duplicates.ts`

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 작업

앞 step의 부품을 엮어 문서 1건의 후처리를 끝내는 `lib/pipeline/process-document.ts`를 만든다. 이 함수는 step 8의 `POST /api/documents`가 `after()` 안에서 부른다. 10분 규칙(`expireStaleDocuments`)은 step 9의 조회 API가 부른다.

**테스트를 먼저 쓴다(TDD).** 순수 함수(`toFailureCode`, `isTimedOut`, `toTransactionRows`)의 테스트를 먼저 쓴다. 단위 테스트는 DB·Claude·Blob을 부르지 않는다.

### 시그니처

```ts
// lib/pipeline/process-document.ts
export const PROCESSING_TIMEOUT_MS = 600_000
export function isTimedOut(uploadedAt: Date, now: Date): boolean
export function toFailureCode(err: unknown): FailureCode
export function toTransactionRows(result: ExtractionResult, ctx: { documentId: string; userId: string; uploadedAt: Date }): Array<{
  documentId: string; userId: string; transactedAt: Date; dateEstimated: boolean
  merchantName: string | null; totalAmount: number | null; cardLast4: string | null; category: CategoryKey
}>
export async function expireStaleDocuments(userId: string, now: Date): Promise<void>
export async function processDocument(documentId: string, opts: { fileName: string }): Promise<void>   // 절대 던지지 않는다
```

### 핵심 규칙 — `processDocument`의 순서

1. 문서를 읽는다. 없거나 `status !== 'processing'`이면 그냥 돌아온다.
2. 입력 준비.
   - 테스트 모드(`isTestMode()`): Blob 내려받기와 이미지·PDF 처리를 **건너뛴다.** 입력은 null.
   - 아니면 `fetch(original_url)`로 원본을 받는다. 응답이 OK가 아니거나 fetch가 던지면 `unreadable`.
   - **확장자로 분기**한다(`original_mime` 또는 URL 확장자). 파일 내용을 따로 검사하지 않는다.
   - PDF: `inspectPdf` → `encryptedPdf` / `unreadable` / `pageCount > MAX_PDF_PAGES`면 `tooManyPages`. 페이지 수는 `page_count`에 기록한다. 이 세 경우는 Claude를 부르지 않는다.
   - 이미지(JPG·PNG 모두): `toAnalysisJpeg`. 던지면 `unreadable`.
3. `extractDocument(input, { fileName: opts.fileName, today: seoulDateKey(new Date()), jobId: documentId })`.
4. **한 트랜잭션**(`getDb().transaction`)으로 쓴다. 순서를 지킨다.
   1. 문서가 아직 `processing`인지 다시 확인한다(`user_id` 조건 포함). 행이 없거나 상태가 바뀌었으면 아무것도 쓰지 않고 끝낸다(로그만).
   2. 그 문서의 기존 거래를 지운다. 같은 `documentId`로 두 번 실행되어도 거래가 두 번 들어가지 않는다(멱등).
   3. `toTransactionRows` 결과를 넣는다.
   4. `markDuplicates(tx, userId, documentId)`.
   5. 문서를 `completed`로 바꾸고 `doc_type`, `model_used`, `processed_at`을 채운다.
5. 어느 단계든 실패하면: `toFailureCode(err)` → 한 트랜잭션으로 `status = 'failed'`, `failure_reason = MESSAGES.failure[code]`, `processed_at`을 쓰고 그 문서의 거래를 지운다. **`WHERE status = 'processing'`일 때만** 쓴다(이미 10분 규칙으로 실패 처리됐거나 삭제된 문서를 덮어쓰지 않는다).
6. 실패 처리 자체가 던져도 `processDocument`는 던지지 않는다. 로그만 남긴다.

- `failure_reason`에는 `lib/messages.ts`의 문장을 **그대로** 저장한다. 내부 오류 문자열·스택을 넣지 않는다.
- 로그 필드는 작업 id(documentId)·단계·외부 상태 코드·`stop_reason`·토큰 사용량뿐이다. API 키·연결 문자열·원본 본문을 남기지 않는다.
- `usage_log`는 건드리지 않는다. 차감은 토큰 발급 때 끝났다.
- 모든 조회·수정에 `user_id` 조건을 건다(문서 행에서 읽은 `user_id`를 쓴다).

### 핵심 규칙 — `toTransactionRows`

- 거래마다 `parseTransactedAt(raw.transactedAt, uploadedAt)`으로 날짜와 `dateEstimated`를 정한다(못 읽었으면 업로드일 + 추정).
- `cardLast4`에 `cleanCardLast4`를 한 번 더 적용한다(이미 정리됐어도 결과가 같다).
- `docType === 'other'`면 0행이다. 영수증·명세서인데 거래가 0건이어도 정상(완료, 0건)이다.
- `totalAmount`는 null·0·음수를 그대로 둔다.

### 핵심 규칙 — 실패 원인 → 문구 (ARCH 8절 표)

| 원인 | `FailureCode` | 문구(`MESSAGES.failure`) |
|---|---|---|
| 내려받기 실패, `sharp`·`pdf-lib`가 못 엶, Claude 400, `refusal` | `unreadable` | 파일을 읽을 수 없습니다. |
| `max_tokens`, zod 검증 실패 | `unparsable` | 분석 결과를 해석하지 못했습니다. |
| Claude 429·5xx·타임아웃 | `upstream` | 분석 서비스가 일시적으로 응답하지 않습니다. |
| 20페이지 초과 | `tooManyPages` | PDF는 20페이지까지 처리할 수 있습니다. |
| 암호 PDF(명시적 암호 오류만) | `encryptedPdf` | 암호가 걸린 PDF는 처리할 수 없습니다. 암호를 풀어 저장한 뒤 올려 주세요. |
| 10분 초과 | `timedOut` | 처리 시간을 초과했습니다. |
| DB·그 외 | `unknown` | 알 수 없는 오류가 발생했습니다. |

`toFailureCode(err)`:
- `ExtractionError` → 그 `code`. 이 파일이 단계 실패를 알릴 때도 `ExtractionError`(또는 같은 모양의 `code`를 가진 오류)를 던져 같은 길로 보낸다.
- Anthropic `BadRequestError` 또는 `status === 400` → `unreadable`.
- `RateLimitError`(429), `status >= 500`, `APIConnectionError`, `APIConnectionTimeoutError` → `upstream`.
- zod 오류(`ZodError`) → `unparsable`.
- 그 외 전부(DB 오류 포함) → `unknown`.

### 핵심 규칙 — 10분 규칙

- `isTimedOut(uploadedAt, now)`: `now - uploadedAt > PROCESSING_TIMEOUT_MS`. 정확히 10분은 아직 아니다.
- `expireStaleDocuments(userId, now)`: `user_id = ? AND status = 'processing' AND uploaded_at < now - 10분`인 문서를 `failed` + `MESSAGES.failure.timedOut` + `processed_at`으로 바꾸고 그 문서들의 거래를 지운다. 한 트랜잭션. cron이 없으므로 조회 때 부른다(ADR-5).

### 확인된 Anthropic SDK 사실 (2026-09-18 조사)

설치된 패키지의 타입 정의와 다르면 타입 정의가 우선이다. 다르면 summary에 적어라.

- 오류 클래스: `Anthropic.BadRequestError`(400), `RateLimitError`(429), `APIConnectionTimeoutError`, `APIConnectionError`, `APIError`(`.status`). `APIConnectionTimeoutError`는 `APIConnectionError`의 하위 클래스이고 연결 오류는 `status`가 없을 수 있다.
- `db.transaction(async (tx) => …)`은 콜백이 던지면 롤백한다.

### 테스트 케이스 (`lib/pipeline/process-document.test.ts`)

- `toFailureCode` 표 전체: `new ExtractionError('unreadable')` 등 각 코드 통과 / SDK 400 → `unreadable` / 429 → `upstream` / 500·503·529 → `upstream` / `APIConnectionError` → `upstream` / `APIConnectionTimeoutError` → `upstream` / `throwFailApi()`가 던진 오류 → `upstream` / `ZodError` → `unparsable` / `new Error('db down')` → `unknown` / 문자열·null·undefined → `unknown`. 각 코드에 대해 `MESSAGES.failure[code]`가 위 표의 문장과 같다.
- `isTimedOut`: 9분 59초 → false, 정확히 10분 → false, 10분 + 1ms → true.
- `toTransactionRows`: 날짜 없음 → 업로드일 + `dateEstimated: true` / 날짜만 → 서울 자정 / 카드 `"****-1234"` → `"1234"`, `"12345"` → null / `other` → 0행 / 거래 여러 건 → 같은 수의 행, 모두 같은 `documentId`·`userId` / 금액 null·0·음수 보존 / 가맹점 null 보존.
- `processDocument`와 `expireStaleDocuments`는 DB를 쓰므로 단위 테스트 대상이 아니다. 화면 테스트(phase `2-reports-demo`)와 리허설이 덮는다.

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

summary에 담을 것: 내보낸 이름 전부, 성공 트랜잭션의 쓰기 순서, `processDocument(documentId, { fileName })`를 `after()`에서 부르면 된다는 점, `expireStaleDocuments(userId, now)`를 조회 API가 불러야 한다는 점.

## 금지사항

- 재시도·재분석을 넣지 마라. 이유: PRD 10.1. 실패는 `failure_reason`으로 알리고 사용자가 삭제 후 다시 올린다.
- 후처리 전체에 거는 공통 시한을 넣지 마라. 이유: PRD 10.1. Claude 호출 시한 240초 + 재시도 없음으로 충분하다.
- 사용자별 잠금(advisory lock)으로 후처리를 직렬화하지 마라. 이유: ADR-24, PRD 10.3. 동시 후처리의 중복 누락은 감수한다.
- Claude 응답 이후의 DB 쓰기를 단계별로 따로 하지 마라. 이유: ADR-24. 거래가 일부만 들어간 채 남으면 통계에 남는다. 단일 트랜잭션이다.
- 실패 사유에 내부 오류 문자열·스택을 넣지 마라. 이유: ARCH 8절. 화면은 DB의 문장을 그대로 보여준다.
- `usage_log`를 건드리지 마라. 이유: 차감은 토큰 발급 때 끝났고 실패도 1회로 센다(PRD F9).
- 원본을 고쳐 Blob에 다시 저장하거나 Blob `list()`를 부르지 마라. 이유: 저장 원본은 그대로 두고, `list()`는 월 한도를 쓴다.
- 파일 내용(매직 바이트)으로 형식을 검사하지 마라. 이유: PRD 10.1. 확장자로 나누고 못 열면 "파일을 읽을 수 없습니다."
- API 라우트를 만들지 마라. 이유: step 8·9의 범위다.
- 기존 테스트를 깨뜨리지 마라
