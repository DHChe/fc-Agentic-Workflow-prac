# Step 3: auth-flow

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `docs/ARCHITECTURE.md` — "패턴"의 인증·라우트 가드 절, 디렉토리 구조의 `(auth)`, `(app)`, `auth/callback`
- `docs/ADR.md` — ADR-002
- `docs/UI_GUIDE.md` — 입력 필드, 버튼, 레이아웃(인증 페이지 `max-w-sm`), 앱 헤더
- `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts`, `src/proxy.ts` — step 2 산출물
- `src/components/ui/*`, `src/components/theme-toggle.tsx`, `src/app/layout.tsx` — step 0 산출물

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 작업

### 1. 폼 스키마 `src/lib/schemas/auth.ts`

```ts
export const credentialsSchema  // { email: 이메일 형식, password: 8자 이상 }. 메시지는 한국어
export type Credentials = z.infer<typeof credentialsSchema>
```

### 2. 인증 컴포넌트 (`src/components/auth/`, 모두 `'use client'`)

```ts
export function LoginForm(): React.JSX.Element
export function GoogleButton(props: { label?: string }): React.JSX.Element   // 기본 label "Google로 계속하기"
export function SignOutButton(): React.JSX.Element
```

- `createBrowserSupabase()`는 컴포넌트 본문이 아니라 submit·click 핸들러 안에서 호출한다. 이유: 클라이언트 컴포넌트도 서버에서 한 번 렌더되므로 본문에서 호출하면 서버에서 실행된다. 테스트는 `vi.mock('@/lib/supabase/client')`로 대체한다.
- `LoginForm`: `credentialsSchema`로 검증 → 실패 시 필드 아래 메시지, Supabase 호출 없음. 성공 시 `signInWithPassword`. 에러 메시지 매핑: `Invalid login credentials` → "이메일 또는 비밀번호가 올바르지 않습니다." 그 외는 "로그인에 실패했습니다. 잠시 후 다시 시도하세요." 성공 → `router.push('/dashboard')` 후 `router.refresh()`. 아래에 `GoogleButton`과 안내 문구 "계정이 없으신가요? 관리자에게 계정 발급을 요청하세요." (링크 없음). 이유: 공개 가입이 없다 (ADR-002).
- `GoogleButton`: `signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/auth/callback` } })`. secondary 스타일. 로고 이미지 없이 텍스트만.
- `SignOutButton`: `signOut({ scope: 'local' })` → `router.push('/')` → `router.refresh()`. 실패하면 이동하지 않고 "로그아웃에 실패했습니다."를 표시. text 스타일. 이유: 기본 `scope: 'global'`은 같은 계정이 열린 다른 기기까지 끊어 시연 중 사고가 난다.
- 제출 중에는 버튼을 `disabled` 하고 라벨을 "처리 중…"으로 바꾼다.

### 3. 페이지와 레이아웃

- `src/app/(auth)/layout.tsx`: 화면 중앙, `max-w-sm`, 상단에 "SlipScan" 로고 텍스트(링크 `/`), 카드 안에 children.
- `src/app/(auth)/login/page.tsx`: 제목 "로그인"과 폼. `searchParams`(Promise, await)의 `error=oauth`이면 "Google 로그인에 실패했습니다. 발급된 계정의 Google 이메일인지 확인하세요."를 폼 위에 표시. 이유: 미발급 이메일로 Google 로그인하면 Supabase가 가입을 거부해 콜백이 실패한다.
- `src/app/auth/callback/route.ts`: `GET`. `code` 쿼리 → `createServerSupabase()` → `auth.exchangeCodeForSession(code)`. 성공 → `/dashboard`로 redirect, 실패 또는 `code` 없음 → `/login?error=oauth`로 redirect. redirect URL은 `request.url` 기준 `new URL()`로 만든다.
- `src/app/(app)/layout.tsx` (Server Component): `getCurrentUser()`(step 2, React cache). `user`가 없으면 `redirect('/login')`. `AppHeader`와 `<main className="mx-auto max-w-5xl px-6 py-8">{children}</main>`.
- `src/components/app-header.tsx`: `h-14 border-b border-line`. 좌측 "SlipScan"(링크 `/dashboard`), 우측 사용자 이메일(`text-xs text-fg-3`), `ThemeToggle`, `SignOutButton`. props: `{ email: string }`.
- `src/app/(app)/dashboard/page.tsx`: 임시로 제목 "대시보드"만 렌더한다. step 6에서 교체한다.

### 4. 테스트 (먼저 작성)

- `src/lib/schemas/auth.test.ts`: 잘못된 이메일, 7자 비밀번호가 실패한다.
- `src/components/auth/login-form.test.tsx`: (a) 잘못된 이메일 제출 → 메시지 표시, `signInWithPassword` 미호출. (b) 올바른 입력 → 해당 인자로 호출되고 `router.push('/dashboard')`. (c) `Invalid login credentials` 에러 → 한국어 메시지 표시. `next/navigation`의 `useRouter`는 `vi.mock`.
- `src/components/auth/google-button.test.tsx`: 클릭 → `signInWithOAuth`가 `provider: 'google'`과 `/auth/callback`으로 끝나는 `redirectTo`로 호출된다.

## Acceptance Criteria

```bash
npm run lint
npm run build
npm run test
```

추가로 Google provider 활성화와 공개 가입 차단 여부를 확인한다:

```bash
set -a; source .env.local; set +a
curl -s "$NEXT_PUBLIC_SUPABASE_URL/auth/v1/settings" -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  | grep -o '"google":[a-z]*\|"disable_signup":[a-z]*'
# 기대값: "google":true 와 "disable_signup":true  (disable_signup이 false면 아직 누구나 가입할 수 있는 상태)
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가? (`(auth)/login`, `(app)`, `auth/callback/route.ts`, `components/auth`. `signup` 경로 없음)
   - ADR 기술 스택을 벗어나지 않았는가? (서버 액션 없이 브라우저 클라이언트로 인증)
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
3. 코드와 테스트가 완성되고 AC가 통과했으면 먼저 커밋한다.
4. 설정 확인 결과에 따라 `phases/0-mvp/index.json`의 해당 step을 업데이트한다:
   - `"google":true` 이고 `"disable_signup":true` → `"status": "completed"`, `"summary": "산출물 한 줄 요약"` (컴포넌트·라우트 경로 포함)
   - `"google":false` 또는 출력 없음 → `"status": "blocked"`, `"blocked_reason": "Supabase 대시보드 → Authentication → Providers → Google을 켜고 Google Cloud OAuth 클라이언트 ID/Secret을 등록하세요. Google Cloud의 승인된 리디렉션 URI: https://<project-ref>.supabase.co/auth/v1/callback. 그리고 Authentication → URL Configuration → Redirect URLs에 http://localhost:3000/auth/callback 을 추가하세요."` 후 즉시 중단
   - `"disable_signup":false` → `"status": "blocked"`, `"blocked_reason": "Supabase 대시보드 → Authentication → Sign In / Providers에서 'Allow new users to sign up'을 끄세요. 이유: 공개 가입이 열려 있으면 남의 이메일로 선점한 계정에 Google 로그인이 연결되는 계정 탈취가 가능합니다. 계정은 Users → Add user(Auto Confirm 체크)로 발급합니다."` 후 즉시 중단. 두 문제가 동시에 있으면 사유를 둘 다 적는다
   - 코드가 3회 수정 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
5. 이 step이 재실행되어 파일이 이미 존재하면 다시 만들지 말고, AC와 Google 확인만 수행한 뒤 상태를 갱신하라.

## 금지사항

- 서버 액션(`'use server'`)으로 로그인을 구현하지 마라. 이유: ADR-002가 브라우저 클라이언트 방식으로 통일했다.
- 회원가입 페이지나 `signUp` 호출을 만들지 마라. 이유: 공개 가입 금지 (ADR-002). 계정은 운영자가 Supabase 대시보드에서 발급한다.
- 비밀번호 재설정, 이메일 확인 플로우를 만들지 마라. 이유: PRD MVP 제외.
- Google Client ID/Secret을 코드나 `.env`에 넣지 마라. 이유: Supabase 대시보드에만 등록한다.
- 대시보드 본문(목록·업로드)을 만들지 마라. 이유: step 6, 7의 범위다.
- `(app)/layout.tsx`에서 `getSession()`이나 `auth.getUser()`를 직접 쓰지 마라. 이유: `getCurrentUser()`가 요청당 1회로 캐시한다.
- 기존 테스트를 깨뜨리지 마라.
