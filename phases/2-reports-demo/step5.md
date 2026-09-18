# Step 5: e2e-setup

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/PRD.md` 9절(테스트), 10.1(Cypress 시나리오 3개·fixture 3개), 10.2(테스트 모드 격리)
- `/docs/ARCHITECTURE.md` 7.1(테스트 모드), 9.2(화면 테스트), 10절(환경변수), ADR-11, 13.1(`@clerk/testing`, Vercel Blob)
- `/docs/USER_FLOWS.md` UC-17(한도), 9.2(시나리오 매핑), 9.3(fixture)
- 이전 묶음·step에서 만든 파일:
  - `package.json`, `tsconfig.json`, `vitest.config.ts`, `eslint.config.mjs`, `.gitignore`
  - `lib/db/schema.ts`, `lib/db/client.ts`
  - `lib/upload/validate.ts` (`getBlobStoreHost`, `validateBlobUrl`. 가짜 URL이 통과해야 하는 검사)
  - `lib/claude/client.ts` (`isTestMode`), `lib/claude/fixtures/index.ts`
  - `lib/pipeline/process-document.ts` (테스트 모드에서 내려받기와 이미지·PDF 처리를 건너뛴다)
  - `app/api/blob/upload/route.ts`, `app/api/documents/route.ts`
  - `components/dashboard/upload-panel.tsx`, `components/dashboard/dashboard-data.tsx`, `components/dashboard/report-generator.tsx` (붙어 있는 `data-testid`)
  - `scripts/db-smoke.ts`, `scripts/seed-demo.ts` (스크립트가 환경변수·DB를 다루는 방식의 본보기)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 작업

Cypress 실행 환경을 만들고 가장 단순한 시나리오 3(한도 도달) 하나를 통과시킨다. 나머지 두 시나리오는 다음 step이다.

만들 파일: `cypress.config.ts`, `cypress/tsconfig.json`, `cypress/support/e2e.ts`, `cypress/support/commands.ts`, `cypress/e2e/limit.cy.ts`, `scripts/e2e-prepare.ts`. 고칠 파일: `package.json`(스크립트·의존성), `.gitignore`(`cypress.env.json`, `cypress/videos`, `cypress/screenshots`), 루트 `tsconfig.json`의 `exclude`에 `cypress`와 `cypress.config.ts`, `vitest.config.ts`의 제외 목록, 필요하면 `eslint.config.mjs`(lint가 계속 통과해야 한다).

설치(dev): `cypress`, `@clerk/testing`, `start-server-and-test`, `@clerk/backend`(`scripts/e2e-prepare.ts`의 `createClerkClient`가 여기 있다. `@clerk/nextjs`가 끌고 오는 전이 의존성에 기대지 않는다). **Cypress는 `@clerk/testing`의 `peerDependencies`가 허용하는 가장 새 메이저를 설치한다.** `npm view @clerk/testing peerDependencies`로 확인한다. 2026-09-18 기준 허용 범위는 13~15이고 Cypress 16은 범위 밖이다(ADR-11).

### 시그니처

```ts
// scripts/e2e-prepare.ts — Cypress의 Node 쪽(cy.task)에서 부른다. 앱 코드에서 부르지 않는다
export async function resetUser(email: string): Promise<null>    // 그 테스트 계정의 documents·transactions·reports·usage_log를 지운다
export async function fillUsage(email: string): Promise<null>    // 그 계정에 지금 시각의 usage_log 50행(kind: 'document')을 넣는다. id는 기본값이 없으므로 행마다 randomUUID()로 채운다

// cypress/support/commands.ts
Cypress.Commands.add('signInAsTestUser', () => void)             // @clerk/testing으로 로그인
Cypress.Commands.add('interceptBlobUpload', () => void)          // Blob 업로드 요청을 가로채 가짜 URL을 돌려준다
```

`package.json` 스크립트:

```json
"e2e": "start-server-and-test \"SLIPSCAN_TEST_MODE=1 next dev -p 3100\" http://localhost:3100 \"cypress run\"",
"e2e:limit": "start-server-and-test \"SLIPSCAN_TEST_MODE=1 next dev -p 3100\" http://localhost:3100 \"cypress run --spec cypress/e2e/limit.cy.ts\"",
"e2e:open": "start-server-and-test \"SLIPSCAN_TEST_MODE=1 next dev -p 3100\" http://localhost:3100 \"cypress open\""
```

### 핵심 규칙

- 대상 서버는 로컬 `next dev`를 `SLIPSCAN_TEST_MODE=1`로 띄운 것이다(포트 3100, `baseUrl: http://localhost:3100`). 테스트 모드에서 Claude는 fixture로 대체되고 Blob 내려받기와 이미지·PDF 처리는 건너뛴다. 화면 테스트는 ARCH 9.2대로 Clerk **개발 인스턴스**에 실제로 로그인한다. Claude와 Blob은 실제로 부르지 않는다.
- 자격 증명: `cypress.env.json`(git에 올리지 않는다)의 `E2E_USER_EMAIL`, `E2E_USER_PASSWORD`. 테스트 코드는 `Cypress.env('E2E_USER_EMAIL')`로 읽는다. 이렇게 하면 CI에서는 `CYPRESS_E2E_USER_EMAIL` 환경변수로도 들어온다. 값을 저장소의 다른 파일에 적지 않는다.
- `cypress.config.ts`: `.env.local`이 **있으면** `process.loadEnvFile('.env.local')`로 읽는다(CI에는 파일이 없고 환경변수로 들어온다). `@clerk/testing`이 요구하는 `CLERK_PUBLISHABLE_KEY`는 `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`에서 채우고 `CLERK_SECRET_KEY`는 그대로 쓴다. `setupNodeEvents`에서 `clerkSetup({ config })`을 부르고, `on('task', { resetUser, fillUsage })`를 등록하고, `config.env.BLOB_STORE_HOST = getBlobStoreHost()`를 넣는다(`lib/upload/validate.ts`를 상대 경로로 import한다). `cy.task`의 반환값은 `undefined`가 될 수 없으므로 `null`을 돌려준다.
- `scripts/e2e-prepare.ts`: 이메일로 Clerk Backend API에서 user id를 찾는다(`createClerkClient({ secretKey })`의 `users.getUserList({ emailAddress: [email] })`. import 경로는 설치된 패키지에서 확인한다). 못 찾으면 분명한 오류를 던진다. **모든 삭제·삽입은 그 `user_id` 조건으로만 한다.** DB는 `DATABASE_URL`(로컬·CI 모두 테스트 DB)이다. `process.env.VERCEL_ENV === 'production'`이면 실행을 거부한다.
- `interceptBlobUpload`: 브라우저의 `upload()`가 파일을 보내는 실제 주소와 기대하는 응답 JSON의 모양을 **설치된 `@vercel/blob` 클라이언트 소스에서 확인**해 `cy.intercept`로 가로챈다. 응답의 `url`은 `https://<BLOB_STORE_HOST>/<브라우저가 보낸 pathname 그대로>`여야 한다. 이유: 서버의 `validateBlobUrl`(호스트 완전 일치 + 경로 정규식)을 통과해야 한다. `pathname`·`contentType` 등 클라이언트가 읽는 다른 필드도 채운다.
- **토큰 발급 요청 `POST /api/blob/upload`는 가로채지 않는다.** 이유: 사용량(`usage_log`)이 실제로 기록되어야 한다.
- 셀렉터는 `data-testid`만 쓴다. 한글 라벨로 요소를 고르지 않는다(문장이 들어 있는지 확인하는 것은 된다). 입력은 완성된 문자열을 넣는다(IME 시뮬레이션 금지).
- `signInAsTestUser`: 공식 문서의 순서를 따른다. 보통 Clerk이 로드되는 페이지(`/`)를 먼저 방문한 뒤 `cy.clerkSignIn({ strategy: 'password', identifier, password })`를 부르고 `/dashboard`로 간다.
- `cypress/`는 자체 `cypress/tsconfig.json`을 쓴다. 루트 타입 검사(`next build`)와 Vitest가 Cypress 파일을 집지 않게 한다.

### 시나리오 3 — `cypress/e2e/limit.cy.ts` (UC-17)

`cy.task('resetUser', email)` → `cy.task('fillUsage', email)` → 로그인 → `/dashboard` → 확인:

- `usage-counter`에 `50/50`이 들어 있다.
- `upload-submit`, `upload-sample`, `report-create`가 비활성이다.
- `limit-notice`에 `오늘 한도(50회)를 모두 사용했습니다. 한국 시간 자정에 초기화됩니다.`가 들어 있다.

끝나면 `resetUser`로 50행을 치운다(`after` 훅).

### 확인된 SDK 사용법 (2026-09-18 조사)

- `@clerk/testing`(2.2.36, 피어: cypress ^13 ‖ ^14 ‖ ^15): `import { clerkSetup } from '@clerk/testing/cypress'`를 `cypress.config.ts`의 `setupNodeEvents`에서 `return clerkSetup({ config })`로 부른다. support 파일에서 `import { addClerkCommands } from '@clerk/testing/cypress'` 뒤 `addClerkCommands({ Cypress, cy })`. 로그인은 `cy.clerkSignIn({ strategy: 'password', identifier, password })`. 환경변수 이름은 `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`다.
- Vercel Blob: 공개 URL은 `https://<storeId>.public.blob.vercel-storage.com/<pathname>`이다. 브라우저 `upload(pathname, file, { access: 'public', handleUploadUrl, onUploadProgress })`는 먼저 `handleUploadUrl`에서 토큰을 받고, 그 다음 Blob API로 파일을 보낸다(가로챌 것은 두 번째 요청이다).

설치된 패키지의 타입 정의와 다르면 타입 정의가 우선이다. 다르면 summary에 적어라.

## Acceptance Criteria

```bash
set -eu
# 사용자 준비물 확인. 실패하면 blocked
test -f cypress.env.json
node -e "const e=require('./cypress.env.json'); if(!e.E2E_USER_EMAIL||!e.E2E_USER_PASSWORD){console.error('cypress.env.json에 E2E_USER_EMAIL, E2E_USER_PASSWORD가 필요하다');process.exit(1)}"

npm run lint
npm run build
npm run test

# Cypress 메이저가 @clerk/testing의 피어 범위 안인지
npm ls cypress @clerk/testing || true   # 참고 출력. 판정은 아래 줄이 한다
if npm ls 2>&1 | grep -i "invalid\|ELSPROBLEMS"; then echo "AC 실패: 있으면 안 되는 것이 발견됐다(위 출력)"; exit 1; fi

git check-ignore -q cypress.env.json

# 시나리오 3 통과
npm run e2e:limit
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가?
   - ADR 기술 스택을 벗어나지 않았는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/2-reports-demo/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`. summary에는 설치한 Cypress 메이저, 가로챈 Blob 요청의 주소 패턴과 응답 필드, task 이름(`resetUser`, `fillUsage`), 커스텀 명령 이름, 환경변수 이름(`E2E_USER_EMAIL`, `E2E_USER_PASSWORD`, `BLOB_STORE_HOST`), npm 스크립트 이름을 담는다.
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단. 해당 조건: `cypress.env.json`이 없거나 두 값이 비어 있다, 테스트 계정이 없어 로그인이 실패한다. 사유에 이렇게 적는다: "Clerk 개발(Development) 인스턴스의 Users에서 이메일+비밀번호 사용자를 하나 만들고, 저장소 루트의 `cypress.env.json`에 `E2E_USER_EMAIL`과 `E2E_USER_PASSWORD`를 적어 주세요".

## 금지사항

- Cypress 16을 `--force`나 `--legacy-peer-deps`로 설치하지 마라. 이유: `@clerk/testing`의 피어 범위 밖이라 로그인 헬퍼가 깨질 수 있다.
- Playwright나 AI형 테스트 도구를 설치하지 마라. 이유: ADR-11, PRD 10.1.
- 화면 테스트에서 실제 Claude·Blob을 부르지 마라. 이유: 비용과 Blob 월 2,000회 한도. 테스트 모드 fixture와 가로채기를 쓴다.
- 토큰 발급 요청(`POST /api/blob/upload`)을 가로채지 마라. 이유: 사용량이 실제로 기록되어야 시나리오가 의미 있다.
- 한글 라벨로 요소를 고르지 마라. IME 입력을 흉내 내지 마라. 이유: ARCH 9.2.
- 이 step에서 시나리오 1·2를 쓰지 마라. 시나리오를 3개보다 늘리지 마라. 이유: 다음 step의 범위이고, 개수는 PRD 10.1에서 3개로 고정했다.
- 테스트 계정 밖의 데이터를 지우지 마라. `DEMO_USER_ID`의 데이터를 건드리지 마라. 이유: 준비 스크립트는 받은 계정 범위로만 쓴다(AGENTS.md CRITICAL).
- 운영 Clerk 인스턴스나 시연용 DB를 쓰지 마라. `SLIPSCAN_TEST_MODE`를 Vercel 환경변수·프리뷰 배포에 넣지 마라. 이유: PRD 10.2.
- 테스트를 통과시키려고 앱의 한도·문구·검증 규칙을 바꾸지 마라. 이유: 테스트가 검증하려는 대상이다.
- `cypress.env.json`의 값이나 `.env.local`의 값을 출력·커밋하지 마라.
- 기존 테스트를 깨뜨리지 마라
