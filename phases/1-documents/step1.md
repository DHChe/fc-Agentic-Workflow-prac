# Step 1: usage-and-validate-lib

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/ARCHITECTURE.md` 3절(Vercel Blob 제약), 5.1("업로드와 사용량", "문서 생성"), 6절(`usage_log`), 9.1, 12절 ADR-13, 13.1(Vercel Blob 확인 결과)
- `/docs/PRD.md` F3, F9, 7절(10MB = 10,000,000바이트, 50회), 10.1·10.2
- `/docs/USER_FLOWS.md` UC-05, UC-17, 7.2
- phase `0-foundation`이 만든 파일: `/lib/messages.ts`, `/lib/db/schema.ts`, `/lib/db/client.ts`, `/scripts/db-smoke.ts`(스크립트가 `.env.local`을 읽는 방식의 본보기)
- 이 phase의 이전 step: `/lib/stats/aggregate.ts`(`seoulDayStart`)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 작업

`lib/usage/limit.ts`, `lib/upload/validate.ts`와 각각의 테스트 파일을 만든다. `@vercel/blob`을 설치한다(`package.json`에 `^메이저`, `package-lock.json` 커밋).

**테스트를 먼저 쓴다(TDD).** 단위 테스트는 DB와 Blob을 부르지 않는다.

### 시그니처

```ts
// lib/usage/limit.ts
export const DAILY_LIMIT = 50
export function usageWindow(now: Date): { start: Date; end: Date }      // aggregate.seoulDayStart를 가져다 쓴다
export async function countTodayUsage(userId: string, now: Date): Promise<number>
export async function recordUsage(entry: { id: string; userId: string; kind: UsageKind }): Promise<boolean>   // PK 충돌이면 false
export async function claimUpload(tx: Tx, args: { uploadId: string; userId: string; documentId: string }): Promise<boolean>

// lib/upload/validate.ts — 서버·브라우저 공용(서버 전용 import 금지)
export const MAX_FILE_BYTES = 10_000_000
export const ALLOWED_CONTENT_TYPES = ['image/jpeg', 'image/png', 'application/pdf'] as const
export type UploadExt = 'jpg' | 'jpeg' | 'png' | 'pdf'
export type PathCheck = { ok: true; uploadId: string; ext: UploadExt } | { ok: false }
export function validateUploadPath(pathname: string, userId: string): PathCheck
export function validateBlobUrl(blobUrl: string, userId: string, storeHost: string): PathCheck
export function getBlobStoreHost(): string                       // 서버에서만 부른다
export function mimeFromExt(ext: UploadExt): string
export function extFromContentType(type: string): UploadExt | null
export function checkClientFile(file: { size: number; type: string }): null | 'invalidType' | 'tooLarge'
```

`UsageKind`는 `lib/db/schema.ts`, `Tx`는 `lib/db/client.ts`의 타입이다.

### 핵심 규칙 — 사용량

- 하루 사용량은 `usage_log` 표의 행 수로만 센다. `documents`·`reports` 표를 세지 않는다. 그래야 문서를 지워도 사용량이 줄지 않는다(PRD F9, ADR-13).
- `usageWindow(now)`는 `{ start: seoulDayStart(now), end: start + 24시간 }`이다. 자정 계산을 여기서 다시 하지 않는다.
- `countTodayUsage`: `user_id = ?` AND `created_at >= start` AND `created_at < end`.
- `recordUsage`: insert 1행. PK(`id`) 충돌이면 오류를 던지지 않고 false를 돌려준다(`onConflictDoNothing` + `returning`으로 들어간 행이 있는지 본다). 문서는 호출자가 uploadId를 `id`로 주고, 보고서는 호출자가 새 uuid를 준다.
- `claimUpload(tx, …)`: UPDATE 한 번이다. `SET document_id = $documentId WHERE id = $uploadId AND user_id = $userId AND kind = 'document' AND document_id IS NULL`. 한 행이 바뀌었을 때만 true. 트랜잭션 안에서 부르므로 첫 인자로 `tx`를 받는다.
- 한도 50은 코드 상수다. 동시 요청으로 몇 건 넘는 것은 감수한다(PRD 10.2). 잠금을 두지 않는다.

### 핵심 규칙 — 업로드 경로와 blobUrl 검증

- `validateUploadPath(pathname, userId)`: 먼저 `decodeURIComponent`를 한다(잘못된 인코딩이면 거절). 디코드한 문자열이 `^{정규식 이스케이프한 userId}/{uuid}\.(jpg|jpeg|png|pdf)$`와 맞아야 한다. uuid는 소문자 16진 8-4-4-4-12다. 통과하면 `uploadId`는 그 uuid다.
- `validateBlobUrl(blobUrl, userId, storeHost)`: `new URL`로 파싱(실패하면 거절) → `protocol === 'https:'` → `host === storeHost` **완전 일치**(접미사·접두사·포트·userinfo가 붙으면 거절) → `search`와 `hash`가 비어 있어야 한다 → `pathname`에서 맨 앞 `/`를 뗀 값이 `validateUploadPath`를 통과해야 한다.
- 이유: 임의 URL을 받으면 서버가 남의 파일을 내려받아 Claude로 보낼 수 있다.
- `validate.ts`는 브라우저에서도 import한다. 서버 전용 모듈(`fs`, `@vercel/blob` 서버 API 등)을 import하지 않는다. `getBlobStoreHost()`는 함수 안에서만 `process.env`를 읽는다.
- `checkClientFile`: `type`이 `ALLOWED_CONTENT_TYPES`에 없으면 `'invalidType'`(빈 문자열 포함), `size > MAX_FILE_BYTES`면 `'tooLarge'`, 아니면 null. 형식 검사가 먼저다.
- `extFromContentType`: `image/jpeg → 'jpg'`, `image/png → 'png'`, `application/pdf → 'pdf'`, 그 외 null. `mimeFromExt`는 그 반대(`jpeg`도 `image/jpeg`).

### 확인된 Vercel Blob 사실 (2026-09-18 조사)

설치된 패키지의 타입 정의와 다르면 타입 정의가 우선이다. 다르면 summary에 적어라.

- 공개 URL은 `https://<storeId>.public.blob.vercel-storage.com/<pathname>`이다.
- 토큰은 `vercel_blob_rw_<storeId>_<secret>` 모양으로 알려져 있으나 **공식 계약이 아니다.** 그래서 아래 실제 확인을 한 번 한다.
- `put(pathname, body, { access: 'public', addRandomSuffix, allowOverwrite, contentType })`. `addRandomSuffix`와 `allowOverwrite`는 기본 false다. 같은 경로 재업로드는 `allowOverwrite: true`가 없으면 오류다.
- `put`·`upload`·`copy`·`list`는 고급 작업(월 2,000회)이고 `del`은 아니다. `list()`는 어디서도 부르지 않는다.

`getBlobStoreHost()`는 `BLOB_READ_WRITE_TOKEN`을 `_`로 나눈 네 번째 조각(storeId)을 소문자로 바꿔 `<storeId>.public.blob.vercel-storage.com`을 돌려준다. 토큰이 없거나 모양이 다르면 던진다.

### 스토어 호스트 실제 확인 (한 번, 저장소에 남기지 않는다)

단위 테스트가 아니다. 아래처럼 임시 스크립트로 한 번 실행하고 바로 지운다(패키지를 찾을 수 있게 저장소 루트에 잠깐 둔다). `put` 1회(고급 작업 1회)만 쓴다.

```bash
cat > ./host-check.tmp.mts <<'EOF'
process.loadEnvFile('.env.local')
const { put, del } = await import('@vercel/blob')
const { getBlobStoreHost } = await import('./lib/upload/validate.ts')
const r = await put('healthcheck/host-check.txt', 'ok', { access: 'public', allowOverwrite: true, contentType: 'text/plain' })
const actual = new URL(r.url).host
await del(r.url)
if (actual !== getBlobStoreHost()) { console.error(`MISMATCH actual=${actual} derived=${getBlobStoreHost()}`); process.exit(1) }
console.log('host ok')
EOF
set +e
npx tsx ./host-check.tmp.mts; HOST_CHECK=$?
set -e
rm -f ./host-check.tmp.mts; test "$HOST_CHECK" -eq 0
```

스크립트 모양은 실행 환경에 맞게 고쳐도 된다. 지켜야 할 것은 셋이다: 실제 `put` 결과의 호스트와 `getBlobStoreHost()`를 비교한다, 올린 파일을 `del`로 지운다, 스크립트 파일을 남기지 않는다.

값이 다르면 올바른 유도 방법을 찾아 `getBlobStoreHost()`를 고치고, 무엇이 달랐는지 summary에 적는다. 출력에 토큰을 찍지 않는다.

### 테스트 케이스

- `lib/usage/limit.test.ts`: `DAILY_LIMIT === 50`. `usageWindow`의 자정 경계 — 서울 23:59:59(`2026-09-17T14:59:59Z`)와 00:00:00(`2026-09-17T15:00:00Z`)이 서로 다른 창에 속한다. 창 길이는 정확히 24시간. `start`는 `seoulDayStart(now)`와 같다. "문서를 삭제한 뒤에도 사용량 유지"(ARCH 9.1)는 단위 테스트가 DB에 붙지 않으므로 구조로 보장한다(실제 동작은 USER_FLOWS 9.1 리허설 10번이 확인한다. 이 점을 summary에 적는다): 이 파일이 `documents`·`reports` 표를 import하지 않는다는 것을 소스 문자열 검사 한 줄로 확인한다.
- `lib/upload/validate.test.ts` — 경로: 정상 통과(jpg·jpeg·png·pdf), 남의 `userId`, `..` 포함, `%2e%2e`, 이중 인코딩(`%252e%252e`), 잘못된 인코딩(`%E0%A4%A`), 대문자 확장자(`.JPG`), `.webp`, 경로 조각 추가(`user/x/uuid.jpg`), 맨 앞 `/`, 대문자 uuid, 정규식 메타문자가 든 userId(`user.+`)가 다른 userId와 맞지 않음.
- blobUrl: 정상 통과, `http:`, 호스트 접미사(`…vercel-storage.com.evil.com`), userinfo(`https://<storeHost>@evil.com/…`), 포트(`:8443`), 다른 storeId, 쿼리·해시 붙음, URL이 아닌 문자열.
- `checkClientFile`: 10,000,000바이트 통과, 10,000,001 → `'tooLarge'`, `image/webp`·`image/heic`·빈 type → `'invalidType'`, 형식과 크기가 둘 다 틀리면 `'invalidType'`.
- `getBlobStoreHost`: 가짜 토큰 `vercel_blob_rw_AbC123_secret` → `abc123.public.blob.vercel-storage.com`, 토큰 없음 → 던짐(테스트 안에서 `process.env`를 바꾸고 되돌린다).

## Acceptance Criteria

```bash
set -eu
npm run lint
npm run build
npm run test
# 위 "스토어 호스트 실제 확인" 블록을 실행해 "host ok"가 나와야 한다
test -z "$(git status --porcelain | grep -i 'host-check' || true)"
test -f lib/usage/limit.ts
test -f lib/usage/limit.test.ts
test -f lib/upload/validate.ts
test -f lib/upload/validate.test.ts
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
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단. 이 step의 blocked 조건: `.env.local`에 `BLOB_READ_WRITE_TOKEN`이 없거나 `put`이 인증 오류를 낸다.

summary에 담을 것: 두 파일이 내보내는 이름 전부, 스토어 호스트를 어떻게 얻는지(토큰 네 번째 조각 방식이 실제 확인을 통과했는지, 고쳤다면 무엇으로).

## 금지사항

- Blob `list()`를 호출하지 마라. 이유: 월 2,000회 고급 작업 한도를 넘기면 30일간 Blob이 막힌다.
- 하루 한도를 환경변수로 받지 마라. 이유: PRD 10.1. 50은 코드 상수다.
- 사용량을 `documents`·`reports` 행 수로 세지 마라. 이유: ADR-13. 문서를 지우면 사용량이 환불되고 토큰만 받아 가는 업로드가 잡히지 않는다.
- 파일 앞 바이트(매직 바이트) 검사를 넣지 마라. 이유: PRD 10.1에서 제외했다.
- 사용량에 잠금·직렬화 장치를 넣지 마라. 이유: PRD 10.2에서 동시성 초과를 감수하기로 했다.
- host-check 스크립트를 저장소에 남기지 마라. 이유: 한 번 쓰는 확인이고, 단위 테스트는 실제 Blob을 부르지 않는다.
- `.env.local`의 값을 출력·커밋하지 마라.
- API 라우트를 만들지 마라. 이유: 토큰 발급·문서 생성 라우트는 step 8의 범위다.
- 기존 테스트를 깨뜨리지 마라
