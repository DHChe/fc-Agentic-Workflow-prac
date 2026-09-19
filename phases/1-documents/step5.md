# Step 5: pipeline-parts

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/ARCHITECTURE.md` 5.1("후처리" 중 이미지·PDF 규칙), 5.5(중복 감지), 6절(`transactions`), 9.1, 12절 ADR-10·ADR-24, 13.1(pdf-lib, sharp)
- `/docs/PRD.md` F3(큰 사진·눕은 사진), F7(중복 감지 기준), 7절(20페이지), 10.1·10.3
- `/docs/USER_FLOWS.md` UC-11(S1~S9), UC-06 E1·E2, 7.4
- phase `0-foundation`이 만든 파일: `/lib/db/schema.ts`, `/lib/db/client.ts`(`Tx`), `/lib/messages.ts`(`FailureCode`), `/next.config.ts`, `/next.config.test.ts`
- 이 phase의 이전 step: `/lib/stats/aggregate.ts`(`seoulDateKey`, `seoulDayStart`), `/scripts/generate-samples.ts`(sharp·pdf-lib 사용 예), `/scripts/seed-assets/`

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 작업

후처리 파이프라인의 부품 셋을 만든다: 분석용 이미지 사본, PDF 검사, 중복 감지. 이들을 엮는 `process-document.ts`는 step 7의 범위다. `sharp`와 `pdf-lib`는 step 4에서 설치했다.

**테스트를 먼저 쓴다(TDD).** 단위 테스트는 DB를 부르지 않는다. `findDuplicateOf`는 순수 함수로 테스트하고, `markDuplicates`(DB)는 단위 테스트 대상이 아니다.

### 만들 파일

`lib/pipeline/image.ts`, `lib/pipeline/pdf.ts`, `lib/pipeline/duplicates.ts`와 각각의 `*.test.ts`.

### 시그니처

```ts
// image.ts
export async function toAnalysisJpeg(buf: Buffer): Promise<Buffer>
// pdf.ts
export const MAX_PDF_PAGES = 20
export async function inspectPdf(buf: Buffer): Promise<{ ok: true; pageCount: number } | { ok: false; code: 'encryptedPdf' | 'unreadable' }>
// duplicates.ts
export type DupCandidate = { id: string; documentId: string; transactedAt: Date; dateEstimated: boolean; totalAmount: number | null; cardLast4: string | null; merchantName: string | null; isDuplicate: boolean; createdAt: Date }
export type DupSubject = Omit<DupCandidate, 'id' | 'isDuplicate' | 'createdAt'>
export function findDuplicateOf(subject: DupSubject, candidates: DupCandidate[]): string | null
export async function markDuplicates(tx: Tx, userId: string, documentId: string): Promise<void>
```

### 핵심 규칙 — 이미지

- 구현은 이 한 줄이다: `sharp(buf).rotate().resize(2576, 2576, { fit: 'inside', withoutEnlargement: true }).jpeg().toBuffer()`. EXIF 회전 반영 + 긴 변 2576px + JPEG 재인코딩.
- JPG와 PNG **모든** 이미지에 적용한다. 저장된 원본은 건드리지 않는다(분석용 사본만 만든다).
- sharp가 못 열면 던진다. 호출자(step 7)가 "파일을 읽을 수 없습니다."로 바꾼다.
- 품질을 낮춰 다시 시도하는 루프를 두지 않는다.
- `next.config.ts`에 `serverExternalPackages: ['sharp']`를 더한다(조건 없이). 이유: 이 step에서는 `app/` 아래 어떤 파일도 이 모듈을 부르지 않아 빌드가 sharp를 묶지 않는다. 뒤의 `upload-api` step에서 라우트가 이 모듈을 끌어올 때 처음 묶이므로 지금 넣어 둔다. 보안 헤더 테스트(`next.config.test.ts`)는 계속 통과해야 한다.

### 핵심 규칙 — PDF

- `PDFDocument.load(buf)`가 **`EncryptedPDFError`일 때만** `{ ok: false, code: 'encryptedPdf' }`다. 그 외 모든 열기 실패는 `{ ok: false, code: 'unreadable' }`다.
- 열리면 `{ ok: true, pageCount: doc.getPageCount() }`. 20 초과 판정은 호출자가 `MAX_PDF_PAGES`와 비교해서 한다.
- `ignoreEncryption` 옵션을 쓰지 않는다.

### 핵심 규칙 — 중복 감지

짝 규칙(글자 그대로 구현한다): 같은 서울 날짜 + 같은 금액이고, 둘 다 끝4가 있으면 끝4가 같을 때, 아니면 둘 다 가맹점명이 있고 글자가 완전히 같을 때. 둘 중 하나라도 `dateEstimated`거나 금액이 null이거나 같은 문서거나 후보가 이미 중복이면 짝이 아니다. 여러 후보면 `createdAt`이 가장 이른 것.

- 서울 날짜 비교는 `seoulDateKey`(`lib/stats/aggregate.ts`)로 한다. 날짜 계산을 여기서 다시 만들지 않는다.
- 끝4와 가맹점명이 둘 다 없는 거래는 비교하지 않는다(빈칸끼리 같다고 보지 않는다).
- 가맹점명은 글자 그대로 비교한다. 정규화·유사도 비교를 하지 않는다(표기 차이로 놓치는 것은 PRD 10.3에서 감수).
- `findDuplicateOf(subject, candidates)`는 순수 함수다. 짝이 되는 후보 가운데 `createdAt`이 가장 이른 것의 `id`를 돌려주고, 없으면 null.
- `markDuplicates(tx, userId, documentId)`는 후처리 트랜잭션 안에서 새 거래를 넣은 직후 불린다.
  - 이 문서의 새 거래를 `created_at, id` 순으로 읽는다.
  - 후보는 같은 `user_id`의 **다른 문서** 거래 가운데 `is_duplicate = false`, `total_amount IS NOT NULL`, `date_estimated = false`인 것이다. 금액과 서울 날짜 범위(`seoulDayStart` 기준 하루)로 좁혀서 읽는다.
  - 짝이 있으면 **새 거래에만** `is_duplicate = true`, `duplicate_of = 후보 id`를 쓴다. 기존 거래(원본 쪽)는 건드리지 않는다.
  - 같은 문서 안의 거래끼리는 비교하지 않는다(명세서 한 장에 같은 날·같은 금액이 두 번 있을 수 있다).
  - 모든 조회와 수정에 `user_id` 조건을 건다.

### 확인된 라이브러리 사실 (2026-09-18 조사)

설치된 패키지의 타입 정의와 다르면 타입 정의가 우선이다. 다르면 summary에 적어라.

- pdf-lib: `PDFDocument.load(bytes)`가 암호 PDF에 `EncryptedPDFError`(패키지가 export한다)를 던진다. `getPageCount()`. 2021년 이후 새 판이 없다.
- sharp: 인자 없는 `.rotate()`가 EXIF 방향을 반영한다.

### 테스트 케이스

- `duplicates.test.ts`(ARCH 9.1):
  - 끝4가 둘 다 있고 같음 → 짝 / 끝4가 둘 다 있고 다름 → 짝 아님(가맹점명이 같아도).
  - 한쪽에 끝4가 없음 → 가맹점명 일치면 짝, 불일치면 짝 아님.
  - 끝4와 가맹점명이 둘 다 null → 비교하지 않는다.
  - 날짜 추정 거래: subject가 추정이면 짝 아님, candidate가 추정이어도 짝 아님.
  - 같은 문서 → 짝 아님. 후보가 이미 중복 → 짝 아님. 금액 null(어느 쪽이든) → 짝 아님. 금액이 다름 → 짝 아님.
  - 서울 날짜 경계: `2026-09-02T15:30:00Z`와 `2026-09-03T14:00:00Z`는 UTC로는 다른 날이지만 서울로는 같은 날(9/3) → 짝. `2026-09-03T14:59:00Z`와 `2026-09-03T15:01:00Z`는 서울로 다른 날 → 짝 아님.
  - 후보 여러 개 → `createdAt`이 가장 이른 id.
  - 0원과 음수 금액도 같은 금액이면 짝이다.
- `pdf.test.ts`: 테스트 안에서 pdf-lib로 만든 3쪽 PDF → 3, 21쪽 PDF → 21, 쓰레기 바이트 → `unreadable`, 암호 PDF → `encryptedPdf`. pdf-lib는 암호 PDF를 만들지 못한다. `qpdf` 같은 도구가 있으면 아주 작은 암호 PDF를 `lib/pipeline/__fixtures__/encrypted.pdf`로 만들어 커밋하고 그것으로 테스트한다. 없으면 `PDFDocument.load`가 `new EncryptedPDFError()`를 던지게 stub해서 분류만 검증한다. 어느 쪽인지 summary에 적는다.
- `image.test.ts`: 테스트 안에서 sharp로 만든 4000×3000 PNG → 출력이 JPEG이고 긴 변이 2576 / 800×600 입력은 커지지 않는다 / EXIF orientation 6(`withMetadata({ orientation: 6 })`)인 입력은 가로·세로가 바뀌어 나온다 / 쓰레기 바이트 → 던진다.

## Acceptance Criteria

```bash
set -eu
npm run lint
npm run build
npm run test
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가?
   - ADR 기술 스택을 벗어나지 않았는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/1-documents/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 (API 키, 외부 인증, 수동 설정 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

summary에 담을 것: 세 파일이 내보내는 이름 전부, 암호 PDF를 어떻게 테스트했는지(fixture 파일 또는 stub), `next.config.ts`에 더한 설정.

## 금지사항

- HEIC 변환을 넣지 마라. 이유: ADR-10. 형식은 JPG·PNG·PDF뿐이다.
- JPEG 품질 재시도 루프와 매직 바이트 검사를 넣지 마라. 이유: PRD 10.1에서 제외했다.
- `ignoreEncryption`으로 암호 PDF를 억지로 열지 마라. 이유: 암호 PDF는 별도 사유로 실패시키는 것이 결정이다(G-7).
- 중복 판정에서 기존 거래(원본 쪽)를 수정하지 마라. 이유: ARCH 5.5. 나중에 들어온 쪽에만 표시한다.
- 되돌린 거래의 재중복 판정, 사용자별 잠금(advisory lock)을 넣지 마라. 이유: PRD 10.1·10.3에서 제외·감수했다.
- 가맹점명 정규화·유사도 비교를 넣지 마라. 이유: PRD 10.3. 표기 차이는 감수한다.
- 원본 파일을 고쳐서 Blob에 다시 저장하지 마라. 이유: 저장 원본은 올린 그대로 둔다(PRD F3).
- 서울 날짜 계산을 이 파일들에서 다시 구현하지 마라. 이유: `lib/stats/aggregate.ts` 한 곳 규칙.
- 기존 테스트를 깨뜨리지 마라
