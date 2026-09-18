# Step 1: reports-api

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/PRD.md` F8, F9(차감 시점), 10.1·10.3
- `/docs/ARCHITECTURE.md` 5.3(보고서 생성 순서·스트리밍 규칙), 6절(`reports`, `usage_log`), 8절(API 목록, 에러 응답 규약, 실패 원인 표), ADR-26·ADR-27, 13.1
- `/docs/USER_FLOWS.md` UC-15(E3~E5), UC-16, 7.3
- 이전 step·묶음에서 만든 파일:
  - `lib/claude/report.ts`, `lib/claude/prompts/report.ts` (직전 step)
  - `lib/messages.ts`, `lib/db/schema.ts`, `lib/db/client.ts`
  - `lib/stats/aggregate.ts` (`isValidMonth`, `countReportableTransactions`)
  - `lib/usage/limit.ts` (`DAILY_LIMIT`, `countTodayUsage`, `recordUsage`)
  - `lib/claude/client.ts` (`getModel`)
  - `lib/pipeline/process-document.ts` (`toFailureCode`: Anthropic 오류를 가르는 본보기)
  - `app/api/dashboard/route.ts`, `app/api/documents/[id]/route.ts` (라우트 작성 방식, 404 규칙, `params` 다루기의 본보기)
  - `proxy.ts` (미로그인 `/api/**`는 여기서 401 JSON을 받는다)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 작업

보고서 API 3개를 만든다. 화면은 다음 step이다.

만들 파일: `app/api/reports/route.ts`(POST, GET), `app/api/reports/[id]/route.ts`(GET). 순수 도우미 2개는 `lib/claude/report.ts`에 더하고 `lib/claude/report.test.ts`에 테스트를 **먼저** 쓴다. 이유: Next.js의 `route.ts`는 `GET`·`POST`·`maxDuration` 같은 정해진 이름만 export할 수 있어서, 도우미를 라우트 파일에서 export하면 빌드가 실패한다.

### API 계약

| 경로 | 요청 | 성공 응답 |
|---|---|---|
| `POST /api/reports` | `{ month }` | 200 `text/plain` 스트림 + `X-Report-Id`. 첫 글자 조각을 받은 뒤에 응답을 돌려준다. 그 전 실패는 JSON 오류 |
| `GET /api/reports` | — | `{ reports: Array<{ id, month, createdAt, completedAt }> }` (completed만, 최근 순) |
| `GET /api/reports/[id]` | — | `{ id, month, status, contentMd, modelUsed, createdAt, completedAt }` |

오류는 `{ error: MESSAGES.api.* }` + 400·401·404·429·502·500이다. 날짜는 ISO 문자열이다.

### 시그니처

```ts
// lib/claude/report.ts 에 추가
export function parseReportRequest(body: unknown): { month: string } | null        // month가 문자열이고 isValidMonth일 때만
export function toReportErrorResponse(err: unknown): { status: 502 | 500; error: string }

// app/api/reports/route.ts
export const maxDuration = 300
export async function POST(request: Request): Promise<Response>
export async function GET(): Promise<Response>

// app/api/reports/[id]/route.ts   (Next 16: params는 Promise다)
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response>
```

### 핵심 규칙 — POST

- 순서를 지킨다(ARCH 5.3): `auth()`의 userId → `parseReportRequest`(null이면 400 `MESSAGES.api.badRequest`) → `countReportableTransactions(userId, month) >= 1`(아니면 400) → `countTodayUsage(userId, now) < DAILY_LIMIT`(아니면 429 `MESSAGES.api.limitReached`) → `recordUsage({ id: randomUUID(), userId, kind: 'report' })` → `reports` 행 insert(`status: 'generating'`, `model_used: getModel()`, `month`) → `getReportRows` + `buildReportInput` → `streamReport` 시작.
- **사용량은 생성을 시작할 때 1회 센다.** 그 뒤 실패해도 돌려주지 않는다(PRD F9).
- 응답 헤더: `Content-Type: text/plain; charset=utf-8`, `Cache-Control: no-store`, `X-Report-Id: <보고서 id>`.
- **첫 글자 조각이 도착한 뒤에 스트리밍 `Response`를 돌려준다.** 그 전에 `streamReport`가 실패하면 JSON 오류로 응답한다: `toReportErrorResponse(err)`. 글이 한 글자도 없이 스트림이 끝난 경우(거절 등)도 502로 응답한다(보고서에는 거절 전용 문구가 없다. ARCH 8절의 여섯 코드 가운데 502가 유일하게 맞다). 이유: 화면이 "한 글자도 오기 전의 실패"를 HTTP 오류 문구로 보여줘야 한다(UC-15 E4). 이때도 사용량은 그대로이고 `generating` 행은 10분 규칙에 맡긴다. ARCH 5.3의 순서 그림은 헤더를 글 조각보다 먼저 보내는 것처럼 그려져 있지만, 그러면 UC-15 E4의 HTTP 오류를 돌려줄 수 없다. 이 step은 E4와 ARCH 5.3 본문("스트림 시작 전 오류는 HTTP 코드 + `{ error }`")을 따른다.
- `toReportErrorResponse`: `RateLimitError`·상태 코드 429·500 이상·`APIConnectionError`·`APIConnectionTimeoutError` → `{ status: 502, error: MESSAGES.api.upstream }`. 그 외 전부 → `{ status: 500, error: MESSAGES.api.internal }`. **429는 앱의 하루 한도에만 쓴다.** Claude의 429를 429로 전달하지 않는다.
- 스트림이 끝나면 `stopReason === 'end_turn'`일 때만 `content_md`, `status = 'completed'`, `completed_at`을 저장한다. **DB 저장을 마친 뒤에 `ReadableStream`을 닫는다.** 이유: 화면은 스트림이 끝나자마자 상태를 조회한다(ADR-26). `max_tokens` 등으로 잘린 글은 저장하지 않는다.
- 글이 오던 중 오류가 나면 스트림을 닫기만 한다. 상태를 쓰지 않는다(화면이 상태 조회로 "중단"을 판정하고, 행은 10분 뒤 `abandoned`가 된다).
- 브라우저가 떠나 `controller.enqueue`가 실패해도 예외를 삼키고 글 모으기와 저장은 이어 간다. 이유: "완성 전에 떠나면 저장을 보장하지 않지만, 서버가 끝까지 받으면 남을 수 있다"(PRD F8). 끊김을 감지하는 장치는 두지 않는다.
- 예외 메시지와 스택은 서버 로그에만 남긴다. 응답에는 `MESSAGES.api.*` 문장만 넣는다.

첫 조각 대기의 형태(구현은 재량. 시그니처 수준의 스케치):

```ts
// 첫 onText에서 resolve, 그 전에 실패하거나 글 없이 끝나면 reject 되는 Promise를 둔다
const first = deferred<void>()
const body = new ReadableStream<Uint8Array>({ start(controller) { /* onText: enqueue + first.resolve() */ } })
const finished = streamReport(input, { jobId: reportId, onText })   // 끝나면 end_turn일 때 저장 → 그 뒤 controller.close()
try { await first.promise } catch (err) { return Response.json({ error }, { status }) }
return new Response(body, { headers })
```

### 핵심 규칙 — GET

- 두 GET 모두 처음에 `expireStaleReports(userId, now)`를 부른다.
- 목록: 그 사용자의 `status = 'completed'`만, `created_at DESC`. `generating`·`abandoned`는 돌려주지 않는다.
- 상세: id가 uuid 모양이 아니거나, 없거나, 남의 것이면 404 `MESSAGES.api.reportNotFound`. 상태와 무관하게 `status`를 돌려준다(화면이 스트림 종료 뒤 완료·중단을 판정한다). 완료가 아니면 `contentMd`는 null이다.
- 모든 조회에 `user_id = 현재 사용자` 조건을 건다. 남의 id에는 403이 아니라 404다.

### 확인된 사용법 (2026-09-18 조사)

- Next 16: 스트림 응답은 `new Response(ReadableStream, { headers })`다. `params`는 Promise라 `const { id } = await ctx.params`로 읽는다. 글 조각은 `TextEncoder`로 바이트로 바꿔 `enqueue`한다.
- Anthropic 오류 클래스: `Anthropic.BadRequestError`(400), `RateLimitError`(429), `APIConnectionTimeoutError`, `APIConnectionError`, `APIError`(`.status`).

설치된 패키지의 타입 정의와 다르면 타입 정의가 우선이다. 다르면 summary에 적어라.

### 테스트 (먼저 쓴다. 네트워크·DB 없음)

테스트를 쓰고 실패를 확인한 직후, 구현을 시작하기 전에 테스트 파일만 지정해서 커밋한다: `git add lib/claude/report.test.ts && git commit -m "test(2-reports-demo): step 1 — reports-api"`. `git add -A`를 쓰지 않는다(추적하지 않는 도구 파일이 딸려 들어간다). 구현은 하네스가 step 끝에 `feat(...)`로 커밋하므로, 기록에 "실패하는 테스트 → 통과시키는 구현" 순서가 남는다.

- `parseReportRequest`: `{ month: '2026-09' }` 통과 / `2026-13`, `2026-9`, 숫자, 빈 객체, null, 배열 → null.
- `toReportErrorResponse`: `RateLimitError` → 502 / 상태 503인 `APIError` → 502 / `APIConnectionTimeoutError` → 502 / fixture `fail-api`가 던지는 오류 → 502 / 일반 `Error` → 500 / 문자열 → 500. 문장은 `MESSAGES.api.upstream`·`MESSAGES.api.internal`과 같다.
- 라우트 핸들러를 네트워크로 테스트하지 않는다.

## Acceptance Criteria

```bash
set -eu
npm run lint
npm run build
npm run test

# 미로그인 요청은 proxy.ts에서 401 JSON을 받아야 한다
node node_modules/next/dist/bin/next start -p 3917 > /tmp/slipscan-reports-api.log 2>&1 &
SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null || true; lsof -ti tcp:3917 | xargs kill 2>/dev/null || true' EXIT
for i in $(seq 1 60); do curl -s -o /dev/null http://localhost:3917/ && break; sleep 1; done

test "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d '{"month":"2026-09"}' http://localhost:3917/api/reports)" = "401"
test "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3917/api/reports)" = "401"
test "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3917/api/reports/00000000-0000-4000-8000-000000000000)" = "401"
curl -s http://localhost:3917/api/reports | grep -q '로그인이 필요합니다.'
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가?
   - ADR 기술 스택을 벗어나지 않았는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/2-reports-demo/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`. summary에는 라우트 파일 2개, 더한 도우미 이름(`parseReportRequest`, `toReportErrorResponse`), 응답 헤더 이름(`X-Report-Id`), 응답 JSON의 필드 이름을 담는다.
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- 스트림을 `text`/`done`/`error` 이벤트로 나누는 규약(NDJSON·SSE)을 만들지 마라. 이유: 일반 텍스트 + `X-Report-Id` + 상태 조회로 판정한다(ADR-26).
- `stop_reason`이 `end_turn`이 아닌 글을 `completed`로 저장하지 마라. 이유: 잘린 글이 완료로 보인다(ARCH 5.3).
- DB 저장 전에 스트림을 닫지 마라. 이유: 화면이 곧바로 조회하면 아직 `generating`이라 "중단"으로 오판한다.
- 브라우저 이탈(abort)을 즉시 감지해 상태를 바꾸는 장치를 만들지 마라. 이유: PRD 10.1에서 제외했다. 10분 규칙으로 충분하다.
- 같은 달 보고서를 덮어쓰지 마라. 이유: 다시 만들면 둘 다 보관한다(PRD F8).
- 보고서 삭제·수정 API를 만들지 마라. 이유: PRD에 없다(UC-16).
- 집계 대상 거래가 0건인 달을 허용하지 마라. 이유: PRD F8.
- Claude의 429·5xx·타임아웃을 429로 전달하지 마라. 이유: "오늘 50회" 문구로 보이면 안 된다(ARCH 8절).
- 더블클릭을 막는 잠금·중복 생성 방지를 만들지 마라. 이유: PRD 10.3에서 감수했다.
- 도우미 함수를 `route.ts`에서 export하지 마라. 이유: Next.js가 라우트 파일의 임의 export를 빌드에서 거부한다.
- 오류 응답에 내부 오류 문자열을 넣지 마라. 로그에 API 키·거래 본문을 남기지 마라(ARCH 8절).
- 화면(`components/**`, `app/dashboard/**`)을 이 step에서 고치지 마라. 이유: 다음 step이다.
- 기존 테스트를 깨뜨리지 마라
