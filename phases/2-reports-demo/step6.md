# Step 6: e2e-scenarios

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/PRD.md` 2절(성공 기준), 10.1(Cypress 시나리오 3개), 10.2(테스트 모드 격리)
- `/docs/ARCHITECTURE.md` 5.2(폴링), 5.3(보고서 완료 판정), 7.1(테스트 모드), 9.2(화면 테스트), 11절(배포와 운영)
- `/docs/USER_FLOWS.md` J1, UC-05 A2, UC-08, UC-10, UC-15, 9.2(시나리오 매핑), 9.3(fixture 목록)
- 직전 step에서 만든 파일:
  - `cypress.config.ts`, `cypress/tsconfig.json`, `cypress/support/e2e.ts`, `cypress/support/commands.ts` (`signInAsTestUser`, `interceptBlobUpload`)
  - `cypress/e2e/limit.cy.ts` (스펙 작성 방식의 본보기), `scripts/e2e-prepare.ts` (`resetUser`, `fillUsage`)
  - `package.json`의 `e2e`·`e2e:limit` 스크립트
- 이전 묶음·step에서 만든 파일:
  - `lib/claude/fixtures/index.ts` (`pickFixtureName`: `fail-api.jpg` → `fail-api`, 그 외 → `receipt-ok`), `lib/claude/fixtures/receipt-ok.ts`(2026-09-09 파리바게뜨 역삼점 17,300원), `lib/claude/fixtures/report-ok.ts`
  - `lib/claude/extract.ts` (테스트 모드에서 1.5초 뒤 fixture를 돌려준다. "처리 중"과 폴링 한 주기가 보이게 하려는 것이다)
  - `components/dashboard/upload-panel.tsx`, `document-list.tsx`, `stats-panel.tsx`, `report-generator.tsx`, `report-list.tsx`, `dashboard-data.tsx`, `components/dashboard/usage-counter.tsx`
  - `app/dashboard/reports/[id]/page.tsx`, `components/reports/report-markdown.tsx`
  - `public/samples/receipt-sample.jpg`

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 작업

남은 두 시나리오를 쓰고, PR마다 도는 GitHub Actions 워크플로를 만든다. 시나리오는 직전 step의 `limit.cy.ts`와 합쳐 **정확히 3개**다.

만들 파일: `cypress/e2e/happy-path.cy.ts`, `cypress/e2e/failure.cy.ts`, `cypress/fixtures/fail-api.jpg`(아주 작은 정상 JPEG. `sharp`로 몇 픽셀짜리를 한 번 만들어 커밋한다), `.github/workflows/e2e.yml`.

### 공통 규칙

- 각 스펙은 `cy.task('resetUser', email)`로 시작한다. 로그인은 `signInAsTestUser`, Blob 업로드는 `interceptBlobUpload`를 쓴다(직전 step의 명령. 새로 만들지 않는다).
- 요소는 `data-testid`로만 고른다. 문장이 들어 있는지 확인하는 검사는 된다.
- **완료를 고정 시간 `cy.wait(ms)`로 기다리지 않는다.** `data-status` 같은 상태가 바뀔 때까지 Cypress의 재시도(넉넉한 `timeout`, 20초 안팎)로 기다린다.
- 실제 Claude·Blob을 부르지 않는다. 토큰 발급 요청은 가로채지 않는다.

쓰는 `data-testid`: `usage-counter`, `upload-input`, `upload-submit`, `upload-sample`, `upload-error`, `document-list`, `document-row`(+ `data-status`), `document-failure-reason`, `document-status-badge`, `stats-month-label`, `stats-total`, `stats-count`, `report-create`, `report-stream`, `report-status`, `report-list`, `report-row`, `report-copy`.

### 시나리오 1 — `cypress/e2e/happy-path.cy.ts` (UC-03, 04, 05, 08, 09 V1, 13, 15, 16)

1. `resetUser` → 로그인 → `/dashboard`. 빈 상태다(`document-row`가 없다).
2. `upload-sample` 클릭 → `document-row`가 1개 생긴다.
3. 그 행이 `data-status="processing"`을 거쳐 `data-status="completed"`가 된다. `processing`을 놓쳤더라도 최종 `completed`는 반드시 확인한다(1.5초 fixture 지연 덕에 보통 폴링 한 주기가 돈다).
4. `stats-month-label`이 `2026년 9월`, `stats-total`에 `17,300원`, `stats-count`에 `1건`, `usage-counter`에 `1/50`. 대시보드는 사용자가 달을 옮기기 전에는 서버의 기본 달(거래가 있는 가장 최근 달)을 따르므로, 테스트를 돌리는 날짜와 무관하게 `2026년 9월`이어야 한다. 다른 달이 보이면 테스트를 고치지 말고 대시보드 데이터 훅의 달 처리를 고친다.
5. `report-create` 클릭 → `report-stream`에 글이 들어온다 → `report-status`에 `보고서가 저장되었습니다.` → `report-row`가 1개 → `usage-counter`에 `2/50`.
6. `report-row` 클릭 → 상세 화면에 5개 제목(`1. 기간 총 지출액과 거래 건수`, `2. 카테고리별 금액·비율`, `3. 큰 지출 상위 5건`, `4. 눈에 띄는 점`, `5. 한 문단 총평`)이 보이고 `report-copy`가 있다.

### 시나리오 2 — `cypress/e2e/failure.cy.ts` (UC-10)

1. `resetUser` → 로그인 → `/dashboard`.
2. `upload-input`에 `cypress/fixtures/fail-api.jpg`를 `selectFile`로 넣는다(파일 이름이 `fail-api.jpg`여야 fixture `fail-api`가 골라진다. 숨겨진 input이면 `{ force: true }`).
3. `upload-submit` 클릭 → 행이 `data-status="failed"`가 되고 `document-failure-reason`에 `분석 서비스가 일시적으로 응답하지 않습니다.`가 들어 있다.
4. `usage-counter`에 `1/50`(실패도 1회로 센다).

### GitHub Actions — `.github/workflows/e2e.yml`

- 트리거: `pull_request`.
- job `checks`: Node 22(`.nvmrc`), `npm ci`, `npm run lint`, `npm run test`, `npm run build`.
- job `e2e`: Node 22, `cypress-io/github-action`으로 `npm run e2e`를 돌린다(서버 기동은 `start-server-and-test`가 맡으므로 액션의 `start` 옵션과 겹치지 않게 한다). 실패 시 `cypress/screenshots`를 아티팩트로 올린다.
- 두 job 모두 저장소 Secrets에서 환경변수를 받는다: `DATABASE_URL`(테스트 DB), `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `BLOB_READ_WRITE_TOKEN`. `e2e`는 여기에 `CYPRESS_E2E_USER_EMAIL`(Secret `E2E_USER_EMAIL`), `CYPRESS_E2E_USER_PASSWORD`(Secret `E2E_USER_PASSWORD`)를 더한다. `SLIPSCAN_TEST_MODE=1`은 `e2e` 스크립트가 서버 명령에 붙이므로 워크플로에 따로 적지 않아도 된다.
- CI에는 `.env.local`과 `cypress.env.json`이 없다. `cypress.config.ts`가 파일이 없을 때도 환경변수만으로 동작하는지 확인하고, 아니면 고친다.
- **Secrets 등록은 사용자의 일이다.** 이 세션은 워크플로 파일만 쓴다. `gh secret set` 등을 실행하지 않는다.
- 액션 버전은 메이저 태그로 고정한다(`@v숫자`).

### 앱 버그가 드러나면

시나리오가 앱의 버그를 드러내면 앱 코드를 **최소한으로** 고치고, 고친 곳을 모두 summary에 적는다. 테스트를 통과시키려고 한도(50)·문구·검증 규칙·폴링 간격을 바꾸지 않는다. 고칠 범위가 크면(설계를 바꿔야 하면) 고치지 말고 error로 보고한다.

## Acceptance Criteria

```bash
set -eu
# 사용자 준비물 확인. 실패하면 blocked
test -f cypress.env.json

npm run lint
npm run build
npm run test

# 스펙은 정확히 3개
test "$(ls cypress/e2e/*.cy.ts | wc -l | tr -d ' ')" = "3"
if grep -rnE "cy\.wait\([0-9]" cypress/e2e; then echo "AC 실패: 있으면 안 되는 것이 발견됐다(위 출력)"; exit 1; fi
test -f cypress/fixtures/fail-api.jpg
test -f .github/workflows/e2e.yml
grep -q "pull_request" .github/workflows/e2e.yml
if grep -nE "(sk_test_|sk_live_|postgres(ql)?://|vercel_blob_rw_)" .github/workflows/e2e.yml; then echo "AC 실패: 있으면 안 되는 것이 발견됐다(위 출력)"; exit 1; fi

# 시나리오 3개 모두 통과
npm run e2e
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가?
   - ADR 기술 스택을 벗어나지 않았는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/2-reports-demo/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`. summary에는 스펙 파일 3개, 시나리오를 통과시키려고 고친 앱 코드(파일과 이유. 없으면 "없음"), 사용자가 GitHub 저장소 Secrets에 등록해야 하는 이름 6개(`DATABASE_URL`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `BLOB_READ_WRITE_TOKEN`, `E2E_USER_EMAIL`, `E2E_USER_PASSWORD`)를 담는다.
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단. 해당 조건: `cypress.env.json`이 없거나 테스트 계정 로그인이 실패한다("Clerk 개발 인스턴스에 이메일+비밀번호 테스트 사용자를 만들고 `cypress.env.json`에 `E2E_USER_EMAIL`, `E2E_USER_PASSWORD`를 적어 주세요").

## 금지사항

- 시나리오를 3개보다 늘리지 마라. 중복 배지·삭제·빈 대시보드·암호 PDF·모바일·시연 로그인 버튼을 자동화하지 마라. 이유: PRD 10.1에서 3개로 줄였고 나머지는 수동 리허설(USER_FLOWS 9.1) 항목이다.
- `cy.wait(고정 ms)`로 완료를 기다리지 마라. 이유: 느린 CI에서 불안정하다. `data-testid`의 상태로 기다린다.
- 실제 Claude·Blob을 부르지 마라. 토큰 발급 요청을 가로채지 마라. 이유: 비용·월 한도, 그리고 사용량이 실제로 기록되어야 한다.
- 테스트를 통과시키려고 한도·문구·검증 규칙·fixture 내용을 바꾸지 마라. 이유: 테스트가 검증하려는 대상이다.
- fixture를 3개(`receipt-ok`, `fail-api`, `report-ok`)보다 늘리지 마라. 이유: PRD 10.1.
- 한글 라벨로 요소를 고르지 마라. 이유: ARCH 9.2.
- 워크플로에 비밀값을 직접 적지 마라. GitHub Secrets를 이 세션에서 등록하지 마라. `SLIPSCAN_TEST_MODE`를 Vercel·프리뷰 배포 설정에 넣지 마라. 이유: PRD 10.2, 그리고 저장소 설정은 사용자가 관리한다.
- 워크플로에 배포 단계(`vercel deploy` 등)를 넣지 마라. 이유: 배포는 GitHub 연동 자동 배포뿐이다(ADR-15).
- `cypress.env.json`과 `.env.local`의 값을 출력·커밋하지 마라.
- 기존 테스트를 깨뜨리지 마라
