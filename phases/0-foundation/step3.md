# Step 3: design-system

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/design.md` 1~6절, 8~9절, 11절(색·글꼴·간격·부품·아이콘·움직임의 기준)
- `/docs/UI_GUIDE.md` (테마 규칙과 금지 목록)
- `/docs/ARCHITECTURE.md` 12절 ADR-16(라이트 전용), 13.1(shadcn CLI v4, 글꼴 확인 결과)
- `/docs/USER_FLOWS.md` 6.2(배지), UC-21
- 이전 step이 만든 파일: `/app/layout.tsx`, `/app/globals.css`, `/app/(marketing)/page.tsx`, `/package.json`, `/eslint.config.mjs`, `/lib/messages.ts`

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 작업

색 토큰, 글꼴, 기본 부품을 만든다. 이 step은 **부품만** 만든다. 화면(page)은 만들지 않는다.

설치: `lucide-react`. shadcn/ui는 CLI로 초기화한다.

확인된 사실(2026-09-18 조사): shadcn CLI v4(4.21.0)는 프리셋 방식으로 바뀌었다. 플래그는 `npx shadcn@latest init --help`로 먼저 확인한다. Tailwind v4에서는 `:root`에 값을 두고 `@theme inline { --color-sunken: var(--sunken); }`로 유틸리티(`bg-sunken`)를 등록한다. `.dark` 블록은 만들지 않는다. 글꼴은 `next/font/local`로 부르고 `src`는 호출 파일 기준 상대 경로다. woff2는 npm `pretendard` 패키지의 `dist/web/variable/woff2/PretendardVariable.woff2`에 있다(대소문자는 설치 후 실제 파일로 확인한다. Vercel은 대소문자를 구분한다). 설치된 패키지의 타입 정의와 다르면 타입 정의가 우선이다. 다르면 summary에 적어라.

### 1. shadcn 초기화

`components.json`을 만든다(별칭: `@/components`, `@/components/ui`, `@/lib/utils`, css는 `app/globals.css`). `lib/utils.ts`에 `cn`이 생긴다. CLI가 `globals.css`에 넣은 기본 색과 `.dark` 블록은 아래 토큰으로 바꾸고 지운다. shadcn `button`을 추가한 뒤 아래 계약대로 고친다.

### 2. `app/globals.css` — 색 토큰 (design.md 3절. 값은 이 파일에만 적는다)

`:root`에 정의하고 모두 `@theme inline`에 `--color-<이름>`으로 등록한다.

| 토큰 | 값 | 토큰 | 값 |
|---|---|---|---|
| `--background` | #f7f8f7 | `--foreground`, `--card-foreground`, `--popover-foreground` | #42504f |
| `--strong`, `--secondary-foreground` | #14201f | `--muted-foreground` | #7d8a89 |
| `--disabled` | #a9b3b2 | `--card`, `--popover`, `--secondary` | #ffffff |
| `--sunken` | #f7f8f7 | `--muted` | #eff2f1 |
| `--border`, `--input` | #e4e8e7 | `--border-soft` | #eff2f1 |
| `--border-strong` | #c7cfd3 | `--primary` | #0d5c5a |
| `--primary-foreground` | #ffffff | `--primary-press` | #094442 |
| `--accent` | #f2f7f7 | `--accent-foreground` | #0d5c5a |
| `--ring` | #1a7d78 | `--pos` / `--pos-weak` | #1f7a4d / #f4faf7 |
| `--destructive` / `--destructive-weak` | #a8342f / #fdf6f5 | `--warn` / `--warn-weak` | #8a6108 / #fdf8ec |
| `--pos-border` | #cfe3d8 | `--accent-border` | #d8e2e1 |
| `--destructive-border` | #eed4d2 | `--warn-border` | #efe3c4 |

카테고리 8색 `--chart-1`~`--chart-8`: #0d5c5a, #1a7d78, #37a09a, #6cbcb6, #a3d5d1, #4a5a63, #8b979e, #c7cfd3.

주의: shadcn의 `--accent`는 "옅은 강조 면"이다. 디자인 시스템의 딥틸 강조색은 앱에서 `--primary`다.

전역 규칙: `body`는 `bg-background text-foreground`, 본문 14px / 1.6. `word-break: keep-all`. 그림자는 쓰지 않는다. 키보드 포커스(`:focus-visible`)에만 `box-shadow: 0 0 0 2px var(--accent), 0 0 0 3px var(--ring)`를 주고 outline은 없앤다. 색 전환은 0.1초 linear만 쓴다. 모서리는 3px(배지), 5px(버튼·입력), 7px(패널 안 영역), 10px(패널)를 직접 적는다(shadcn의 `--radius` 계산식을 쓰지 않는다).

### 3. 글자 유틸리티 (`@utility`, design.md 4절)

| 유틸리티 | 크기 / 줄 높이 | 무게 | 자간 |
|---|---|---|---|
| `text-display` | 34px / 1.15 | 600 | -0.02em |
| `text-h1` | 22px / 1.35 | 600 | -0.01em |
| `text-h2` | 17px / 1.4 | 600 | -0.01em |
| `text-h3` | 15px / 1.45 | 500 | |
| `text-body` | 14px / 1.6 | 400 | |
| `text-cell` | 13px / 1.45 | 400 | |
| `text-caption` | 12px / 1.5 | 400 | |
| `text-micro` | 11px / 1.3 | 500 | |
| `text-amount-lg` | 34px / 1.15 | 600 | -0.02em |
| `text-amount-md` | 20px / 1.3 | 600 | |
| `text-amount-sm` | 14px / 1.45 | 500 | |

`text-amount-*`에는 `font-variant-numeric: tabular-nums`와 줄바꿈 금지를 함께 넣는다.

### 4. 글꼴

`npm install pretendard`로 받아 `PretendardVariable.woff2`와 라이선스 파일을 `app/fonts/PretendardVariable.woff2`, `app/fonts/LICENSE-Pretendard.txt`로 복사한 뒤 `npm uninstall pretendard`로 패키지를 지운다. `app/layout.tsx`에서 `next/font/local`로 부르고 CSS 변수로 연결한다. 대체 글꼴: `-apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif`.

### 5. 부품

```tsx
// components/ui/button.tsx
type ButtonProps = React.ComponentProps<'button'> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'md' | 'sm' | 'xs'; asChild?: boolean }
export function Button(props: ButtonProps): React.JSX.Element
// components/ui/badge.tsx
export function Badge(props: { tone: 'processing' | 'completed' | 'failed' | 'warn' | 'duplicate'; children: React.ReactNode } & React.ComponentProps<'span'>): React.JSX.Element
// components/panel.tsx
export function Panel(props: { children: React.ReactNode } & React.ComponentProps<'div'>): React.JSX.Element
// components/section.tsx
export function Section(props: { title: string; aside?: React.ReactNode; children: React.ReactNode } & Omit<React.ComponentProps<'section'>, 'title'>): React.JSX.Element
// components/empty-state.tsx
export function EmptyState(props: { icon: LucideIcon; text: string } & React.ComponentProps<'div'>): React.JSX.Element
// components/notice-line.tsx
export function NoticeLine(props: { tone: 'info' | 'warn' | 'error'; children: React.ReactNode } & React.ComponentProps<'div'>): React.JSX.Element
```

- **모든 부품은 남은 props(`...rest`)를 뿌리 요소에 그대로 넘긴다.** 이유: 뒤 step이 이 부품에 `data-testid`를 붙여 화면 테스트가 찾는다. TypeScript는 대시(-)가 든 속성을 검사하지 않아서, 빠뜨려도 빌드는 통과하고 속성만 조용히 사라진다.

- Button(design.md 6.1): primary = `--primary` 바탕·테두리 + 흰 글자, 눌림 `--primary-press`. secondary = 흰 바탕 + `--border` 테두리 + `--strong` 글자, 눌림 `--muted`. ghost = 투명 + `--primary` 글자, 눌림 `--accent`. danger = **흰 바탕 + `--border` 테두리 + `--destructive` 글자**, 눌림 `--destructive-weak`(shadcn의 빨간 바탕 destructive가 아니다). 비활성(모든 종류) = `--muted` 바탕 + `--border` 테두리 + `--disabled` 글자. 크기: md 높이 38px·좌우 20px·14px / sm 30px·12px·13px / xs 24px·8px·11px. 글자 무게 500, 모서리 5px, 아이콘과 글자 사이 8px, 줄바꿈 없음, 눌려도 크기가 변하지 않는다. hover는 눌림보다 약하게 같은 방향으로.
- Badge(6.2): 높이 21px, 좌우 6px, 모서리 3px, 1px 테두리, 11px·500, 줄바꿈 없음. 글자 / 바탕 / 테두리: processing = `--accent-foreground` / `--accent` / `--accent-border`, completed = `--pos` / `--pos-weak` / `--pos-border`, failed = `--destructive` / `--destructive-weak` / `--destructive-border`, warn(금액 미인식·날짜 추정) = `--warn` / `--warn-weak` / `--warn-border`, duplicate = `--muted-foreground` / `--sunken` / `--border`.
- Panel(6.5): 흰 바탕, 1px `--border`, 모서리 10px, 안쪽 여백 위아래 20px·좌우 22px.
- Section: 제목줄(h2 `text-h2` + 오른쪽 `aside`) 아래에 Panel. 구획 사이 28px.
- EmptyState(6.9): 아이콘 24px + 문장 한 줄, muted 글자.
- NoticeLine: 구획 안 한 줄 안내. 아이콘은 Lucide `info` / `triangle-alert` / `circle-alert`(16px), 색은 info = muted, warn = `--warn`, error = `--destructive`.

### 핵심 규칙

- 색은 토큰으로만 쓴다. 부품 코드에 색 값(#…)을 직접 쓰지 않는다. 색 값은 `app/globals.css`에만 있다.
- shadcn이 만든 코드의 `dark:` 클래스, 그림자, `--radius` 계산식은 지운다.
- 아이콘은 `lucide-react`만 쓴다. 이모지와 유니코드 도형(▶, ✓)을 쓰지 않는다.

## Acceptance Criteria

```bash
set -eu
npm run lint
npm run build
npm run test
if grep -rn "dark:" app components; then echo "AC 실패: 있으면 안 되는 것이 발견됐다(위 출력)"; exit 1; fi
if grep -rnE "#[0-9a-fA-F]{3,8}\b" components; then echo "AC 실패: 있으면 안 되는 것이 발견됐다(위 출력)"; exit 1; fi
if grep -n "\.dark" app/globals.css; then echo "AC 실패: 있으면 안 되는 것이 발견됐다(위 출력)"; exit 1; fi
grep -qiE -- "--primary:[[:space:]]*#0d5c5a" app/globals.css
grep -q -- "--chart-8" app/globals.css
test -f app/fonts/PretendardVariable.woff2
test -f app/fonts/LICENSE-Pretendard.txt
if grep -q '"pretendard"' package.json; then echo "AC 실패: 있으면 안 되는 것이 발견됐다(위 출력)"; exit 1; fi
if grep -rnE "backdrop-filter|blur-3xl|bg-gradient|gradient-to" app components; then echo "AC 실패: 있으면 안 되는 것이 발견됐다(위 출력)"; exit 1; fi
for f in components/ui/button.tsx components/ui/badge.tsx components/panel.tsx components/section.tsx components/empty-state.tsx components/notice-line.tsx; do test -f "$f" || exit 1; done
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 4절 디렉토리 구조를 따르는가(`components/`, `components/ui/`)?
   - ADR 기술 스택을 벗어나지 않았는가(Tailwind + shadcn/ui, 라이트 전용 ADR-16)?
   - AGENTS.md CRITICAL 규칙과 UI_GUIDE 금지 목록을 위반하지 않았는가?
3. 결과에 따라 `phases/0-foundation/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

summary에 담을 것: 부품 파일과 props(variant·size·tone 값), 추가한 확장 토큰 이름, 글자 유틸리티 이름, 글꼴 CSS 변수 이름.

## 금지사항

- `backdrop-filter: blur()`, 그라데이션 글자, 배경 gradient orb, box-shadow 글로우, 보라·인디고 색을 쓰지 마라. 이유: UI_GUIDE의 AI 슬롭 금지 목록이다.
- 모든 부품에 같은 큰 둥근 모서리(`rounded-2xl` 등)를 쓰지 마라. 이유: design.md 5절이 3·5·7·10px를 부품별로 정했다.
- 다크 테마(`.dark`, `dark:`, `prefers-color-scheme`)를 만들지 마라. 이유: 라이트 전용이다(ADR-16).
- 글꼴을 CDN에서 불러오지 마라. 고정폭(모노) 글꼴을 쓰지 마라. 이유: design.md 4절. 폰트 파일은 저장소에 둔다.
- 화면(page), 헤더, 대시보드 부품을 만들지 마라. 이유: 이 step은 기본 부품만이다. 화면은 step 5와 뒤 phase에서 만든다.
- jsdom, testing-library를 설치하지 마라. 이유: 이 MVP의 단위 테스트는 순수 함수만 다룬다. 부품은 빌드와 화면 확인으로 검증한다.
- 아이콘 SVG를 손으로 그리지 마라. 이유: design.md 8절(예외는 뒤 step의 도넛 원호 하나).
- shadcn 부품을 필요 이상으로 추가하지 마라(이 step은 button만). 이유: 쓰지 않는 부품이 lint·금지어 검사에 걸린다.
- 기존 테스트를 깨뜨리지 마라
