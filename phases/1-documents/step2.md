# Step 2: claude-schemas-and-fixtures

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/ARCHITECTURE.md` 5.5(카드 끝4 정리), 7.1(공통: 모델, 타임아웃, 테스트 모드), 7.2(추출 출력 형태), 9.1·9.2(fixture 3개), 10절(`CLAUDE_MODEL`, `SLIPSCAN_TEST_MODE`), 12절 ADR-8·ADR-22·ADR-27, 13.1(Anthropic SDK 확인 결과)
- `/docs/PRD.md` F4, 8.2, 8.3, 10.1(추출 필드 5개·품목·신뢰도 점수·프롬프트 캐시 제외)
- `/docs/USER_FLOWS.md` 9.3(fixture 목록)
- `/docs/design.md` 12.2("샘플로 해보기" 결제)
- phase `0-foundation`이 만든 파일: `/lib/categories.ts`, `/lib/messages.ts`(`FailureCode`)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 작업

추출 결과의 형식(zod), Claude 클라이언트, 테스트 모드용 가짜 응답 3개를 만든다. 실제 Claude 호출은 이 step에 없다(step 6에서 한다).

`@anthropic-ai/sdk`와 `zod`를 설치한다. 먼저 `npm view @anthropic-ai/sdk peerDependencies`로 SDK가 허용하는 zod 범위를 확인하고 그 안에서 가장 새 메이저를 고른다(2026-09-18 조사: `^3.25.0 || ^4.0.0`).

**테스트를 먼저 쓴다(TDD).** 단위 테스트는 네트워크를 쓰지 않는다.

### 만들 파일

`lib/claude/schemas.ts`, `lib/claude/client.ts`, `lib/claude/fixtures/index.ts`, `lib/claude/fixtures/receipt-ok.ts`, `lib/claude/fixtures/fail-api.ts`, `lib/claude/fixtures/report-ok.ts`, 그리고 `lib/claude/schemas.test.ts`, `lib/claude/client.test.ts`, `lib/claude/fixtures/index.test.ts`.

### 시그니처

```ts
// lib/claude/schemas.ts
export const extractionSchema            // zod. 엄격 검증용: merchantName ≤ 100, docType 'other'면 transactions 빈 배열
export type ExtractionResult
export function cleanCardLast4(raw: string | null): string | null

// ExtractionResult의 형태 (ARCH 7.2)
// {
//   docType: 'receipt' | 'statement' | 'other',
//   transactions: Array<{
//     transactedAt: string | null,    // ISO 8601, 시간 모르면 날짜만
//     merchantName: string | null,    // 최대 100자
//     totalAmount: number | null,     // KRW 정수, 0·음수 허용(음수 = 취소·환불)
//     cardLast4: string | null,
//     category: CategoryKey,          // 8개 중 하나, 모르면 'other'
//   }>
// }

// lib/claude/client.ts
export function isTestMode(): boolean    // SLIPSCAN_TEST_MODE==='1' && VERCEL_ENV!=='production' (production이면 무시 + 경고 로그)
export function getModel(): string       // CLAUDE_MODEL ?? 'claude-opus-5'
export function getClaudeClient(): Anthropic   // maxRetries: 0, timeout: 240_000

// lib/claude/fixtures/index.ts
export type FixtureName = 'receipt-ok' | 'fail-api'
export function pickFixtureName(fileName: string): FixtureName   // 'fail-api.jpg' → 'fail-api', 그 외 'receipt-ok'
export const RECEIPT_OK: ExtractionResult                        // 2026-09-09 파리바게뜨 역삼점 17,300원 카드 9012 food_welfare
export function throwFailApi(): never                            // toFailureCode가 'upstream'으로 매핑하는 SDK 오류를 던진다
export const REPORT_OK_CHUNKS: string[]                          // 5개 섹션 보고서를 20조각으로
```

### 핵심 규칙 — 스키마

- `docType`은 세 값 enum. `category`는 `CATEGORY_KEYS` enum(다른 값은 거부). `totalAmount`는 정수 또는 null이고 0과 음수를 허용한다. `merchantName`은 100자 이하 또는 null. `transactedAt`과 `cardLast4`는 문자열 또는 null.
- `docType === 'other'`이면 `transactions`는 빈 배열이어야 한다(refine). 아니면 검증 실패다.
- 영수증 한 장에 거래가 여러 건인 것은 정상이다(영수증 여러 장이 한 파일에 있을 수 있다).
- 구조화 출력의 JSON 스키마는 `maxLength`·`minimum` 같은 제약과 refine을 실어 보낼 수 없다. 그래서 **받은 뒤 검증은 항상 엄격한 `extractionSchema`로 한다.** step 6에서 `zodOutputFormat`에 넘길 스키마가 API에서 받아들여져야 한다. 하나의 스키마로 둘 다 되면(헬퍼가 제약을 조용히 걸러 주면) 하나만 둔다. 안 되면 제약 없는 `extractionWireSchema`를 하나 더 내보낸다. 어느 쪽인지 summary에 적는다.
- `cleanCardLast4(raw)`: 숫자만 남겨 정확히 4자리면 그 문자열, 아니면 null. 프롬프트만 믿으면 카드번호 전체가 DB와 화면에 남을 수 있어서 코드로 강제한다.

### 핵심 규칙 — 클라이언트

- `isTestMode()`: `process.env.SLIPSCAN_TEST_MODE === '1'`이고 `process.env.VERCEL_ENV !== 'production'`일 때만 true. production에서 변수가 켜져 있으면 false를 돌려주고 경고 로그를 한 번만 남긴다.
- `getModel()`: `process.env.CLAUDE_MODEL`이 비어 있으면 `'claude-opus-5'`.
- `getClaudeClient()`: 처음 부를 때 만든다(모듈 import만으로는 만들지 않는다). `new Anthropic({ maxRetries: 0, timeout: 240_000 })`. 이유: SDK 기본 재시도는 240초 × N이 함수 한도 300초를 넘는다(ADR-27). API 키는 SDK가 `ANTHROPIC_API_KEY`에서 읽는다.
- 인터페이스·DI 계층을 만들지 않는다(ADR-22). 테스트 대역은 `isTestMode()` 분기 하나다.

### 핵심 규칙 — fixture (정확히 3개)

- `receipt-ok`: `RECEIPT_OK = { docType: 'receipt', transactions: [{ transactedAt: '2026-09-09T12:24:00', merchantName: '파리바게뜨 역삼점', totalAmount: 17300, cardLast4: '9012', category: 'food_welfare' }] }`. `public/samples/receipt-sample.jpg`(step 4)와 같은 결제다.
- `fail-api`: `throwFailApi()`는 Anthropic SDK의 오류 인스턴스(상태 500의 `APIError` 계열)를 던진다. 설치된 SDK가 허용하는 방식으로 만든다(예: `APIError.generate(500, …)` 또는 `new Anthropic.InternalServerError(…)`). step 7의 `toFailureCode`가 이것을 `'upstream'`("분석 서비스가 일시적으로 응답하지 않습니다.")으로 바꾼다.
- `report-ok`: `REPORT_OK_CHUNKS`는 한국어 마크다운 보고서를 **정확히 20조각**으로 나눈 배열이다. 이어 붙인 글의 `##` 제목은 아래 다섯 개와 글자까지 같아야 한다. 표와 링크를 쓰지 않는다(목록으로 쓴다).
  - `## 1. 기간 총 지출액과 거래 건수`
  - `## 2. 카테고리별 금액·비율`
  - `## 3. 큰 지출 상위 5건`
  - `## 4. 눈에 띄는 점`
  - `## 5. 한 문단 총평`
- `pickFixtureName(fileName)`: 확장자를 뗀 이름이 `fail-api`면 `'fail-api'`, 그 외 전부(`receipt-sample.jpg` 포함) `'receipt-ok'`.

### 확인된 Anthropic SDK 사실 (2026-09-18 조사)

설치된 패키지의 타입 정의와 다르면 타입 정의가 우선이다. 다르면 summary에 적어라.

- 클라이언트는 `new Anthropic({ maxRetries: 0, timeout: 240_000 })`(timeout은 밀리초).
- 오류 클래스: `Anthropic.BadRequestError`(400), `RateLimitError`(429), `APIConnectionTimeoutError`, `APIConnectionError`, `APIError`(`.status`).
- `zodOutputFormat`은 `@anthropic-ai/sdk/helpers/zod`에 있다. 구조화 출력의 JSON 스키마는 `maxLength`·`minimum` 등을 지원하지 않는다. nullable은 `anyOf`로 표현된다(`z.string().nullable()`).

### 테스트 케이스

- `schemas.test.ts`: 정상 응답 통과 / 카테고리 밖 값 거부 / `other`인데 거래가 있으면 거부 / `other` + 빈 배열 통과 / 0원·음수 금액 통과 / 소수 금액 거부 / 영수증에 거래 여러 건 통과 / 가맹점명 101자 거부·100자 통과 / 모든 nullable 필드가 null이어도 통과. `cleanCardLast4`: `"1234"` → `"1234"`, `"****-1234"` → `"1234"`, `"12345"` → null, `"12a4"` → null, `""` → null, null → null.
- `fixtures/index.test.ts`: `pickFixtureName('fail-api.jpg') === 'fail-api'`, `'receipt-sample.jpg'`·`'무엇이든.pdf'`·`''` → `'receipt-ok'`. `RECEIPT_OK`가 `extractionSchema`를 통과한다. `REPORT_OK_CHUNKS.length === 20`이고 이어 붙인 글에 제목 5개가 순서대로 있다. 글에 `](`(링크)와 `|`(표)가 없다. `throwFailApi()`가 SDK의 `APIError` 인스턴스를 던지고 `status`가 500 이상이다.
- `client.test.ts`: `isTestMode` 진리표 — 변수 없음 → false, `'1'` → true, `'1'` + `VERCEL_ENV=production` → false, `'0'`·`'true'` → false. `getModel` — 변수 없음 → `'claude-opus-5'`, `CLAUDE_MODEL=claude-sonnet-5` → 그 값. 테스트 안에서 바꾼 `process.env`는 되돌린다.

## Acceptance Criteria

```bash
set -eu
npm run lint
npm run build
npm run test
test "$(ls lib/claude/fixtures/*.ts | grep -v test | grep -v index | wc -l)" -eq 3
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

summary에 담을 것: 내보낸 이름 전부, 설치한 zod 메이저, 별도의 `extractionWireSchema`가 있는지, `throwFailApi`가 던지는 오류 클래스.

## 금지사항

- 실제 Claude API를 호출하지 마라. 이유: 이 step은 형식과 가짜 응답만 만든다. 실제 호출 확인은 step 6에 있다.
- 프롬프트 캐시 설정(`cache_control`)을 넣지 마라. 이유: PRD 10.1에서 제외했다.
- 추출 필드를 늘리지 마라(사업자등록번호·공급가액·부가세·승인번호·메모, 품목, 신뢰도 점수). 이유: PRD 10.1에서 제외했다.
- 외부 서비스용 인터페이스·DI 계층을 만들지 마라. 이유: ADR-22. Claude 클라이언트는 파일 한 곳, 테스트는 테스트 모드 fixture로 한다.
- fixture를 3개보다 많이 만들지 마라. 이유: PRD 10.1에서 8개를 3개로 줄였다.
- SDK 재시도를 켜지 마라. 이유: ADR-27.
- 추출 호출 코드(`extract.ts`)와 프롬프트를 만들지 마라. 이유: step 6의 범위다.
- 기존 테스트를 깨뜨리지 마라
