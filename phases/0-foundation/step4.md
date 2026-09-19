# Step 4: auth-and-routing

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/ARCHITECTURE.md` 3절(Next.js 16 행), 5.7(인증과 시연 로그인), 8절(API 목록, 에러 응답 규약), 10절(환경변수), 12절 ADR-1·ADR-9·ADR-17·ADR-19, 13.1(Clerk 확인 결과)
- `/docs/USER_FLOWS.md` 4절(진입점 표), UC-01, UC-03, UC-22, 7.3, 9.4의 `auth-and-routing` 메모
- `/docs/PRD.md` F2, F11, 10.1(가입 화면·초대 화면·구글 로그인 제외), 10.2
- `/.agents/skills/clerk-nextjs-patterns/SKILL.md`, `/.agents/skills/clerk-setup/SKILL.md` (참고 자료. 공식 문서와 다르면 공식 문서가 우선)
- 이전 step이 만든 파일: `/app/layout.tsx`, `/app/globals.css`, `/lib/messages.ts`, `/components/ui/button.tsx`, `/components/panel.tsx`, `/components/notice-line.tsx`, `/next.config.ts`

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 작업

Clerk를 붙이고, 길목 검사(`proxy.ts`), 로그인 화면, 시연 로그인 라우트, 오류 화면을 만든다. 랜딩과 대시보드 화면은 step 5에서 만든다.

설치: `@clerk/nextjs`, `@clerk/localizations`. `.env.local`에 `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`와 `CLERK_SECRET_KEY`가 이미 있다(개발 인스턴스). 환경변수를 새로 만들지 않는다.

확인된 사실(2026-09-18 조사. @clerk/nextjs 7.9.4, @clerk/localizations 4.17.1):
- `clerkMiddleware`는 Next 16의 `proxy.ts`에서 그대로 동작한다(@clerk/nextjs ≥ 6.37). `proxy.ts`는 Node 런타임에서 돈다.
- **`auth.protect()`는 페이지 요청은 로그인 화면으로 보내지만 API 요청에는 404를 준다.** `/api/**`의 401 JSON은 `const { userId } = await auth()`로 직접 검사해 돌려준다.
- `clerkClient`는 함수다: `const client = await clerkClient(); const t = await client.signInTokens.createSignInToken({ userId, expiresInSeconds }); t.token`.
- 로그인 주소와 이동 주소는 `<ClerkProvider>` 속성으로 준다. 한국어는 `@clerk/localizations`의 `koKR`이다.
- 로그아웃 버튼: `<SignOutButton signOutOptions={{ redirectUrl: '/' }}>`(step 5에서 쓴다).
- **미확인 1**: `<SignIn />`이 `?__clerk_ticket=`을 자동으로 소비하는지. **미확인 2**: sign-in token이 무료 플랜·초대 전용(Restricted. 대시보드 표기는 "Invite-only"일 수 있다) 모드에서 되는지. 수동 소비의 최신 API는 `signIn.ticket({ ticket })` 뒤 `signIn.finalize(...)`이고, 구버전은 `signIn.create({ strategy: 'ticket', ticket })` + `setActive`다.
- 설치된 패키지의 타입 정의와 다르면 타입 정의가 우선이다. 다르면 summary에 적어라.

### 1. `app/layout.tsx`

```tsx
<ClerkProvider localization={koKR} signInUrl="/sign-in" signInFallbackRedirectUrl="/dashboard" afterSignOutUrl="/">
  <html lang="ko">…</html>
</ClerkProvider>
```

step 3이 넣은 글꼴 연결과 `globals.css`는 그대로 둔다.

### 2. `proxy.ts` (저장소 루트)

```ts
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { MESSAGES } from '@/lib/messages'

const isProtectedPage = createRouteMatcher(['/dashboard(.*)'])
const isPublicApi = createRouteMatcher(['/api/demo-login'])
const isApiRoute = createRouteMatcher(['/api(.*)'])

export default clerkMiddleware(async (auth, req) => {
  const { userId } = await auth()
  if (isApiRoute(req) && !isPublicApi(req) && !userId) {
    return NextResponse.json({ error: MESSAGES.api.unauthorized }, { status: 401 })
  }
  if (isProtectedPage(req)) await auth.protect()   // /sign-in?redirect_url=… 로 보낸다
})

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
```

규칙(USER_FLOWS 4절): `/dashboard/**`는 미로그인이면 로그인 화면으로, `/api/**`는 리다이렉트 없이 401 `{ error }`(`/api/demo-login` 제외), `/`와 `/sign-in`은 공개다. `/`에서 로그인 사용자를 `/dashboard`로 보내는 일은 step 5가 랜딩 페이지 안에서 한다.

### 3. `app/(auth)/sign-in/[[...sign-in]]/page.tsx`

`<SignIn />`을 가운데에 둔다(본문 최대 폭 720px, design.md 5절). 로그인 뒤에는 `redirect_url`이 있으면 그곳, 없으면 `/dashboard`로 간다. 가입 링크가 보이지 않게 한다(가입은 Clerk이 제공하는 화면에서 초대 링크로만 한다).

시연 로그인 표 소비: 설치된 `@clerk/*` 패키지에서 `__clerk_ticket`을 검색하고 공식 문서를 읽어 `<SignIn />`이 `/sign-in?__clerk_ticket=…`을 자동으로 소비하는지 확인한다. 자동 소비가 **확인되지 않으면** 클라이언트 컴포넌트 `components/auth/ticket-sign-in.tsx`를 만들어 로그인 페이지에 둔다: 주소에 `__clerk_ticket`이 있으면 설치된 타입이 제공하는 API(`signIn.ticket` + `finalize`, 없으면 `signIn.create({ strategy: 'ticket' })` + `setActive`)로 소비하고 `/dashboard`로 보낸다. 실패하면 `/?demo=failed`로 보낸다. 표가 없으면 아무것도 하지 않는다.

### 4. `app/api/demo-login/route.ts`

```ts
export async function POST(request: Request): Promise<Response>
```

- `DEMO_USER_ID`가 비어 있으면 Clerk을 부르지 않고 `/?demo=failed`로 303.
- 있으면 `createSignInToken({ userId: DEMO_USER_ID, expiresInSeconds: 60 })` → `/sign-in?__clerk_ticket=<token>`으로 303.
- 어떤 오류든 서버 로그에 단계와 상태 코드만 남기고(`CLERK_SECRET_KEY`·토큰을 남기지 않는다) `/?demo=failed`로 303.
- 리다이렉트 주소는 `new URL(path, request.url)`로 만든 절대 주소이고 상태 코드는 303이다(폼 POST 뒤 GET으로 바뀌어야 한다). GET 핸들러는 만들지 않는다.

### 5. 오류 화면 (UC-22)

- `app/not-found.tsx`: `MESSAGES.ui`의 없는 주소 문장(`페이지를 찾을 수 없습니다.`) + `/dashboard`로 가는 링크(`대시보드로 가기`).
- `app/error.tsx`(클라이언트 컴포넌트): `MESSAGES.api.internal` + 같은 링크. 예외 메시지와 스택을 화면에 보여주지 않는다.

### 핵심 규칙

- `/api/**`의 미로그인 응답은 반드시 401 JSON이다. 이유: 대시보드 폴링이 401을 받아야 멈추고 로그인 화면으로 보낸다(ARCH 5.2, 5.7).
- 사용자 식별자는 Clerk `userId` 문자열이다. 라우트 핸들러와 서버 컴포넌트에서는 `const { userId } = await auth()`(`@clerk/nextjs/server`)로 얻는다.
- 비밀값(`CLERK_SECRET_KEY`)은 서버에서만 쓴다. `NEXT_PUBLIC_` 접두사를 붙이지 않는다.
- sign-in token 흐름을 끝까지 확인하지 못해도 `blocked`가 아니다(USER_FLOWS 9.4 메모). 확인한 것과 못 한 것을 summary에 적는다. `DEMO_USER_ID`가 비어 있는 것도 `blocked` 사유가 아니다(아래 AC는 빈 값에서도 통과한다).

## Acceptance Criteria

```bash
set -eu
npm run lint
npm run build
npm run test
npx next start -p 3917 > /tmp/slipscan-step4.log 2>&1 &
SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null || true; lsof -ti tcp:3917 | xargs kill 2>/dev/null || true' EXIT
for i in $(seq 1 60); do curl -s -o /dev/null http://localhost:3917/ && break; sleep 1; done
test "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3917/api/ping)" = "401"
curl -s http://localhost:3917/api/ping | grep -q '로그인이 필요합니다.'
test "$(curl -s -o /dev/null -w '%{http_code}' -X POST http://localhost:3917/api/demo-login)" = "303"
curl -s -o /dev/null -D - -X POST http://localhost:3917/api/demo-login | grep -iE '^location: .*(demo=failed|__clerk_ticket=)'
curl -s -o /dev/null -w '%{http_code}' -H 'Accept: text/html' http://localhost:3917/dashboard | grep -qE '^3[0-9][0-9]$'
test -f proxy.ts
test ! -f middleware.ts
```

## 검증 절차

1. 위 AC 커맨드를 실행한다(서버는 끝에 반드시 종료한다).
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 4절 디렉토리 구조를 따르는가(`proxy.ts`, `app/(auth)/sign-in/[[...sign-in]]/`, `app/api/demo-login/route.ts`)?
   - ADR 기술 스택을 벗어나지 않았는가(ADR-1, ADR-9, ADR-17, ADR-19)?
   - AGENTS.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/0-foundation/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단. 해당 조건: `.env.local`에 Clerk 키 두 개가 없거나 Clerk이 키를 거부한다.

summary에 담을 것: `<SignIn />`이 표를 자동 소비하는지 확인했는지 또는 `components/auth/ticket-sign-in.tsx`를 추가했는지, 확인하지 못한 항목, 만든 경로(`proxy.ts`, `/sign-in`, `POST /api/demo-login`, `app/not-found.tsx`, `app/error.tsx`).

## 금지사항

- `/api/**` 보호에 `auth.protect()`를 쓰지 마라. 이유: API 요청에 404를 준다. 폴링은 401을 받아야 멈춘다.
- `middleware.ts`를 만들지 마라. 이유: Next 16은 `proxy.ts`다(ADR-17).
- 앱 안에 가입 화면, 초대 화면, 관리자 역할, 구글 로그인을 만들지 마라. 이유: PRD 10.1 제외 항목이다.
- Clerk용 환경변수(`NEXT_PUBLIC_CLERK_SIGN_IN_URL` 등)를 추가하지 마라. 이유: 환경변수는 ARCH 10절의 8개뿐이다. 주소는 `<ClerkProvider>` 속성으로 준다.
- 시연 계정을 이메일+비밀번호로 로그인시키는 코드를 넣지 마라. 이유: 비밀번호는 아무도 모른다(ADR-19).
- `/api/demo-login`에 호출 횟수 제한을 넣지 마라. 이유: PRD 10.2(실제 도입 시 항목)다.
- Clerk 대시보드 설정을 바꾸지 마라. 이유: 사용자가 직접 관리한다.
- 토큰, 비밀 키, 요청 본문을 로그에 남기지 마라. 이유: ARCH 8절 로그 규칙.
- 랜딩, 대시보드 레이아웃, 헤더를 만들지 마라. 이유: step 5의 범위다.
- 기존 테스트를 깨뜨리지 마라
