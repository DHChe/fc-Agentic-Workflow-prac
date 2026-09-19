# Step 3: seed-data

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/design.md` 12.2(시연 시드 구성. 이 step의 데이터 출처)
- `/docs/PRD.md` F11(시연 계정과 샘플 데이터), F3("샘플로 해보기")
- `/docs/ARCHITECTURE.md` 4절(`scripts/`), 11절(시연 데이터 규칙)
- `/docs/USER_FLOWS.md` J1(심사자의 5분), UC-11(중복 방향: 나중에 들어온 쪽이 중복)
- phase `0-foundation`이 만든 파일: `/lib/categories.ts`
- 이 phase의 이전 step: `/lib/stats/aggregate.ts`(`seoulDateKey`), `/lib/claude/fixtures/receipt-ok.ts`(샘플 영수증과 같은 결제)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 작업

시드 구성의 단일 출처 파일 하나와 그 테스트를 만든다. 이미지는 다음 step(`sample-images`)이, DB에 넣는 일은 phase `2-reports-demo`의 `demo-seed`가 이 파일을 읽어서 한다. 이 step은 패키지를 설치하지 않는다.

**테스트를 먼저 쓴다(TDD).** `scripts/seed-data.test.ts`를 먼저 쓰고 `scripts/seed-data.ts`를 채운다.

### 만들 파일

- `scripts/seed-data.ts` — 시드 구성의 단일 출처
- `scripts/seed-data.test.ts`

### 시그니처

```ts
// scripts/seed-data.ts
import type { CategoryKey } from '@/lib/categories'

export type SeedTransaction = {
  id: string                 // 고정 uuid
  transactedAt: string       // ISO, +09:00
  dateEstimated: boolean
  merchantName: string
  totalAmount: number
  cardLast4: string
  category: CategoryKey
}
export type SeedDocument = {
  id: string                 // 고정 uuid (Blob 경로의 uuid로도 쓴다)
  uploadedAt: string         // ISO, +09:00
  docType: 'receipt' | 'statement'
  assetFile: string          // 'scripts/seed-assets/01.jpg'
  transactions: SeedTransaction[]
}
export const SEED_DOCUMENTS: SeedDocument[]      // 10건, 아래 표 순서
export const SAMPLE_RECEIPT: { assetFile: 'public/samples/receipt-sample.jpg'; transaction: Omit<SeedTransaction, 'id'> }
```

`assetFile`은 다음 step이 만들 이미지의 경로다(`scripts/seed-assets/01.jpg` … `10.jpg`, 표의 # 순서). 이 step에서는 경로 문자열만 적고 파일은 만들지 않는다.

### 시드 구성 (design.md 12.2 그대로)

문서 10건 = 영수증 9 + 카드명세서 1. 날짜는 2026-08-01 ~ 2026-09-15 고정(서울). 카드 끝4는 1234와 5678 두 장.

| # | 올린 날 | 종류 | 거래 | 비고 |
|---|---|---|---|---|
| 1 | 08-03 | 영수증 | 08-03 김밥천국 역삼점 18,500원 · `food_welfare` · 1234 | |
| 2 | 08-07 | 영수증 | 08-07 카카오T 택시 12,400원 · `transport_travel` · 1234 | |
| 3 | 08-12 | 영수증 | 08-12 오피스디포 강남점 64,900원 · `office_equipment` · 1234 | |
| 4 | 08-19 | 영수증 | 08-19 한우마당 선릉점 286,000원 · `entertainment_client` · 5678 | 8월 최대 지출 |
| 5 | 08-27 | 영수증 | 08-27 교보문고 강남점 45,000원 · `ads_outsourcing_education` · 1234 | |
| 6 | 09-02 | 영수증 | 09-02 본도시락 역삼점 42,000원 · `food_welfare` · 1234 | |
| 7 | 09-05 | 카드명세서 | 카드 1234, 5줄: 08-22 AWS 132,000원 · `it_telecom` / 08-25 KT 통신요금 88,000원 · `it_telecom` / 08-28 역삼주차장 정기권 150,000원 · `rent_utilities_vehicle` / 08-30 쿠팡 취소 -8,900원 · `office_equipment` / 09-03 스타벅스 선릉로점 23,000원 · `food_welfare` | 8번보다 먼저 들어온다 |
| 8 | 09-06 | 영수증 | 09-03 스타벅스 선릉로점 23,000원 · `food_welfare` · 1234 | 7번의 마지막 줄과 같은 결제. 이 영수증에 "중복(집계 제외)"이 붙는다 |
| 9 | 09-10 | 영수증 | 09-10 KTX 서울-부산 59,800원 · `transport_travel` · 5678 | |
| 10 | 09-15 | 영수증 | 다이소 역삼점 9,500원 · `office_equipment` · 1234. 거래일이 흐려 못 읽음 | `transactedAt` = 올린 시각, `dateEstimated: true` |

- "샘플로 해보기": 2026-09-09 12:24 파리바게뜨 역삼점 17,300원 · `food_welfare` · 카드 9012. 시드와 겹치지 않는다. `lib/claude/fixtures/receipt-ok.ts`의 `RECEIPT_OK`와 같은 값이어야 한다.
- 거래 시각(시·분)은 그럴듯한 값으로 정하되 고정한다. 올린 시각은 거래 시각보다 뒤다.

### 핵심 규칙

- `scripts/seed-data.ts`가 이미지 생성기(다음 step)와 시드 스크립트(phase `2-reports-demo`)의 **단일 출처**다. 금액·날짜·가맹점명을 다른 파일에 다시 적지 않는다. 생성기는 이 파일을 import해서 그린다.
- 배열 순서가 곧 들어온 순서다. 7번(명세서)이 8번(영수증)보다 먼저다. 시드 스크립트가 이 순서로 `created_at`을 매기므로, 나중에 들어온 8번 영수증이 중복으로 표시된다(UC-11 S2).
- 같은 결제(같은 서울 날짜 + 금액 + 카드 끝4)가 문서 사이에 겹치는 쌍은 **정확히 1개**(7번의 스타벅스 줄과 8번)다(PRD F11).
- 모든 uuid는 소문자 8-4-4-4-12 고정값이고 서로 다르다. 상대 날짜(`Date.now()` 기준)를 쓰지 않는다. 2026-09-15 이후 날짜를 넣지 않는다.
- 실제 영수증이나 실존 인물의 정보를 쓰지 않는다. 사업자번호·전화번호는 눈에 띄게 가짜인 값(예: `000-00-00000`)으로 둔다.

### 테스트 케이스 (`scripts/seed-data.test.ts`)

- 문서 10건, 영수증 9 + 명세서 1. 명세서의 거래는 5건, 영수증은 각 1건.
- 모든 `uploadedAt`과 `transactedAt`의 서울 날짜가 2026-08-01 ~ 2026-09-15 안에 있다(`seoulDateKey`로 확인).
- 문서가 다른 거래끼리 "같은 서울 날짜 + 금액 + 카드 끝4"인 쌍이 정확히 1개이고, 그 쌍은 7번의 한 줄과 8번이다. 배열에서 7번이 8번보다 앞에 있다.
- `SAMPLE_RECEIPT`는 어떤 시드 거래와도 (날짜 + 금액 + 카드 끝4)가 겹치지 않는다. `RECEIPT_OK`의 거래와 값이 같다.
- 문서 uuid와 거래 uuid가 모두 서로 다르고 형식이 맞다. 카테고리가 모두 `CATEGORY_KEYS` 안에 있다.
- 10번만 `dateEstimated: true`이고 그 `transactedAt`은 `uploadedAt`과 같다. 음수 금액은 정확히 1건(-8,900)이다.
- 8월(서울) 거래의 합이 `18500+12400+64900+286000+45000+132000+88000+150000-8900`과 같다.

## Acceptance Criteria

```bash
set -eu
npm run lint
npm run build
npm run test
test -f scripts/seed-data.ts
test -f scripts/seed-data.test.ts
grep -q "SEED_DOCUMENTS" scripts/seed-data.ts
grep -q "SAMPLE_RECEIPT" scripts/seed-data.ts
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

summary에 담을 것: `scripts/seed-data.ts`가 내보내는 이름과 타입, 문서·거래 개수, 8월 합계.

## 금지사항

- 실제 영수증이나 실존 개인정보를 쓰지 마라. 이유: PRD F11. 시연 계정은 공개 계정이다.
- 상대 날짜나 2026-09-15 이후 날짜를 넣지 마라. 이유: 시드 날짜는 고정이고 미래 날짜가 없어야 통계 첫 화면이 "2026년 9월"로 열린다.
- 중복 쌍을 2개 이상 만들지 마라. 이유: PRD F11은 같은 결제 1건이다.
- 이미지 생성기를 만들거나 `sharp`·`pdf-lib`를 설치하지 마라. 이유: 다음 step(`sample-images`)의 범위다.
- DB나 Blob에 쓰지 마라. 이유: 이 step은 데이터 정의뿐이다. 시드 실행은 phase `2-reports-demo`의 범위다.
- design.md 12.2의 표와 다른 값을 넣지 마라. 값이 이상해 보이면 고치지 말고 error로 보고한다. 이유: 표가 확정된 구성이고, 뒤의 보고서·시드 step이 같은 숫자(8월 9건, 787,900원)를 기대한다.
- 기존 테스트를 깨뜨리지 마라
