# Step 0: project-setup

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/AGENTS.md` (기술 스택, CRITICAL 규칙, 명령어)
- `/docs/ARCHITECTURE.md` 2절(기술 스택), 3절(Next.js 16 행), 4절(디렉토리 구조), 5.7(응답 헤더), 10절(환경변수 8개), 11절, 13.1(확인 결과)
- `/docs/USER_FLOWS.md` 9.4의 `project-setup` 메모
- `/docs/UI_GUIDE.md` (테마 규칙)
- `/.gitignore` (이미 있는 줄 확인용)

전제: 이 step을 시작할 때 `git status --short -- docs AGENTS.md CLAUDE.md scripts`가 비어 있어야 한다(설계 문서와 하네스가 모두 커밋된 상태. `phases/0-foundation/index.json`은 실행기가 시작 시각을 적어서 바뀌어 있는 것이 정상이다). 비어 있지 않으면 아무것도 고치지 말고 `blocked`로 멈춘다(사유: "설계 문서에 미커밋 변경이 있다").

이 step이 첫 step이다. 저장소에는 아직 `package.json`이 없다. 루트에는 `AGENTS.md`, `CLAUDE.md`, `docs/`, `scripts/`(파이썬 하네스), `phases/`, `.claude/`, `.codex/`, `.agents/`, `.grok/`, `.omc/`, `.env.local`, `.vercel/`이 이미 있다. 이것들은 건드리지 않는다.

## 작업

Next.js 16 앱의 뼈대를 만든다. 빌드·lint·테스트 세 명령이 통과하는 가장 작은 상태가 목표다. 화면, 인증, DB는 이 step의 범위가 아니다.

### 1. 스캐폴드 (임시 폴더에서 만들어 옮긴다)

`create-next-app`은 허용 목록 밖 파일(`AGENTS.md`, `CLAUDE.md`, `scripts/`, `phases/` 등)이 있는 폴더에서는 실행을 거부한다. 그래서 임시 폴더에 만든 뒤 필요한 파일만 옮긴다.

```bash
TMP="$(mktemp -d)"
npx create-next-app@latest "$TMP/app" --ts --tailwind --eslint --app --no-src-dir --import-alias "@/*" --use-npm --yes --disable-git
```

- 저장소 루트로 옮기는 것: `app/`, `public/`, `package.json`, `package-lock.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `postcss.config.mjs`.
- 옮기지 않는 것: 스캐폴드가 만든 `AGENTS.md`, `CLAUDE.md`, `README.md`, `node_modules/`, `.git`, `next-env.d.ts`. 저장소의 `AGENTS.md`·`CLAUDE.md`를 덮어쓰지 않는다.
- `.gitignore`는 덮어쓰지 않는다. 스캐폴드의 `.gitignore`에 있고 저장소의 `.gitignore`에 없는 줄만 끝에 덧붙인다.
- 옮긴 뒤 임시 폴더를 지우고 저장소 루트에서 `npm install`을 실행한다.

확인된 사실(2026-09-18 조사): next 16.3.5, react 19.3.0, typescript 7.0.2, tailwindcss 4.3.3, eslint 10.10.0, eslint-config-next 16.3.5, vitest 5.0.1. Next 16에는 `next lint`가 없고 `next build`는 lint를 하지 않는다. lint는 flat config(`eslint.config.mjs`) + `eslint .`이다. 설치된 패키지의 타입 정의와 다르면 타입 정의가 우선이다. 다르면 summary에 적어라.

### 2. `package.json`

- `"name": "slipscan"`, `"private": true`, `"engines": { "node": "22.x" }`.
- scripts: `dev`(`next dev`), `build`(`next build`), `start`(`next start`), `lint`(`eslint .`), `test`(`vitest run`). 다른 스크립트는 만들지 않는다.
- 버전은 모두 `^메이저.x.y` 범위로 적는다. `latest`와 `*`를 쓰지 않는다. `package-lock.json`을 커밋한다.
- 피어 의존성이 충돌하면(예: TypeScript 7이나 ESLint 10이 `eslint-config-next`·`typescript-eslint`의 피어 범위 밖) 피어 범위를 만족하는 가장 새 메이저를 고르고, 어떤 패키지를 왜 낮췄는지 summary에 적는다.
- devDependencies에 `vitest`를 추가한다. 그 밖의 패키지는 이 step에서 설치하지 않는다.
- `.nvmrc` 파일을 만들고 내용은 `22` 한 줄이다.

### 3. 앱 파일 정리

- 스캐폴드의 `app/page.tsx`와 `public/`의 기본 SVG를 지운다. `public/`이 비면 폴더는 남기지 않아도 된다.
- `app/(marketing)/page.tsx`: 글자 "SlipScan"만 그리는 자리 표시 페이지. 이유: 랜딩은 step 5가 이 경로에 만든다. `app/page.tsx`와 `app/(marketing)/page.tsx`가 함께 있으면 둘 다 `/`가 되어 빌드가 깨진다.
- `app/layout.tsx`: `<html lang="ko">`, `metadata.title = 'SlipScan'`. 스캐폴드의 구글 글꼴(Geist) 불러오기는 지운다(글꼴은 step 3에서 넣는다).
- `app/globals.css`: Tailwind 불러오기 한 줄만 남긴다(`@import "tailwindcss";`). 스캐폴드의 색 변수와 `prefers-color-scheme: dark` 블록을 지운다. 색 토큰은 step 3에서 넣는다.
- `tsconfig.json`: `strict: true`를 유지한다. `exclude`에 아래 "제외 목록"을 넣는다.

### 4. `next.config.ts` — 보안 응답 헤더 (ARCH 5.7)

```ts
// next.config.ts
const nextConfig: NextConfig = {
  async headers() { /* source '/:path*'에 아래 네 헤더 */ },
}
export default nextConfig
```

값은 정확히 이 네 개다: `X-Frame-Options: DENY`, `Content-Security-Policy: frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`.

### 5. Vitest

- `vitest.config.ts`: `environment: 'node'`, `@` 별칭을 저장소 루트로, `include: ['**/*.test.{ts,tsx}']`, `exclude`에 `node_modules`, `.next`, `cypress`와 아래 "제외 목록".
- 첫 테스트 `next.config.test.ts`: `next.config.ts`의 `headers()`를 불러 네 헤더의 key와 value가 위 값과 같은지 확인한다. 테스트를 먼저 쓰고 통과시킨다.

### 6. 제외 목록 (ESLint ignores, tsconfig `exclude`, Vitest `exclude`에 공통)

`.next`, `node_modules`, `graft`, `phases`, `scripts/__pycache__`, `.agents`, `.claude`, `.codex`, `.grok`, `.omc`, `drizzle`.

이유: 이 폴더들에는 도구가 넣은 `.js`·`.ts` 예제가 있어서 lint와 타입 검사에 걸리면 빌드가 깨진다.

### 7. `.env.example`

ARCH 10절의 이름 8개를 이 순서로, 값 없이(`NAME=`) 적는다. 각 이름 위에 용도 설명 주석 한 줄을 둔다.

`ANTHROPIC_API_KEY`, `CLAUDE_MODEL`, `SLIPSCAN_TEST_MODE`, `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `DEMO_USER_ID`.

### 핵심 규칙

- 루트 `app/`를 쓴다. `src/`를 만들지 않는다(ARCH 4절).
- `.env.local`은 읽지도 고치지도 않는다. 값이 든 파일은 커밋하지 않는다(`.gitignore`의 `.env*` 규칙 유지).
- 비밀값에 `NEXT_PUBLIC_` 접두사를 붙이지 않는다. `.env.example`에서 `NEXT_PUBLIC_`이 붙는 이름은 Clerk 브라우저용 키 하나뿐이다.

## Acceptance Criteria

```bash
set -eu
node -v | grep -q '^v22\.'
npm run lint
npm run build
npm run test
test "$(cat .nvmrc)" = "22"
test "$(grep -cE '^[A-Z_]+=' .env.example)" -eq 8
for n in ANTHROPIC_API_KEY CLAUDE_MODEL SLIPSCAN_TEST_MODE DATABASE_URL BLOB_READ_WRITE_TOKEN NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY CLERK_SECRET_KEY DEMO_USER_ID; do
  grep -qE "^${n}=$" .env.example || { echo "missing or non-empty: $n"; exit 1; }
done
test ! -d src
test -f app/layout.tsx
test -f "app/(marketing)/page.tsx"
test ! -f app/page.tsx
git diff --quiet HEAD -- AGENTS.md CLAUDE.md docs scripts/execute.py
if grep -E '"(latest|\*)"' package.json; then echo "AC 실패: 있으면 안 되는 것이 발견됐다(위 출력)"; exit 1; fi
grep -q '"node": "22.x"' package.json
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 4절 디렉토리 구조를 따르는가(루트 `app/`, `src/` 없음)?
   - ADR 기술 스택을 벗어나지 않았는가(Next.js 16, TypeScript strict, Tailwind, Vitest)?
   - AGENTS.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/0-foundation/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요(Node 22가 없음 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

summary에 담을 것: 설치된 next·react·typescript·tailwindcss·eslint·vitest의 메이저 버전, npm 스크립트 이름, 피어 충돌로 낮춘 패키지가 있으면 그 이름과 이유.

## 금지사항

- `git checkout`·`git restore`·`git stash`·`git clean`·`git reset`으로 기존 파일의 변경을 되돌리지 마라. 이유: AC를 맞추려고 설계 기준 문서(`docs/`, `AGENTS.md`)나 계획 파일(`phases/`)을 버리는 일이 없어야 한다.
- Clerk, Drizzle·Neon, shadcn/ui, Vercel Blob, Anthropic SDK, zod, sharp, pdf-lib 패키지를 설치하지 마라. 이유: 패키지는 그것을 처음 쓰는 step에서 설치한다. 미리 넣으면 그 step의 범위와 검증이 흐려진다.
- `src/` 폴더와 `vercel.json`을 만들지 마라. 이유: ARCH 4절은 루트 `app/`이고, 함수 리전은 Vercel 프로젝트 설정에 이미 저장되어 있다(ARCH 11절).
- Vercel 프로젝트 설정·환경변수를 바꾸지 마라. 이유: 환경변수 교체는 2026-09-17에 이미 끝났고(ARCH 11절) 사용자가 직접 관리한다.
- `next lint`를 스크립트에 쓰지 마라. 이유: Next 16에서 없어졌다.
- 다크 모드 설정(`prefers-color-scheme`, `.dark`, `dark:`)을 남기지 마라. 이유: 라이트 전용이다(ADR-16).
- `npm install --force`와 `--legacy-peer-deps`를 쓰지 마라. 이유: 피어 의존성 충돌을 숨긴다.
- `AGENTS.md`, `CLAUDE.md`, `docs/`, `scripts/execute.py`, `.env.local`을 고치지 마라. 이유: 하네스와 설계 기준 문서다.
- 이 step에 적히지 않은 파일·기능(화면, API 라우트, `proxy.ts`, `lib/`)을 만들지 마라. 이유: 다음 step과 충돌한다.
- 기존 테스트를 깨뜨리지 마라
