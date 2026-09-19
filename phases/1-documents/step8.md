# Step 8: upload-api

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/ARCHITECTURE.md` 5.1(업로드와 사용량, 문서 생성), 6절(`usage_log`, `documents`), 8절(API 목록, 에러 응답 규약), 13.1(Vercel Blob, Next 16)
- `/docs/PRD.md` F3, F9, 7절(제한값), 10.2·10.3(감수 목록)
- `/docs/USER_FLOWS.md` UC-05(E3~E6), 7.3
- `/lib/messages.ts` (`MESSAGES.api.*`)
- `/lib/db/schema.ts`, `/lib/db/client.ts` (`getDb`, `Tx`)
- `/proxy.ts` (미로그인 `/api/**` → 401 JSON)
- `/lib/usage/limit.ts`, `/lib/upload/validate.ts` (이 묶음 step 1)
- `/lib/pipeline/process-document.ts` (이 묶음 step 7)
- `/lib/stats/aggregate.ts` (이 묶음 step 0. 직접 쓰지는 않지만 `limit.ts`가 기댄다)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 작업

업로드 허가(토큰) 발급 라우트와 문서 생성 라우트를 만든다. 파일 본문은 브라우저가 Vercel Blob으로 직접 올린다. 이 두 라우트는 파일 본문을 받지 않는다.

만들 파일:

- `lib/upload/rules.ts`, `lib/upload/rules.test.ts` (테스트를 먼저 쓴다)
- `app/api/blob/upload/route.ts`
- `app/api/documents/route.ts` (POST만)

### 이 step이 부르는 함수 (이미 있다. 다시 만들지 마라)

```ts
// lib/usage/limit.ts
export const DAILY_LIMIT = 50
export async function countTodayUsage(userId: string, now: Date): Promise<number>
export async function recordUsage(entry: { id: string; userId: string; kind: UsageKind }): Promise<boolean>   // PK 충돌이면 false
export async function claimUpload(tx: Tx, args: { uploadId: string; userId: string; documentId: string }): Promise<boolean>

// lib/upload/validate.ts
export const MAX_FILE_BYTES = 10_000_000
export const ALLOWED_CONTENT_TYPES = ['image/jpeg', 'image/png', 'application/pdf'] as const
export type PathCheck = { ok: true; uploadId: string; ext: UploadExt } | { ok: false }
export function validateUploadPath(pathname: string, userId: string): PathCheck
export function validateBlobUrl(blobUrl: string, userId: string, storeHost: string): PathCheck
export function getBlobStoreHost(): string
export function mimeFromExt(ext: UploadExt): string

// lib/pipeline/process-document.ts
export async function processDocument(documentId: string, opts: { fileName: string }): Promise<void>   // 절대 던지지 않는다
```

### 1. `lib/upload/rules.ts` (순수 함수. 테스트 먼저)

`route.ts`는 HTTP 메서드와 라우트 설정(`maxDuration` 등) 외에는 export할 수 없다(Next 빌드 오류). 그래서 테스트할 규칙은 이 파일에 둔다.

```ts
export type UploadTokenDecision = { ok: true } | { ok: false; status: 400 | 401 | 429; error: string }

// null은 "아직 확인하지 않은 단계"이고 통과로 본다. 앞 단계부터 순서대로 검사해 첫 실패를 돌려준다.
export function decideUploadToken(input: {
  userId: string | null
  pathCheck: PathCheck | null
  used: number | null        // 오늘 사용량
  recorded: boolean | null   // recordUsage 결과
}): UploadTokenDecision

export const createDocumentBodySchema   // zod: { blobUrl: string, fileName: string(1..255) }
```

테스트 케이스:
- `userId` 없음 → 401 + `MESSAGES.api.unauthorized`
- `pathCheck.ok === false` → 400 + `MESSAGES.api.badRequest`
- `used === 49` → 통과, `used === 50` → 429 + `MESSAGES.api.limitReached`, `used === 51` → 429
- `recorded === false`(같은 uploadId 재사용) → 400
- 여러 단계가 동시에 실패면 앞 단계의 결과가 나온다(401 > 400 > 429 > 400)
- 본문 스키마: 정상 통과, `fileName` 빈 문자열·256자 거부, `blobUrl` 누락 거부, 모르는 필드는 무시

### 2. `POST /api/blob/upload`

`@vercel/blob/client`의 `handleUpload`를 쓴다. `onBeforeGenerateToken` 안의 검사 순서는 고정이다.

1. `auth()`로 `userId`를 얻는다. 없으면 401.
2. `validateUploadPath(pathname, userId)`. 실패면 400. 서버는 경로를 바꿀 수 없고 검사만 한다.
3. `countTodayUsage(userId, now) < DAILY_LIMIT`. 아니면 429.
4. `recordUsage({ id: uploadId, userId, kind: 'document' })`. false(이미 쓴 uploadId)면 400. **차감 시점은 여기다.** 이 뒤에 업로드가 실패해도 1회로 센다.
5. `{ allowedContentTypes: [...ALLOWED_CONTENT_TYPES], maximumSizeInBytes: MAX_FILE_BYTES, addRandomSuffix: false }`를 돌려준다.

핵심 규칙:
- 단계마다 `decideUploadToken`으로 판정한다. 부수 효과가 있는 4번은 1~3번이 통과한 뒤에만 실행한다.
- 거절은 콜백 안에서 작은 오류 클래스(상태 코드 + 문구를 가진)를 던지고, 라우트의 `catch`에서 `{ error }` + 상태 코드로 바꾼다. `handleUpload`가 콜백 오류를 감싸 다시 던지는지 설치된 소스에서 확인하라. 감싸면 콜백 밖 변수에 판정 결과를 적어 두고 `catch`에서 그것을 쓴다.
- 오류 본문은 항상 `{ error: MESSAGES.api.* }`다. 그 외 오류는 500 + `MESSAGES.api.internal`이고, 예외 메시지·스택은 서버 로그에만 남긴다.
- `onUploadCompleted`는 쓰지 않는다(ARCH 5.1). 설치된 `handleUpload`의 타입이 생략을 허용하면 아예 넘기지 않는다(그래야 Vercel이 완료 콜백을 보내지 않는다). 타입이 요구할 때만 빈 async 함수로 둔다. 어느 쪽으로 했는지 summary에 적어라. Vercel이 우리 서버를 부르는 방식이라 localhost에서는 호출되지 않는다. 문서 생성은 브라우저가 `POST /api/documents`로 한다. 운영에서 Vercel의 완료 콜백은 Clerk 세션이 없어 `proxy.ts`의 401로 끝나는데, 이 앱은 그 콜백을 쓰지 않으므로 문제가 아니다.

확인된 Vercel Blob 사용법(2026-09-18 조사, `@vercel/blob` 2.8.0). 설치된 패키지의 타입 정의와 다르면 타입 정의가 우선이다. 다르면 summary에 적어라.
- 서버: `handleUpload({ body, request, onBeforeGenerateToken, onUploadCompleted })`. `onBeforeGenerateToken(pathname, clientPayload, multipart)`의 반환: `allowedContentTypes`, `maximumSizeInBytes`, `addRandomSuffix`(기본 false), `allowOverwrite`(기본 false), `tokenPayload`, `validUntil`. 거절은 throw.
- `onUploadCompleted`는 타입상 필요할 수 있으나 localhost로는 호출되지 않는다.
- 같은 경로 재업로드는 오류다(`allowOverwrite`를 켜지 않는다).
- 공개 URL은 `https://<storeId>.public.blob.vercel-storage.com/<pathname>`이다.
- `put`·`upload`·`copy`·`list`는 고급 작업(월 2,000회)이고 `del`은 아니다.

### 3. `POST /api/documents`

```ts
export const maxDuration = 300
export async function POST(request: Request): Promise<Response>
```

순서:
1. `auth()` → 없으면 401.
2. 본문을 `createDocumentBodySchema`로 검증. JSON이 아니거나 실패면 400.
3. `validateBlobUrl(blobUrl, userId, getBlobStoreHost())`. 실패면 400. 이유: 임의 URL을 받으면 서버가 남의 파일을 내려받아 Claude로 보낼 수 있다.
4. **한 트랜잭션**(`getDb().transaction`): 새 `documentId`(uuid) 생성 → `claimUpload(tx, { uploadId, userId, documentId })`. false(없는 uploadId, 이미 쓴 uploadId)면 롤백하고 400 → `documents` 행 삽입(`user_id`, `status: 'processing'`, `doc_type: 'unknown'`, `original_url: blobUrl`, `original_mime: mimeFromExt(ext)`).
5. 201 `{ documentId }`로 즉시 응답한다.
6. `after(() => processDocument(documentId, { fileName }))`. `after`는 `next/server`에서 가져온다. `maxDuration` 안에서 돈다.

핵심 규칙:
- 사용량은 여기서 다시 세지 않는다. 차감은 토큰 발급 때 끝났다.
- `fileName`은 `processDocument`에만 넘긴다(테스트 모드 fixture 선택용). DB에 저장하지 않는다.
- `original_mime`은 URL 확장자에서 서버가 정한다. 브라우저가 보낸 형식을 믿지 않는다.
- 모든 DB 쓰기에 `user_id`가 들어간다.

## Acceptance Criteria

```bash
set -eu
npm run lint
npm run build
npm run test

# 미로그인 응답 확인 (proxy.ts가 401 JSON을 돌려준다)
LOG=$(mktemp); npx next start -p 3917 > "$LOG" 2>&1 & SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null || true; lsof -ti tcp:3917 | xargs kill 2>/dev/null || true' EXIT
for i in $(seq 1 60); do curl -s -o /dev/null http://localhost:3917/ && break; sleep 1; done
check401() {
  out=$(curl -s -X "$1" -w '\n%{http_code}' "http://localhost:3917$2")
  test "$(echo "$out" | tail -n1)" = "401"
  echo "$out" | grep -q '로그인이 필요합니다.'
}
check401 POST /api/blob/upload
check401 POST /api/documents
echo "server checks ok"
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가? (`lib/upload/rules.ts`는 `lib/upload/` 안의 추가 파일이다)
   - ADR 기술 스택을 벗어나지 않았는가?
   - AGENTS.md CRITICAL 규칙을 위반하지 않았는가? (파일 본문을 받지 않는다, `user_id` 조건, Blob `list()` 금지, 경로·`blobUrl` 검증)
3. 결과에 따라 `phases/1-documents/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "..."`. summary에는 만든 라우트 파일 2개, `lib/upload/rules.ts`가 내보내는 이름(`decideUploadToken`, `createDocumentBodySchema`), `handleUpload` 오류 전달 방식(그대로 던져지는지, 감싸져서 우회했는지), 타입 정의와 달랐던 점을 적는다.
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- API 라우트가 파일 본문(multipart, base64 등)을 받게 하지 마라. 이유: Vercel 서버 요청 본문 한도가 4.5MB라 10MB 파일이 막힌다.
- `onUploadCompleted`에 로직을 넣지 마라. 이유: localhost에서 호출되지 않아 개발·테스트에서 문서가 생기지 않는다.
- Blob `list()`를 호출하지 마라. 이유: 월 2,000회 고급 작업 한도를 넘기면 30일간 Blob이 막힌다.
- 서버에서 경로를 바꾸거나 `addRandomSuffix`를 켜지 마라. 이유: 경로의 uuid가 uploadId이고 `usage_log.id`와 짝이다.
- `blobUrl` 검증을 건너뛰거나 호스트를 부분 일치로 비교하지 마라. 이유: 남의 파일을 Claude로 보내는 길이 열린다.
- `POST /api/documents`에서 사용량을 다시 기록하지 마라. 이유: 이중 차감이다.
- 오류 응답에 예외 메시지·스택·SQL을 넣지 마라. 이유: ARCH 8절 규약. 화면은 고정 문장만 보여준다.
- 동시 요청용 잠금, 호출 횟수 제한, uploadId 재사용 복구 장치를 만들지 마라. 이유: PRD 10.2·10.3에서 감수로 확정했다.
- 라우트 핸들러를 네트워크로 호출하는 단위 테스트를 쓰지 마라. 이유: 단위 테스트는 DB·Blob·Clerk를 부르지 않는다. 규칙은 `lib/upload/rules.ts`에서 검증한다.
- 이 step에 적히지 않은 라우트(`GET /api/dashboard`, `documents/[id]` 등)를 만들지 마라. 이유: 다음 step의 범위다.
- `.env.local`의 값을 출력·커밋하지 마라. 로그에 토큰·연결 문자열을 남기지 마라.
- 기존 테스트를 깨뜨리지 마라
