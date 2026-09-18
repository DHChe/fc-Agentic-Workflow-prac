# Step 4: demo-seed

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/PRD.md` F11(시연 계정과 샘플 데이터), F9, 10.1·10.3
- `/docs/ARCHITECTURE.md` 6절(표 4개), 10절(`DEMO_USER_ID`), 11절(시연 데이터 규칙), ADR-18, 13.1(Blob)
- `/docs/USER_FLOWS.md` J1(전제: 재시드 직후), J5, UC-19, 9.1(리허설 2·3·13번)
- `/docs/design.md` 12.2(시드 구성. 이 step의 데이터 기준)
- `AGENTS.md`의 CRITICAL 규칙(시드는 앱 밖의 운영 도구이며 대상 user_id를 명시적으로 받아 그 범위로만 쓴다)
- 이전 묶음·step에서 만든 파일:
  - `scripts/seed-data.ts` (`SEED_DOCUMENTS`, `SAMPLE_RECEIPT`. 시드 구성의 단일 출처), `scripts/seed-data.test.ts`
  - `scripts/seed-assets/01.jpg` … `10.jpg`
  - `scripts/db-smoke.ts`, `scripts/try-extract.ts` (스크립트가 환경변수를 읽고 끝내는 방식의 본보기)
  - `lib/db/schema.ts`, `lib/db/client.ts`
  - `lib/stats/aggregate.ts` (`aggregateMonth`, `monthRange`)
  - `lib/upload/validate.ts` (`validateUploadPath`)
  - `lib/claude/report.ts` (`REPORT_SECTION_TITLES`), `lib/claude/fixtures/report-ok.ts` (5개 섹션 글의 본보기)
  - `lib/categories.ts`, `lib/format.ts`

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 작업

시연 계정에 문서 10건(거래 14건)과 2026년 8월 보고서 1건을 채우는 시드 스크립트를 만든다. 다시 실행하면 그 계정의 기존 데이터를 지우고 같은 상태로 되돌린다(멱등). 순수 부분은 **테스트를 먼저 쓴다**(TDD).

만들 파일: `scripts/seed-demo.ts`, `scripts/seed-demo.test.ts`. `package.json`에 `"seed:demo": "tsx scripts/seed-demo.ts"`를 더한다.

### 시그니처

```ts
// scripts/seed-demo.ts
export type SeedPlan = {
  documents: Array<{ id: string; userId: string; docType: 'receipt' | 'statement'; blobPathname: string; assetFile: string; uploadedAt: Date; processedAt: Date }>
  transactions: Array<{ id: string; documentId: string; userId: string; transactedAt: Date; dateEstimated: boolean; merchantName: string | null; totalAmount: number | null; cardLast4: string | null; category: CategoryKey; isDuplicate: boolean; duplicateOf: string | null; createdAt: Date }>
  report: { id: string; userId: string; month: '2026-08'; contentMd: string; createdAt: Date; completedAt: Date }
}
export function planSeed(seedDocuments: typeof SEED_DOCUMENTS, demoUserId: string): SeedPlan     // 순수 함수
export function buildSeedReport(augustRows: Array<{ transactedAt: Date; merchantName: string | null; totalAmount: number; category: CategoryKey }>): string   // 순수 함수. 마크다운
// 실행: npx tsx scripts/seed-demo.ts            → 시드 실행
//       npx tsx scripts/seed-demo.ts --verify   → 읽기만. 행 수를 검사하고 어긋나면 0이 아닌 코드
//       npx tsx scripts/seed-demo.ts --usage-count → 읽기만. 그 계정의 usage_log 행 수(숫자 하나)만 출력
```

import만으로는 아무것도 실행하지 않는다(테스트가 순수 함수만 가져다 쓴다). 실행 진입점은 파일이 직접 실행될 때만 돈다.

### 핵심 규칙

- 환경변수는 `process.loadEnvFile('.env.local')`로 읽는다. **`DEMO_USER_ID`가 비어 있으면 한국어 오류 한 줄을 출력하고 DB·Blob에 연결하기 전에 코드 1로 끝낸다.** 셸에서 `DEMO_USER_ID=`처럼 빈 값으로 명시하면 `.env.local`의 값으로 다시 채우지 않고 빈 값으로 본다(파일을 읽기 전에 `process.env`에 그 이름이 이미 있는지 확인한다).
- 쓰기 전에 대상 DB의 **호스트 이름만**(연결 문자열 전체가 아니다)과 user id의 끝 6자를 출력한다. 대상 DB는 `DATABASE_URL`이 가리키는 곳이다. 로컬에서는 테스트 DB다. 다른 DB 주소를 코드에 적지 않는다.
- 모든 삭제·삽입은 `user_id = DEMO_USER_ID` 조건으로만 한다.
- 순서:
  1. 그 계정의 `documents.original_url`을 DB에서 읽어 둔다.
  2. 한 트랜잭션에서 그 계정의 `documents`(거래는 CASCADE로 함께 지워진다)와 `reports`를 지운다.
  3. 1에서 읽은 URL을 Blob `del()`로 지운다. 실패하면 로그만 남긴다. **`list()`는 부르지 않는다.** DB에 있던 URL만 지운다.
  4. 이미지 10장을 `put(`${DEMO_USER_ID}/${doc.id}.jpg`, 파일, { access: 'public', addRandomSuffix: false, allowOverwrite: true, contentType: 'image/jpeg' })`로 올리고 돌려받은 `url`을 `original_url`로 쓴다(`original_mime`은 `image/jpeg`).
  5. 한 트랜잭션에서 문서·거래·보고서를 넣는다.
- 문서: `status: 'completed'`, `doc_type`은 시드 값, `uploaded_at`은 시드의 고정 시각, `processed_at`은 그 1분 뒤, `model_used: 'claude-opus-5'`.
- 거래: id와 `created_at`이 **고정값**이다(`created_at` = 문서의 `uploaded_at` + 줄 번호 초). 그래서 7번(명세서, 09-05)의 거래가 8번(영수증, 09-06)의 거래보다 먼저 들어온 것이 된다. 8번 영수증의 거래에 `is_duplicate = true`, `duplicate_of` = 7번 명세서의 09-03 스타벅스 선릉로점 23,000원 줄의 id를 넣는다. 중복 쌍은 이 1건뿐이다. 10번은 `date_estimated = true`이고 거래일이 올린 시각이다.
- 보고서: `month: '2026-08'`, `status: 'completed'`, 고정 id, `created_at` 2026-09-01 09:00(서울), `completed_at`은 그 20초 뒤, `model_used: 'claude-opus-5'`. 본문은 `buildSeedReport`가 만든다.
- `buildSeedReport`: `aggregateMonth`로 8월의 총액·건수·카테고리별 금액·비율을 구하고 상위 5건을 골라, `REPORT_SECTION_TITLES`의 5개 제목(`## 제목`)에 끼워 넣는다. 숫자를 글에 직접 적어 두지 않는다. 이유: 글과 데이터의 숫자가 어긋나지 않게 한다. 표와 링크를 쓰지 않는다(목록으로 쓴다). 말투는 fixture `report-ok`를 따른다.
- **`usage_log`는 읽기(`--usage-count`)만 하고 쓰지 않는다.** 시드는 하루 사용 횟수를 쓰지 않는다(PRD F11).
- 두 번 실행해도 행 수와 id가 같다.
- 이 스크립트는 Claude를 부르지 않는다. 데이터를 직접 넣는다.

design.md 12.2 기준 기대값: 문서 10건(영수증 9 + 카드명세서 1), 거래 14건(영수증 9건 + 명세서 5줄), 중복 1건, 날짜 추정 1건, 보고서 1건. 8월 집계 대상은 9건 787,900원(18,500 + 12,400 + 64,900 + 286,000 + 45,000 + 132,000 + 88,000 + 150,000 − 8,900)이다. `scripts/seed-data.ts`가 이 값과 다르면 멈추고 어느 쪽이 틀렸는지 error로 보고하라.

### 확인된 SDK 사용법 (2026-09-18 조사)

- `@vercel/blob`: `put(pathname, body, { access: 'public', addRandomSuffix, allowOverwrite, contentType })`. `addRandomSuffix`와 `allowOverwrite`의 기본값은 false이고, 같은 경로에 다시 올리면 `allowOverwrite: true`가 없을 때 오류다. `del(url | url[])`. `put`·`upload`·`copy`·`list`는 고급 작업(월 2,000회)이고 `del`은 아니다. 시드 1회 = `put` 10회다.
- Drizzle: `db.transaction(async (tx) => …)`은 던지면 롤백한다.

설치된 패키지의 타입 정의와 다르면 타입 정의가 우선이다. 다르면 summary에 적어라.

### 테스트 (먼저 쓴다. `scripts/seed-demo.test.ts`. DB·Blob 없음)

- `planSeed`: 문서 10건, 거래 14건 / 모든 행의 `userId`가 넘긴 값이다 / `isDuplicate`인 거래가 정확히 1건이고 그 `duplicateOf`가 7번 문서의 09-03 23,000원 줄이며 그 줄의 `createdAt`이 더 이르다 / `dateEstimated`가 정확히 1건 / 모든 `blobPathname`이 `validateUploadPath(pathname, demoUserId)`를 통과한다 / id가 모두 서로 다르고 두 번 불러도 같은 결과다.
- `buildSeedReport`: 5개 제목이 `## `로 순서대로 있다 / 8월 총액이 시드 데이터에서 계산한 값(중복·미인식 제외)과 같고 `formatAmount` 표기로 본문에 들어 있다 / `](`와 `|---`가 없다.

## Acceptance Criteria

```bash
set -eu
# 사용자 준비물 확인. 실패하면 blocked
node -e "process.loadEnvFile('.env.local'); for (const k of ['DEMO_USER_ID','DATABASE_URL','BLOB_READ_WRITE_TOKEN']) if (!process.env[k]) { console.error('missing ' + k); process.exit(1) }"

npm run lint
npm run build
npm run test

# DEMO_USER_ID가 비면 즉시 중단해야 한다
if DEMO_USER_ID= npx tsx scripts/seed-demo.ts; then echo "빈 DEMO_USER_ID에서 멈추지 않았다"; exit 1; fi

# 멱등 + 사용량 불변
BEFORE=$(npx tsx scripts/seed-demo.ts --usage-count)
npm run seed:demo
npm run seed:demo
AFTER=$(npx tsx scripts/seed-demo.ts --usage-count)
test "$BEFORE" = "$AFTER"

# 문서 10, 거래 14, 중복 1, 날짜 추정 1, 2026-08 완료 보고서 1
npx tsx scripts/seed-demo.ts --verify

# @vercel/blob에서 list를 가져오지 않았는지
if grep -nE "import[^;]*\blist\b[^;]*from ['\"]@vercel/blob['\"]" scripts/seed-demo.ts; then echo "AC 실패: 있으면 안 되는 것이 발견됐다(위 출력)"; exit 1; fi
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가?
   - ADR 기술 스택을 벗어나지 않았는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/2-reports-demo/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`. summary에는 스크립트와 npm 스크립트 이름, 넣은 행 수(문서·거래·중복·보고서), `--verify`·`--usage-count` 플래그, 다른 DB에 실행하는 법(환경변수 `DATABASE_URL`·`BLOB_READ_WRITE_TOKEN`·`DEMO_USER_ID`만 바꾼다)을 담는다.
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단. 해당 조건: `.env.local`의 `DEMO_USER_ID`가 비어 있다(사유에 이렇게 적는다: "Clerk 대시보드의 Users에서 시연 사용자를 만들고 그 userId를 `.env.local`의 `DEMO_USER_ID`에 넣어 주세요"), `DATABASE_URL`이나 `BLOB_READ_WRITE_TOKEN`이 없거나 거절된다.

## 금지사항

- Blob `list()`를 부르지 마라. 이유: 월 2,000회 고급 작업 한도를 넘기면 30일간 차단된다. 지울 대상은 DB에 있던 URL뿐이다.
- 다른 `user_id`의 데이터를 읽거나 지우지 마라. 이유: 시드는 시연 계정 범위로만 쓴다(AGENTS.md CRITICAL).
- 상대 날짜(오늘 기준 며칠 전)를 쓰지 마라. 2026-09-15 이후 날짜를 넣지 마라. 이유: 시드 날짜는 고정이다(PRD F11, ADR-18).
- 시드에서 Claude를 부르지 마라. 이유: 비용이 들고 결과가 매번 달라진다. 데이터는 `scripts/seed-data.ts`에서 직접 넣는다.
- `usage_log`에 쓰지 마라. 이유: 시드 실행이 그날 사용 횟수를 소진하면 안 된다.
- cron·자동 재시드 라우트를 만들지 마라. `app/**`에서 시드를 부르지 마라. 이유: 재시드는 관리자가 수동으로 실행한다(ADR-18, PRD 10.1).
- 운영 DB 주소나 비밀값을 코드·로그에 적지 마라. 연결 문자열 전체를 출력하지 마라.
- `scripts/seed-data.ts`의 데이터를 이 step에서 바꾸지 마라. 이유: 이미지(`scripts/seed-assets/`)와 어긋난다. 틀린 곳이 있으면 error로 보고한다.
- 이미지를 다시 만들거나 런타임에 만들지 마라. 이유: 이미지는 앞 묶음에서 만들어 커밋한 것을 그대로 올린다.
- 기존 테스트를 깨뜨리지 마라
