# Step 5: analysis-api

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `docs/ARCHITECTURE.md` — "API 라우트 구조", "에러", "데이터 흐름"
- `docs/ADR.md` — ADR-004 (실패 시 파일 정리), ADR-005 (`maxDuration`)
- `src/types/analysis.ts` (`MAX_PDF_BYTES`, `MAX_IMAGE_BYTES`), `src/lib/schemas/analysis.ts` (`createAnalysisRequestSchema`, `updateAnalysisRequestSchema`)
- `src/services/analyzer/*`, `src/services/repository/*`, `src/services/storage/*` — 인터페이스와 구현체
- `src/lib/supabase/server.ts`

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 작업

### 1. 핸들러 팩토리 `src/app/api/analyses/handler.ts`

```ts
export interface AnalysisApiDeps {
  getUserId(): Promise<string | null>
  storage: ReceiptStorage
  analyzer: DocumentAnalyzer
  repository: AnalysisRepository
}
export function createPostHandler(deps: AnalysisApiDeps): (request: Request) => Promise<Response>
export function createDeleteHandler(deps: AnalysisApiDeps): (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>
export function createPatchHandler(deps: AnalysisApiDeps): (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>
```

POST 순서와 상태 코드:
1. `getUserId()` → `null`이면 401 `{ error: '로그인이 필요합니다.' }`
2. 본문 JSON을 `createAnalysisRequestSchema`로 파싱 → 실패 400 `{ error: '요청 형식이 올바르지 않습니다.' }`
3. `storagePath`가 정규식 `^${userId}/[0-9a-f-]{36}\.(pdf|jpg|png|webp)$`와 일치하지 않으면 403 `{ error: '접근할 수 없는 파일입니다.' }`. 이유: Storage RLS가 이미 막지만, 남의 경로로 download·remove를 시도하기 전에 끊는다.
4. `storage.download` → 실패 404 `{ error: '파일을 찾을 수 없습니다.' }`
5. 크기 확인: PDF는 `MAX_PDF_BYTES`, 이미지는 `MAX_IMAGE_BYTES` 초과 시 413 `{ error: '파일이 너무 큽니다. PDF 20MB, 이미지 5MB 이하만 가능합니다.' }`. 이 시점부터 실패하면 `storage.remove(storagePath)`를 best-effort로 호출한다 (remove가 실패하면 `console.error`만 남기고 응답은 바꾸지 않는다).
6. `analyzer.analyze` → `AnalyzerError.code`가 `invalid_output`이면 422 `'분석 결과를 읽을 수 없습니다. 다른 파일로 시도하세요.'`, `rejected_input`이면 422 `'이 파일은 분석할 수 없습니다. 암호가 걸렸거나 페이지 수·해상도가 너무 큽니다.'`(재시도 안내 없음), `provider_error`면 502 `'분석 서비스 호출에 실패했습니다. 잠시 후 다시 시도하세요.'`. 그 외 예외는 500 `'분석 중 오류가 발생했습니다.'`. 모두 파일 정리 후 응답. 응답 `error`는 위 고정 문구만 쓰고, 예외의 `message`는 `console.error`에만 남긴다. 이유: 제공자 오류 문자열(요청 id, 모델명)이 브라우저에 노출되면 안 된다.
7. `repository.create` → 실패 500 (파일 정리). 성공 200 `{ id }`.

DELETE:
1. 401 확인.
2. `params`를 await 해 `id`. `repository.delete(id, userId)` → `null`이면 404 `{ error: '분석을 찾을 수 없습니다. 이미 삭제되었을 수 있습니다.' }`.
3. 반환된 행의 `storagePath`로 `storage.remove` (실패 시 `console.error`, 응답은 200 유지) → 200 `{ ok: true }`.

PATCH (결과 수정):
1. 401 확인.
2. 본문 JSON을 `updateAnalysisRequestSchema`로 파싱 → 실패 400 `{ error: 첫 번째 zod 메시지 }`.
3. `repository.update(id, userId, patch)` → `null`이면 404 `{ error: '분석을 찾을 수 없습니다. 이미 삭제되었을 수 있습니다.' }` → 성공 200 `{ analysis }`.

응답은 `Response.json(body, { status })`로 만든다. 에러 로그는 `console.error`에 코드와 메시지만 남기고 파일 내용은 남기지 않는다.

### 2. 의존성 조립 `src/app/api/analyses/deps.ts`

```ts
import 'server-only'
export async function buildDeps(): Promise<AnalysisApiDeps>
```

`createServerSupabase()` 한 번으로 `getUserId`(`auth.getUser()`), `createReceiptStorage(supabase)`, `createAnalysisRepository(supabase)`를 만들고 `createDocumentAnalyzer()`를 붙인다. 구현 클래스를 직접 import 하지 않는다.

### 3. 라우트 파일

```ts
// src/app/api/analyses/route.ts
export const runtime = 'nodejs'
export const maxDuration = 60
export async function POST(request: Request): Promise<Response>   // buildDeps() → createPostHandler(deps)(request)

// src/app/api/analyses/[id]/route.ts
export const runtime = 'nodejs'
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response>
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response>
```

`route.ts`에는 HTTP 메서드와 위 설정 상수 외에 아무것도 export 하지 않는다.

### 4. 테스트 (먼저 작성) `src/app/api/analyses/handler.test.ts`

가짜 `deps`(모든 메서드 `vi.fn()`)로 핸들러를 직접 호출한다. 요청은 `new Request('http://localhost/api/analyses', { method: 'POST', body: JSON.stringify(...) })`.
- 미인증 → 401.
- `mimeType: 'image/gif'` → 400.
- `storagePath: 'other-user/x.pdf'` → 403, `download`·`remove` 모두 미호출 (남의 파일을 지우는 순서 역전을 막는 음성 테스트).
- 정상 → `download` → `analyze` → `create` 순서로 호출되고 200 `{ id }`.
- 이미지 6MB → 413, `analyze` 미호출, `remove` 호출.
- `analyze`가 `invalid_output`으로 reject → 422, `remove`가 `storagePath`로 호출됨.
- `analyze`가 `rejected_input`으로 reject → 422, 문구에 "다시 시도"가 없다.
- `analyze`가 `provider_error`로 reject → 502, 본문 `error`가 고정 문구이고 SDK 메시지를 포함하지 않는다.
- `remove`가 reject 해도 응답 상태는 바뀌지 않는다.
- DELETE: `delete`가 `null` → 404이고 본문 `error`가 고정 문구, `remove` 미호출. 정상 → `delete`가 돌려준 행의 `storagePath`로 `remove` 호출 후 200.
- PATCH: `{}` → 400. `{ date: '2026/09/01' }` → 400. `update`가 `null` → 404. `{ merchant: '이마트' }` → `update`가 그 patch로 호출되고 200 `{ analysis }`.

## Acceptance Criteria

```bash
npm run lint
npm run build
npm run test
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조와 에러 코드 표를 따르는가?
   - ADR 기술 스택을 벗어나지 않았는가? (`maxDuration = 60`, nodejs runtime)
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가? (핸들러가 인터페이스 타입에만 의존, SDK 직접 import 없음)
3. 결과에 따라 `phases/0-mvp/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"` (엔드포인트, 상태 코드 규칙, 파일 경로 포함)
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- multipart/form-data로 파일 본문을 받지 마라. 이유: Vercel 4.5MB 제한 (CLAUDE.md CRITICAL, ADR-004).
- `runtime = 'edge'`를 쓰지 마라. 이유: `Buffer`와 Anthropic SDK가 Node 런타임을 전제한다.
- 예외 객체의 `message`를 응답 본문에 넣지 마라. 이유: 제공자 내부 정보 노출. 고정 문구만 사용한다.
- `service_role` 키로 RLS를 우회하지 마라. 이유: CLAUDE.md CRITICAL.
- `route.ts`에 헬퍼 함수를 export 하지 마라. 이유: Next.js 빌드가 라우트 파일의 추가 export를 거부한다.
- 요청 출처(Origin) 검사, 파일 매직 바이트 검사, 사용량 한도를 추가하지 마라. 이유: PRD MVP 제외. 공개 가입이 없어 사용자는 전부 운영자 발급 계정이다.
- 화면 컴포넌트를 만들지 마라. 이유: step 6, 7의 범위다.
- 기존 테스트를 깨뜨리지 마라.
