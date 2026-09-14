# Step 2: supabase-layer

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `docs/ARCHITECTURE.md` — "패턴"의 라우트 가드, "데이터 모델", "환경 변수"
- `docs/ADR.md` — ADR-002, ADR-003, ADR-004, ADR-006
- `supabase/migrations/0001_init.sql` — 이미 존재한다. 테이블·정책 이름을 그대로 쓴다. 수정하지 마라
- `src/types/analysis.ts`, `src/services/repository/types.ts`, `src/services/storage/types.ts` — step 1 산출물
- `.env.example`

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 작업

이 step은 Supabase 클라이언트 팩토리, 라우트 가드, 저장소·스토리지 구현체를 만든다. 화면은 만들지 않는다.

### 1. 클라이언트 팩토리 (`src/lib/supabase/`)

```ts
// client.ts — 브라우저 전용
export function createBrowserSupabase(): SupabaseClient   // cookieOptions: { secure: process.env.NODE_ENV === 'production' }
// server.ts — Server Component / Route Handler 전용. 'server-only' import.
export async function createServerSupabase(): Promise<SupabaseClient>   // 같은 cookieOptions. 이유: @supabase/ssr 기본값에는 Secure 플래그가 없다
export const getCurrentUser: () => Promise<User | null>   // React cache()로 감싼다. 한 요청 안에서 layout과 page가 불러도 getUser()는 1회
// proxy.ts — src/proxy.ts에서만 사용
export async function updateSession(request: NextRequest): Promise<{ response: NextResponse; user: User | null }>
// guard.ts — 순수 함수
export function decideRedirect(pathname: string, hasUser: boolean): '/login' | '/dashboard' | null
```

- `@supabase/ssr`의 `createBrowserClient` / `createServerClient`를 쓴다. `createServerClient`의 cookies 옵션은 `getAll` / `setAll` 방식이다. `setAll`은 Server Component에서 호출되면 예외가 나므로 try/catch로 무시한다.
- `updateSession`은 `supabase.auth.getUser()`를 호출해 세션을 갱신하고, 갱신된 쿠키가 담긴 `NextResponse`와 `user`(실패·세션 없음이면 `null`)를 함께 반환한다. `getSession()`은 쓰지 않는다 (서버에서 신뢰 불가).
- `updateSession`의 `setAll`은 반드시 두 곳에 쓴다. 이유: 토큰이 회전한 요청에서 라우트 핸들러와 Server Component가 들어온 요청의 옛 쿠키를 읽어 401이 나는 것을 막는다 (약 1시간마다 발생).
  ```ts
  setAll(cookiesToSet) {
    cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
    response = NextResponse.next({ request })
    cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
  }
  ```
- `getCurrentUser`는 `import { cache } from 'react'`로 감싼 함수다: `createServerSupabase()` → `auth.getUser()` → `data.user ?? null`. `(app)/layout.tsx`와 페이지들은 `auth.getUser()`를 직접 부르지 않고 이것만 쓴다. 이유: 요청당 Supabase Auth 왕복을 1회로 줄인다.
- `decideRedirect` 규칙: `hasUser=false`이고 `/dashboard`로 시작 → `'/login'`. `hasUser=true`이고 정확히 `/login` → `'/dashboard'`. 그 외 → `null`. `/auth/callback`, `/api/**`, `/`는 항상 `null`.
- 환경변수는 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`. 반드시 팩토리 함수 본문 안에서 읽고, 없으면 명확한 한국어 메시지로 throw. 모듈 최상위에서 읽지 마라. 이유: `.env.local`이 없는 환경에서 `npm run build`가 깨져 `blocked`여야 할 상황이 `error`가 된다.

### 2. `src/proxy.ts`

```ts
export async function proxy(request: NextRequest): Promise<NextResponse>
export const config = { matcher: ['/((?!api/|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'] }
// `/api/**`는 제외한다. 이유: 라우트 핸들러가 자체 클라이언트로 세션을 확인·갱신하므로 proxy의 getUser() 왕복이 중복이다
```

`updateSession` → `decideRedirect(pathname, user !== null)` → redirect 필요 시 `NextResponse.redirect(new URL(target, request.url))`를 만든 뒤, `updateSession`이 돌려준 `response.cookies.getAll()`을 순회해 redirect 응답에 `cookies.set(cookie)`로 전부 복사하고 그 redirect 응답을 반환한다. 이유: 갱신된 세션 쿠키가 새 응답 객체에는 없어서 유실된다. redirect가 필요 없으면 갱신된 `response`를 그대로 반환. Next 16은 파일명 `proxy.ts`와 함수명 `proxy`를 요구한다. `npx next --version`이 16 미만이면 `middleware.ts`/`middleware`로 만들고 summary에 기록하라.

### 3. 구현체

```ts
// src/services/repository/supabase-analysis-repository.ts
export class SupabaseAnalysisRepository implements AnalysisRepository {
  constructor(private readonly supabase: SupabaseClient) {}
}
// src/services/repository/index.ts — 페이지·API는 이 팩토리만 import 한다 (구현 클래스 직접 import 금지)
export function createAnalysisRepository(supabase: SupabaseClient): AnalysisRepository
// src/services/storage/index.ts
export function createReceiptStorage(supabase: SupabaseClient): ReceiptStorage
// src/services/storage/supabase-receipt-storage.ts
export class SupabaseReceiptStorage implements ReceiptStorage {
  constructor(private readonly supabase: SupabaseClient, private readonly bucket = 'receipts') {}
}
// src/services/storage/browser-upload.ts — 브라우저 전용
export async function uploadReceipt(supabase: SupabaseClient, userId: string, file: File): Promise<{ storagePath: string }>
```

- 테이블 `analyses`, 컬럼은 snake_case. 행 ↔ 도메인 객체 매핑 함수를 파일 안에 두고 export 한다 (`toAnalysis(row)`, `toSummary(row)`). `result` jsonb는 `AnalysisResult`로 캐스팅한다. 이유: 이 컬럼은 이 앱의 서버만 쓰므로 읽을 때 다시 검증하지 않는다. `toAnalysis`는 `edited_at` → `editedAt`(없으면 null)을 매핑한다.
- `listByUser`: `user_id` 일치, `created_at` 내림차순, 최근 100건으로 `limit`. 이유: MVP에는 페이지네이션이 없다 (USER_FLOWS 11절). summary 필드(`documentType`, `merchant`, `date`, `currency`, `totalAmount`, `category`)는 `result` jsonb에서 뽑는다.
- `getById`: `id`와 `user_id` 둘 다 조건으로 걸고 `maybeSingle()`. 없으면 `null`.
- `delete(id, userId): Promise<Analysis | null>`: `.delete().eq('id').eq('user_id').select().maybeSingle()` 한 번으로 지우면서 지운 행을 돌려준다. 없으면 `null`. 이유: 삭제 전 `getById` 왕복과 경쟁 조건을 없앤다. 핸들러는 반환된 행의 `storagePath`로 파일을 지운다.
- `update(id, userId, patch)`: `getById`로 읽고(없으면 `null` 반환), `result`에 `patch`의 키 중 `EDITABLE_FIELDS`에 있는 것만 얕게 병합한 뒤 `result`와 `edited_at = new Date().toISOString()`을 `id`·`user_id` 조건으로 update, 갱신된 행을 `toAnalysis`로 반환한다.
- Supabase가 `error`를 돌려주면 `Error(error.message)`를 throw 한다.
- `download`는 `Blob`을 `Uint8Array`로 변환해 반환. `createSignedUrl`은 `signedUrl` 문자열만 반환.
- `uploadReceipt`: 경로는 `${userId}/${crypto.randomUUID()}.${ext}`. `ext`는 mimeType에서 결정한다 (pdf/jpg/png/webp). `upsert: false`, `contentType: file.type`.

### 4. 테스트 (먼저 작성)

- `src/lib/supabase/guard.test.ts`: 위 규칙을 표로 검증한다 (최소 8케이스).
- `src/services/repository/supabase-analysis-repository.test.ts`: `from().select().eq().order()` 체인을 흉내 내는 mock 객체를 만들어 `listByUser`가 올바른 테이블·조건·정렬로 호출하고 summary로 매핑하는지, `getById`가 없을 때 `null`인지, `error` 시 throw 하는지, `update`가 `result`를 병합하고 `edited_at`을 채워 update 하는지, 없는 id면 `null`인지, `delete`가 지운 행을 돌려주고 없으면 `null`인지 검증한다.
- `src/services/storage/supabase-receipt-storage.test.ts`: `download`가 Uint8Array를 반환하고, `remove`·`createSignedUrl`이 올바른 경로로 호출되는지.
- `src/services/storage/browser-upload.test.ts`: 경로가 `${userId}/<uuid>.<ext>` 형식인지, `upload`가 `contentType`과 함께 호출되는지.
- 실제 네트워크 호출은 하지 않는다.

## Acceptance Criteria

```bash
npm run lint
npm run build
npm run test
```

추가로 아래 연결 확인을 실행한다. `.env.local`이 없으면 이 확인은 건너뛰고 `blocked` 처리한다 (아래 검증 절차 4).

```bash
set -a; source .env.local; set +a
curl -s -o /dev/null -w "%{http_code}\n" \
  "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/analyses?select=id,user_id,file_name,mime_type,storage_path,result,created_at,edited_at&limit=1" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" -H "Authorization: Bearer $NEXT_PUBLIC_SUPABASE_ANON_KEY"
# 기대값: 200  (RLS로 빈 배열이 돌아온다. 404면 마이그레이션 미적용, 400이면 컬럼명 불일치, 401이면 키 오류)
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가?
   - ADR 기술 스택을 벗어나지 않았는가? (`@supabase/ssr` 사용, service_role 없음)
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가? (`@supabase/supabase-js`를 `src/lib/supabase/`, `src/services/` 밖에서 import 하지 않음)
3. 코드와 테스트가 완성되고 AC가 통과했으면 먼저 커밋한다.
4. 연결 확인 결과에 따라 `phases/0-mvp/index.json`의 해당 step을 업데이트한다:
   - `.env.local`이 없거나 두 Supabase 변수가 비어 있음 → `"status": "blocked"`, `"blocked_reason": ".env.local에 NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY를 채우세요. Supabase 대시보드 → Project Settings → API에서 복사."` 후 즉시 중단
   - HTTP 200이 아님 → `"status": "blocked"`, `"blocked_reason": "Supabase 대시보드 → SQL Editor에서 supabase/migrations/0001_init.sql 전체를 실행하세요. (응답 코드: NNN)"` 후 즉시 중단
   - 200 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"` (클래스·함수 이름과 파일 경로, proxy 파일명 포함)
   - 코드 자체가 3회 수정 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
5. 이 step이 재실행되어 파일이 이미 존재하면 다시 만들지 말고, AC와 연결 확인만 수행한 뒤 상태를 갱신하라.

## 금지사항

- `service_role` 키를 코드·환경변수·테스트 어디에도 쓰지 마라. 이유: RLS 우회 위험 (CLAUDE.md CRITICAL).
- `supabase/migrations/0001_init.sql`을 수정하지 마라. 이유: 사용자가 이미 대시보드에 적용한 상태일 수 있다.
- 로그인 페이지·대시보드·API 라우트를 만들지 마라. 이유: 이후 step의 범위다.
- `getSession()`으로 서버에서 사용자를 판단하지 마라. 이유: 쿠키 위조 가능. `getUser()`만 신뢰한다.
- 기존 테스트를 깨뜨리지 마라.
