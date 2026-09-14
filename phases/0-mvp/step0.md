# Step 0: project-setup

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `docs/ARCHITECTURE.md` — 디렉토리 구조 (`src/` 기준)
- `docs/ADR.md` — ADR-001 (Next 16, Tailwind v4), ADR-007 (Vitest), ADR-008 (테마 토큰)
- `docs/UI_GUIDE.md` — 색상 토큰 표, 컴포넌트 스타일
- `.gitignore` — 기존 항목 유지하고 병합할 것
- `.claude/settings.json` — Stop 훅이 `npm run lint && npm run build && npm run test`를 실행한다. 세 스크립트가 모두 존재하고 통과해야 한다.

## 작업

### 1. Next.js 스캐폴드 (임시 디렉토리에서 생성 후 루트로 복사)

루트에 `CLAUDE.md`, `docs/`, `scripts/`, `.claude/`가 있어 `create-next-app`을 루트에서 직접 실행하면 "directory contains files that could conflict"로 실패한다. 반드시 임시 디렉토리에서 생성한 뒤 필요한 파일만 복사하라.

```bash
TMP=$(mktemp -d)
cd "$TMP"
npx --yes create-next-app@latest slipscan --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --yes --skip-install --disable-git
```

- 어떤 옵션이 인식되지 않으면 그 옵션만 빼고 재시도하라. React Compiler 질문이 나오면 No.
- 복사할 것: `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`, `next-env.d.ts`(있으면), `src/`, `public/`.
- 복사하지 말 것: `README.md`, `AGENTS.md`, `.git/`, `node_modules/`.
- `.gitignore`는 덮어쓰지 말고, 스캐폴드의 `.gitignore`에만 있는 줄을 기존 파일 끝에 추가하라. `.env*`, `!.env.example`, `.vercel`은 이미 있으므로 중복 추가하지 마라.
- `package.json`의 `name`은 `slipscan`으로 바꾼다.
- 루트에서 `npm install`을 실행한다.

### 2. 의존성 설치

```bash
npm install next-themes lucide-react zod @supabase/ssr @supabase/supabase-js @anthropic-ai/sdk server-only
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

### 3. Vitest 설정

- `vitest.config.ts`: `@vitejs/plugin-react`, `environment: 'jsdom'`, `setupFiles: ['./src/test/setup.ts']`, `include: ['src/**/*.test.{ts,tsx}']`, alias `@` → `./src`. `globals`는 켜지 않는다. 테스트 파일에서 `import { describe, it, expect, vi } from 'vitest'`로 명시한다.
- `src/test/setup.ts`: `import '@testing-library/jest-dom/vitest'`. 그리고 `import { afterEach } from 'vitest'; import { cleanup } from '@testing-library/react'; afterEach(cleanup)`를 반드시 넣는다. 이유: `globals: false`면 RTL의 자동 cleanup이 등록되지 않아 테스트 간 DOM이 누적되고 "found multiple elements"로 실패한다. 마지막으로 jsdom에 없는 `window.matchMedia`를 최소 구현으로 정의한다 (next-themes가 사용).
- `package.json` scripts: `"test": "vitest run"`. `dev`, `build`, `lint`는 스캐폴드 값을 유지한다. Next 16에서 `lint`는 `eslint`이며 `next lint`가 아니다.
- `eslint.config.mjs`에 CLAUDE.md CRITICAL 규칙을 강제하는 `no-restricted-imports`를 추가한다. 적용 파일: `src/components/**`, `src/app/**/page.tsx`, `src/app/**/layout.tsx`, `src/app/**/route.ts`. 금지 모듈: `@anthropic-ai/sdk`, `@supabase/supabase-js`, `@supabase/ssr`, `@/services/analyzer/claude-analyzer`, `@/services/repository/supabase-analysis-repository`, `@/services/storage/supabase-receipt-storage`. 메시지는 "lib/supabase 또는 services 팩토리를 통해 접근하세요". 이유: headless 실행에서 이 경계를 지키는 유일한 장치가 lint다.
- `tsconfig.json`의 `include`에 `vitest.config.ts`가 포함되지 않으면 추가하라. `next build`가 테스트 파일을 타입체크하므로 테스트 파일도 strict를 통과해야 한다.

### 4. 테마 토큰과 ThemeProvider

- `src/app/globals.css`를 아래 구조로 교체한다. 변수 이름은 `:root`/`.dark`에서는 접두사 없이(`--page`), `@theme inline`에서는 `--color-` 접두사로 매핑한다. 같은 이름을 양쪽에 쓰면 순환 참조가 되므로 반드시 다르게 한다.

```css
@import "tailwindcss";

:root {
  --page: #fafafa;  --card: #ffffff;  --card-2: #f5f5f5;  --line: #e5e5e5;
  --fg: #171717;    --fg-2: #404040;  --fg-3: #737373;    --fg-4: #a3a3a3;
  --accent: #2563eb; --success: #16a34a; --error: #dc2626; --warning: #d97706;
}
.dark {
  --page: #0a0a0a;  --card: #141414;  --card-2: #1a1a1a;  --line: #262626;
  --fg: #fafafa;    --fg-2: #d4d4d4;  --fg-3: #a3a3a3;    --fg-4: #737373;
  --accent: #3b82f6; --success: #22c55e; --error: #ef4444; --warning: #f59e0b;
}
@theme inline {
  --color-page: var(--page);   --color-card: var(--card);   --color-card-2: var(--card-2);
  --color-line: var(--line);   --color-fg: var(--fg);       --color-fg-2: var(--fg-2);
  --color-fg-3: var(--fg-3);   --color-fg-4: var(--fg-4);   --color-accent: var(--accent);
  --color-success: var(--success); --color-error: var(--error); --color-warning: var(--warning);
}
```

  이렇게 하면 `bg-page`, `bg-card`, `border-line`, `text-fg-2`, `text-accent` 같은 유틸리티가 생긴다. `@custom-variant dark`는 정의하지 않는다. 이유: 테마는 `.dark` 셀렉터의 토큰 값으로만 바뀌고 `dark:` 변형은 금지다. 스캐폴드가 넣은 `--background`/`--foreground`와 `next/font` 관련 코드는 제거한다. 폰트는 시스템 폰트 스택(Tailwind 기본 `font-sans`)을 쓴다. 이유: `next/font/google`은 빌드 시 네트워크가 필요하다.

- `src/components/theme-provider.tsx` (`'use client'`): `next-themes`의 `ThemeProvider`를 `attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange`로 감싼다.
- `src/components/theme-toggle.tsx` (`'use client'`): `useTheme()`로 라이트/다크를 토글하는 버튼. `lucide-react`의 `Sun`/`Moon`, `strokeWidth={1.5}`. 마운트 전에는 아이콘을 렌더하지 않아 hydration 불일치를 피한다. `aria-label="테마 전환"`.
- `src/app/layout.tsx`: `<html lang="ko" suppressHydrationWarning>`, `<body className="bg-page text-fg antialiased">`, `ThemeProvider`로 children을 감싼다. `metadata.title = "SlipScan"`, `description = "영수증·카드명세서를 올리면 내역을 자동으로 정리합니다."`.
- `src/app/page.tsx`: 스캐폴드 보일러플레이트를 지우고, 임시로 `h1` "SlipScan"과 `ThemeToggle`만 렌더한다. 랜딩 본문은 step 10에서 만든다.
- `src/app/error.tsx` (`'use client'`): 한국어 고정 문구 "문제가 발생했습니다. 잠시 후 다시 시도하세요."와 `reset()`을 호출하는 "다시 시도" 버튼, 대시보드 링크. 이유: 없으면 Next 기본 영어 에러 화면이 뜬다. 에러 객체의 message는 표시하지 않는다.
- `next.config.ts`에 응답 헤더를 추가한다. 모든 경로(`source: '/(.*)'`)에 `X-Frame-Options: DENY`, `Content-Security-Policy: frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`. 이유: 세션 쿠키가 HttpOnly가 아니므로 클릭재킹·스니핑 표면을 줄인다. 전체 CSP(script-src 등)는 nonce가 필요해 MVP 제외.

### 5. UI 기본 요소 (`src/components/ui/`)

UI_GUIDE의 컴포넌트 절을 그대로 클래스로 옮긴다. 각각 네이티브 요소의 props를 확장하고 `className`을 병합한다.

```ts
// button.tsx
export type ButtonVariant = 'primary' | 'secondary' | 'text' | 'danger'
export function Button(props: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }): React.JSX.Element
// input.tsx
export function Input(props: React.InputHTMLAttributes<HTMLInputElement> & { error?: string }): React.JSX.Element  // error가 있으면 border-error + 아래 text-error text-xs
// card.tsx
export function Card(props: React.HTMLAttributes<HTMLDivElement>): React.JSX.Element
// badge.tsx
export function Badge(props: React.HTMLAttributes<HTMLSpanElement>): React.JSX.Element
```

### 6. `.env.example` 확인

`.env.example`과 `.env.local`은 이미 루트에 있다. 새로 만들거나 덮어쓰지 마라. `.env.example`의 변수 이름이 아래와 같은지만 확인하고, 다르면 아래로 맞춘다.

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
ANTHROPIC_API_KEY=
# 선택. 기본값 claude-opus-5
# ANTHROPIC_MODEL=
```

### 7. 테스트 (먼저 작성)

- `src/components/ui/input.test.tsx`: `error`가 있으면 메시지가 렌더된다.
- `src/components/theme-toggle.test.tsx`: `next-themes`를 `vi.mock`하여 클릭 시 `setTheme`가 반대 테마로 호출된다.

## Acceptance Criteria

```bash
npm run lint    # 에러 0
npm run build   # 컴파일 에러 없음
npm run test    # 위 테스트 전부 통과
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가? (`src/app`, `src/components/ui`, `src/test`)
   - ADR 기술 스택을 벗어나지 않았는가? (Tailwind v4, Vitest, next-themes)
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
   - `git status`에 `node_modules/`, `.next/`, `.env.local`이 나타나지 않는가?
3. 결과에 따라 `phases/0-mvp/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"` (설치된 Next 버전, 생성한 컴포넌트 목록, 토큰 클래스 이름을 포함)
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- 루트에서 `create-next-app`을 직접 실행하지 마라. 이유: 기존 파일과 충돌해 실패한다.
- `CLAUDE.md`, `docs/`, `scripts/`, `.claude/`, `supabase/`를 수정하거나 삭제하지 마라. `phases/`는 `phases/0-mvp/index.json`의 이 step 항목 외에는 수정하지 마라. 이유: 프로젝트 가드레일과 하네스 파일이다.
- 컴포넌트에서 `dark:` 변형을 쓰지 마라. 이유: 토큰 변수로 테마를 해결한다 (ADR-008).
- `next/font`를 쓰지 마라. 이유: 빌드 시 네트워크 의존.
- 로그인·대시보드·API 라우트를 만들지 마라. 이유: 이후 step의 범위다.
- `vitest`의 `globals: true`를 켜지 마라. 이유: `next build` 타입체크와 충돌하기 쉽다.
- 기존 테스트를 깨뜨리지 마라.
