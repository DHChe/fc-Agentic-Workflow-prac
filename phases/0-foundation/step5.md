# Step 5: landing-and-shell

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/PRD.md` F1(랜딩), F11(시연 계정), 5절(화면 흐름과 헤더)
- `/docs/USER_FLOWS.md` UC-01, UC-03 A2·A3·E2, UC-04 V1(빈 상태), 4절(진입점), 7.1, 7.3, 7.8, 7.9, J1의 1~3단계
- `/docs/design.md` 5절(간격), 6.4(헤더), 6.5(구획과 패널), 6.6(업로드 영역), 6.9(빈 상태), 7.1(대시보드 배치), 7.3(반응형), 8절(아이콘), 11절(디자인 시스템과 다르게 정한 것), 12.1(랜딩 문구)
- `/docs/UI_GUIDE.md`
- `/docs/ARCHITECTURE.md` 5.7(시연 계정에는 사용자 메뉴 대신 로그아웃 버튼)
- 이전 step이 만든 파일: `/app/layout.tsx`, `/app/(marketing)/page.tsx`(자리 표시), `/proxy.ts`, `/app/api/demo-login/route.ts`, `/app/(auth)/sign-in/[[...sign-in]]/page.tsx`, `/lib/messages.ts`, `/components/ui/button.tsx`, `/components/ui/badge.tsx`, `/components/panel.tsx`, `/components/section.tsx`, `/components/empty-state.tsx`, `/components/notice-line.tsx`, `/app/globals.css`

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 작업

랜딩 페이지와 대시보드의 틀(헤더, 레이아웃, 빈 상태 화면)을 만든다. 새 패키지는 설치하지 않는다. 화면의 모든 글자는 `MESSAGES`(`lib/messages.ts`)에서 가져온다.

확인된 사실(2026-09-18 조사): 현재 사용자는 `const { userId } = await auth()`(`@clerk/nextjs/server`)로 얻는다. Next 16에서 `searchParams`는 Promise다(`await searchParams`). 로그아웃은 `<SignOutButton signOutOptions={{ redirectUrl: '/' }}>`, 일반 사용자 메뉴는 `<UserButton />`이다. 설치된 패키지의 타입 정의와 다르면 타입 정의가 우선이다. 다르면 summary에 적어라.

### 1. `app/(marketing)/page.tsx` — 랜딩 (서버 컴포넌트, 자리 표시를 대체)

```tsx
export default async function LandingPage(props: { searchParams: Promise<{ demo?: string }> }): Promise<React.JSX.Element>
```

- 맨 처음에 `const { userId } = await auth(); if (userId) redirect('/dashboard')`. 서버에서 판단해 랜딩이 잠깐 보였다 넘어가지 않게 한다(UC-01 A1).
- 구성(PRD F1, design.md 12.1): 제목 한 줄(`text-display`, `MESSAGES.landing.title`), 특징 3개(Lucide `scan-line`, `chart-pie`, `file-text` 20px + `features[i].title`·`body`), 버튼 두 개, 고지 두 줄(`notice1`, `notice2`, caption 크기).
- "시연 계정으로 들어가기"(primary): `<form action="/api/demo-login" method="post">` 안의 submit 버튼, `data-testid="demo-login"`. 자바스크립트 없이도 동작한다.
- "로그인"(secondary): `/sign-in`으로 가는 링크(`Button asChild`).
- `(await searchParams).demo === 'failed'`이면 버튼 근처에 `NoticeLine`(error)으로 `MESSAGES.api.demoLoginFailed`를 보여준다.
- PC에서 스크롤 없이 한 화면에 들어온다. 폰(< 768px)에서는 한 단으로 쌓인다.
- 랜딩은 DB와 Claude를 부르지 않는다(J1: 랜딩은 DB 기상과 무관해야 한다).

### 2. `components/app-header.tsx`

```tsx
export function AppHeader(props: { usage?: React.ReactNode; userMenu: React.ReactNode }): React.JSX.Element
```

- 높이 56px, 흰 바탕(`--card`), 아래 1px `--border` 선. 안쪽 폭은 본문과 같은 최대 1180px.
- 왼쪽: 글자 로고. 딥틸(`--primary`) 점 하나 + "SlipScan"(무게 600, 자간 -0.02em). 누르면 `/dashboard`. 심볼을 새로 그리지 않는다(design.md 6.4).
- 오른쪽: `usage` 자리(이 step에서는 비워 둔다. "오늘 사용 n/50"은 phase `1-documents`가 채운다) + `userMenu`.
- 헤더에 탭 메뉴(대시보드·문서·보고서)를 만들지 않는다(design.md 11절).

### 3. `app/dashboard/layout.tsx` (서버 컴포넌트)

```tsx
export default async function DashboardLayout(props: { children: React.ReactNode }): Promise<React.JSX.Element>
```

- `const { userId } = await auth()`. `userId === process.env.DEMO_USER_ID`이면 `userMenu`는 `<SignOutButton signOutOptions={{ redirectUrl: '/' }}>`로 감싼 sm 크기 secondary 또는 ghost `Button`(`MESSAGES.label.button.signOut`, `data-testid="sign-out"`)이고, 아니면 `<UserButton />`이다. 분기는 서버에서 한다(ARCH 5.7).
- `DEMO_USER_ID`가 비어 있으면 누구도 시연 계정이 아니다(빈 문자열끼리 같다고 보지 않는다).
- 구조: `AppHeader` + `<main>`(최대 폭 1180px, 좌우 여백, 구획 사이 28px).

### 4. `app/dashboard/page.tsx` — 빈 상태 화면 (UC-04 V1)

`Section` 네 개를 이 순서로 쌓는다: 업로드 → 월 통계 → 문서 → 보고서(제목은 `MESSAGES.ui`의 구획 제목).

- 업로드: `--sunken` 바탕·모서리 7px 영역에 Lucide `upload`(24px) + `MESSAGES.ui`의 업로드 안내 문장, 아래에 제한 한 줄(caption). 이 step에서는 정적인 글자만 둔다. 파일 선택과 버튼은 phase `1-documents`가 만든다.
- 월 통계: `EmptyState`(`chart-pie`, `MESSAGES.empty.stats`).
- 문서: `EmptyState`(`inbox`, `MESSAGES.empty.documents`).
- 보고서: `EmptyState`(`file-text`, `MESSAGES.empty.reports`).

이 화면은 첫날 담당자가 보는 실제 빈 상태다(J2). phase `1-documents`와 `2-reports-demo`가 각 구획의 몸통을 살아 있는 부품으로 바꾼다.

### 핵심 규칙

- 컴포넌트에 문장을 직접 쓰지 않는다. 필요한 글자가 `MESSAGES`에 없으면 design.md 10절 말투로 `MESSAGES.ui`에 추가한다.
- 색은 토큰으로만, 아이콘은 `lucide-react`로만 쓴다. `dark:`를 쓰지 않는다.
- primary 버튼은 한 구획에 하나까지다(랜딩에서는 "시연 계정으로 들어가기").
- 시연 계정에는 `UserButton`이 보이지 않아야 한다(G-4. 프로필 화면에서 계정을 망가뜨릴 수 없게).

## Acceptance Criteria

```bash
set -eu
npm run lint
npm run build
npm run test
npx next start -p 3917 > /tmp/slipscan-step5.log 2>&1 &
SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null || true; lsof -ti tcp:3917 | xargs kill 2>/dev/null || true' EXIT
for i in $(seq 1 60); do curl -s -o /dev/null http://localhost:3917/ && break; sleep 1; done
curl -s http://localhost:3917/ > /tmp/slipscan-landing.html
grep -q '올린 파일은 분석을 위해 Anthropic API로 전송됩니다.' /tmp/slipscan-landing.html
grep -q '시연 계정은 공개 계정입니다. 올린 파일은 다른 방문자에게도 보입니다.' /tmp/slipscan-landing.html
grep -q '시연 계정으로 들어가기' /tmp/slipscan-landing.html
grep -q 'action="/api/demo-login"' /tmp/slipscan-landing.html
grep -q '영수증 사진을 올리면 지출 표와 월간 보고서가 됩니다' /tmp/slipscan-landing.html
curl -s 'http://localhost:3917/?demo=failed' | grep -q '시연 계정에 들어가지 못했습니다. 잠시 후 다시 시도해 주세요.'
if curl -s http://localhost:3917/ | grep -q '시연 계정에 들어가지 못했습니다.'; then echo "AC 실패: 있으면 안 되는 것이 발견됐다(위 출력)"; exit 1; fi
if grep -rn "dark:" app components; then echo "AC 실패: 있으면 안 되는 것이 발견됐다(위 출력)"; exit 1; fi
if grep -rnE "#[0-9a-fA-F]{3,8}\b" components; then echo "AC 실패: 있으면 안 되는 것이 발견됐다(위 출력)"; exit 1; fi
test -f components/app-header.tsx
test -f app/dashboard/layout.tsx
test -f app/dashboard/page.tsx
```

## 검증 절차

1. 위 AC 커맨드를 실행한다(서버는 끝에 반드시 종료한다).
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 4절 디렉토리 구조를 따르는가(`app/(marketing)/page.tsx`, `app/dashboard/`, `components/`)?
   - ADR 기술 스택을 벗어나지 않았는가(ADR-16 라이트 전용, ADR-19 시연 계정 메뉴)?
   - AGENTS.md CRITICAL 규칙과 UI_GUIDE 금지 목록을 위반하지 않았는가?
3. 결과에 따라 `phases/0-foundation/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

summary에 담을 것: 만든 파일, `AppHeader`의 props(`usage` 자리를 어떻게 넘기는지), 시연 계정 분기 위치(`app/dashboard/layout.tsx`), `MESSAGES.ui`에 추가한 키가 있으면 그 이름.

## 금지사항

- 특징을 4개로 늘리거나 스크롤형 랜딩을 만들지 마라. 이유: PRD F1은 한 화면·특징 3개다(design.md 11절).
- 헤더에 탭 메뉴를 만들지 마라. 이유: PRD 5절의 헤더는 사용량과 사용자 메뉴뿐이다(design.md 11절).
- "Powered by AI" 배지, 그라데이션 글자·배경, blur, 글로우, 보라·인디고 색을 쓰지 마라. 이유: UI_GUIDE 금지 목록이다.
- 랜딩에서 DB나 Claude를 부르지 마라. 이유: 첫 화면이 DB 기상을 기다리면 심사자가 떠난다(H1).
- 시연 계정에 `UserButton`을 보여주지 마라. 이유: 공개 계정의 프로필 화면이 열리면 계정이 망가질 수 있다(G-4).
- 시연 계정 아이디·비밀번호를 화면에 적지 마라. 이유: PRD 10.1.
- 업로드 버튼, 파일 선택, 통계 숫자, 목록 조회를 만들지 마라. 이유: phase `1-documents`의 범위다. 이 step은 빈 상태 화면까지다.
- 컴포넌트에 문장을 직접 쓰지 마라. 이유: 문구는 `lib/messages.ts` 한 곳 규칙이다.
- 기존 테스트를 깨뜨리지 마라
