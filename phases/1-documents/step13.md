# Step 13: document-detail-ui

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/ARCHITECTURE.md` 5.2(실패 판정), 5.6(문서 삭제), 8절(에러 응답 규약), 13.1(Next 16, shadcn)
- `/docs/PRD.md` F4(예외 규칙), F5(상세·삭제·문서 합계), 8.2, 10.1
- `/docs/USER_FLOWS.md` UC-08 A4·E2, UC-09(V1~V8), UC-10, UC-11, UC-12, UC-22, 4절(진입점), 4.1(폰에서의 표), 6.2(거래 배지), 7.1, 7.3, 7.6, 7.8
- `/docs/design.md` 5절(모서리·그림자), 6.1(버튼, danger), 6.2(배지와 위치), 6.3(금액), 6.5, 7.2(문서 상세 배치), 7.3, 8절
- `/docs/UI_GUIDE.md`
- `/lib/messages.ts`, `/lib/format.ts`, `/lib/categories.ts`
- `/components/ui/button.tsx`, `/components/ui/badge.tsx`, `/components/panel.tsx`, `/components/empty-state.tsx`, `/components/notice-line.tsx`
- `/app/dashboard/layout.tsx` (이 화면도 이 레이아웃과 `DashboardDataProvider` 안에 있다)
- `/lib/api-types.ts`, `/app/api/documents/[id]/route.ts` (이 묶음 step 9)
- `/components/dashboard/dashboard-data.tsx`, `/components/dashboard/document-list.tsx` (step 10. `?deleted=1` 안내와 표 모양)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 작업

문서 상세 화면을 만든다. 원본과 추출된 거래 표를 나란히 보여주고, 삭제할 수 있다. **읽기 전용**이다.

만들 파일:

- `components/documents/badges.ts`, `components/documents/badges.test.ts` (테스트를 먼저 쓴다)
- `components/documents/transaction-table.tsx`
- `components/ui/alert-dialog.tsx` (shadcn `alert-dialog`를 이 step에서 추가한다)
- `app/dashboard/documents/[id]/page.tsx`

### 이 step이 쓰는 것 (이미 있다. 다시 만들지 마라)

```ts
// lib/api-types.ts
type TransactionItem = { id: string; transactedAt: string; dateEstimated: boolean; merchantName: string | null; totalAmount: number | null; cardLast4: string | null; category: CategoryKey; isDuplicate: boolean; duplicateOfDocumentId: string | null }
type DocumentDetailResponse = { id: string; docType: DocType; status: DocumentStatus; failureReason: string | null; originalUrl: string; originalMime: string; modelUsed: string | null; uploadedAt: string; processedAt: string | null; totalAmount: number | null; transactions: TransactionItem[] }
// components/dashboard/dashboard-data.tsx
useDashboardData(): { data, month, setMonth, refresh, limitReached, loading }
```

API: `GET /api/documents/[id]` → 200 위 형태 / 401 / 404 `{ error }`. `DELETE /api/documents/[id]` → 200 `{ ok: true }` / 401 / 404.

### 1. `components/documents/badges.ts` (순수 함수. JSX 없음. 테스트 먼저)

```ts
export type TransactionBadge = 'amountMissing' | 'dateEstimated' | 'duplicate'
export function badgesFor(tx: { totalAmount: number | null; dateEstimated: boolean; isDuplicate: boolean }): TransactionBadge[]
```

테스트 케이스: 정상 거래 → `[]` / `totalAmount === null` → `amountMissing` / **0원은 미인식이 아니다**(`[]`) / 음수 금액 → `[]`("취소" 배지는 없다) / `dateEstimated` → `dateEstimated` / `isDuplicate` → `duplicate` / 셋이 겹치면 셋 다 나온다(순서 고정: `dateEstimated`, `duplicate`, `amountMissing`).

### 2. `app/dashboard/documents/[id]/page.tsx`

Next 16에서 `params`는 Promise다. 클라이언트 컴포넌트에서 `use(params)`로 풀거나, 얇은 서버 page가 `await params`로 `id`만 꺼내 클라이언트 컴포넌트에 넘긴다. **서버에서 DB를 읽지 않는다.** 데이터는 클라이언트가 `GET /api/documents/[id]`로 읽는다(10분 실패 판정이 그 API 안에 있다).

- 401 → `/sign-in?redirect_url=현재 경로`로 보낸다.
- 404 → 화면 안에 찾을 수 없음 블록: `MESSAGES.api.documentNotFound` + `MESSAGES.ui`의 "대시보드로 가기" 링크(UC-22).
- 이 화면은 폴링하지 않는다. 처리 중이면 안내 문구만 보여준다(UC-08 A4).

배치(design.md 7.2):
- 위: 돌아가기 링크(lucide `chevron-left` + `MESSAGES.ui`의 "대시보드", `/dashboard`로). 제목줄: 문서 종류(`MESSAGES.ui`의 문서 종류 표기, `unknown`이면 "—") + caption으로 올린 시각(`formatDateTime`)과 `MESSAGES.ui`의 "사용 모델" 값(없으면 "—"). 오른쪽 끝에 danger "삭제" 버튼(`data-testid="document-delete"`).
- 아래 두 열. **왼쪽 좁은 열 패널**: 상태 배지(`data-testid="document-status-badge"`) → 원본 자리(3:4, 모서리 7px, `bg-sunken`) → `MESSAGES.ui`의 "문서 합계" + 값(`text-amount-md`, `formatAmount`, null이면 "—") → 합계 기준 caption(`MESSAGES.ui`) → "원본 열기" 링크(`MESSAGES.label.button.openOriginal`, `target="_blank" rel="noopener noreferrer"`).
- 원본 자리: `originalMime`이 이미지면 `originalUrl`을 일반 `<img>`로 보정 없이 보여준다(`object-fit: contain`. lint의 `no-img-element` 경고는 그 줄에서만 끈다). PDF면 원본 자리에 file-text 아이콘과 "원본 열기" 링크만 둔다.
- **오른쪽 넓은 열 패널**: 거래 표(`TransactionTable`).
- 폰(< 768px): 왼쪽 열 → 거래 표 순으로 쌓는다.

상태별:
- `processing`: 원본은 보이고, 거래 표 자리에 `MESSAGES.empty.detailProcessing`. 삭제 버튼은 **비활성**이고 옆에 `MESSAGES.remove.processingDisabled`를 한 줄로 쓴다(숨기지 않는다, G-9).
- `completed` + 거래 0건: `MESSAGES.empty.detailNoTransactions`. 원본은 보인다.
- `failed`: "실패" 배지 + `failureReason` 문장 그대로(`NoticeLine` error, `data-testid="document-failure-reason"`). 삭제할 수 있다. 재시도 버튼은 없다.

삭제(UC-12):
- 버튼 → `AlertDialog`: 본문 `MESSAGES.remove.confirm`, 버튼 `MESSAGES.ui`의 "삭제"(danger)·"취소"(secondary).
- 확인 → `DELETE /api/documents/[id]` → 성공하면 `await refresh()`(대시보드 데이터와 헤더 사용량) → `router.push('/dashboard?deleted=1')`. 완료 문구는 대시보드의 문서 목록이 보여준다.
- 404(다른 탭에서 이미 삭제) → 찾을 수 없음 블록으로 바꾼다. 그 외 실패 → `MESSAGES.api.internal`을 `NoticeLine`으로.
- 진행 중에는 대화의 버튼을 비활성으로 둔다.

### 3. `components/documents/transaction-table.tsx`

```ts
export function TransactionTable(props: { transactions: TransactionItem[] }): React.JSX.Element
```

- 열: 거래일 · 가맹점 · 금액 · 카테고리 · 카드(`MESSAGES.ui`의 거래 표 열). 행마다 `data-testid="transaction-row"`.
- 거래일: `formatDateTime(transactedAt)`. `dateEstimated`면 **날짜 아래**에 `Badge` tone `warn` + `MESSAGES.label.badge.dateEstimated`.
- 가맹점: null이면 "—". `isDuplicate`면 **가맹점 아래**에 `Badge` tone `duplicate` + `MESSAGES.label.badge.duplicate`와, `duplicateOfDocumentId`가 있을 때 "원본 보기" 링크(`MESSAGES.label.button.viewOriginal`, `/dashboard/documents/{duplicateOfDocumentId}`).
- 금액: `formatAmount`, 오른쪽 정렬, `tabular-nums`, `text-amount-sm`. 음수는 destructive 색으로 "-8,900원". null이면 칸에 "—"를 쓰고 **그 아래**에 `Badge` tone `warn` + `MESSAGES.label.badge.amountMissing`.
- 카테고리: `CATEGORY_LABELS[category]`. 카드: `cardLast4` 또는 "—".
- 어떤 배지를 그릴지는 `badgesFor`로 정한다.
- 폰에서는 **카테고리와 카드 열을 숨긴다**(USER_FLOWS 4.1). 카드형으로 바꾸거나 행을 펼치지 않는다. 행·배지·칸 안에 아이콘을 넣지 않는다.

확인된 사용법(2026-09-18 조사). 설치된 패키지의 타입 정의와 다르면 타입 정의가 우선이다. 다르면 summary에 적어라.
- shadcn CLI v4: 부품 추가는 `npx shadcn@latest add alert-dialog`. 플래그가 다르면 `--help`로 확인한다. 추가된 부품의 모서리·높이·색은 design.md 5절·6.1에 맞게 고친다(그림자는 떠 있는 것에만 `0 8px 24px rgba(20,32,31,.10)`에 해당하는 토큰/값을 쓴다. `.dark`·`dark:`가 들어 있으면 지운다).
- Next 16: `params`는 Promise다.

## Acceptance Criteria

```bash
set -eu
npm run lint
npm run build
npm run test
test -f "app/dashboard/documents/[id]/page.tsx"
test -f components/documents/transaction-table.tsx
for id in document-status-badge document-delete; do
  grep -rq "$id" "app/dashboard/documents/[id]" components/documents || { echo "missing testid: $id"; exit 1; }
done
grep -q 'transaction-row' components/documents/transaction-table.tsx
grep -rq 'noopener' "app/dashboard/documents/[id]" components/documents
if grep -rn "dark:" components/documents components/ui/alert-dialog.tsx "app/dashboard/documents"; then echo "AC 실패: 있으면 안 되는 것이 발견됐다(위 출력)"; exit 1; fi
if grep -rnE "#[0-9a-fA-F]{3,8}\b" components/documents components/ui/alert-dialog.tsx "app/dashboard/documents"; then echo "AC 실패: 있으면 안 되는 것이 발견됐다(위 출력)"; exit 1; fi
if grep -rnE "getDb|lib/db/" "app/dashboard/documents" components/documents; then echo "AC 실패: 있으면 안 되는 것이 발견됐다(위 출력)"; exit 1; fi
if grep -n "remotePatterns" next.config.ts; then echo "AC 실패: 있으면 안 되는 것이 발견됐다(위 출력)"; exit 1; fi
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가? (`app/dashboard/documents/[id]/page.tsx`, `components/documents/`)
   - ADR 기술 스택을 벗어나지 않았는가?
   - AGENTS.md CRITICAL 규칙을 위반하지 않았는가? (화면은 API만 읽고, 쓰기는 `DELETE` 라우트를 거친다. 문구는 `lib/messages.ts`)
3. 결과에 따라 `phases/1-documents/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "..."`. summary에는 만든 파일, `badgesFor`의 위치와 반환 순서, 붙인 `data-testid` 목록, `params`를 푼 방식(`use(params)`인지 서버 래퍼인지), `MESSAGES.ui`에 추가한 키를 적는다.
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- 편집·재분석·재시도 버튼을 만들지 마라. 이유: PRD 10.1. 상세는 읽기 전용이고 오판은 삭제 후 재업로드다.
- "삭제하고 다시 올려 보세요" 같은 권유 문구를 넣지 마라. 이유: UC-09 V7. 같은 결과가 나올 확률이 높다.
- "취소" 배지, 신뢰도 점수, "확인 필요" 배지를 만들지 마라. 이유: PRD 10.1. 배지는 미인식·추정·중복 3종이고 음수 금액은 색으로만 알린다.
- 0원을 "금액 미인식"으로 표시하지 마라. 이유: 0원은 정상 거래다. 미인식 판정은 `=== null`로만 한다(ARCH 5.4).
- 원본 이미지에 필터·보정·확대 장치를 넣지 마라. PDF 인라인 뷰어를 만들지 마라. 이유: design.md 7.2, UC-09. PDF는 "원본 열기" 새 탭 링크다.
- `next/image`용 원격 호스트 설정(`remotePatterns`)을 추가하지 마라. 이유: 공개 Blob 주소는 `<img>`로 충분하고, 이미지 최적화 요청은 Vercel 무료 한도를 쓴다.
- 이 화면에 폴링을 추가하지 마라. 이유: 폴링 장치는 대시보드의 하나뿐이다. 처리 중이면 안내 문구를 보여준다.
- 서버 컴포넌트에서 DB를 직접 읽지 마라. 이유: 10분 실패 판정과 소유자 확인이 API 안에 있다.
- 처리 중 문서의 삭제 버튼을 숨기지 마라. 이유: design.md 6.1. 비활성으로 두고 이유를 옆에 쓴다.
- 중복 표시를 사용자가 풀거나 거는 토글을 만들지 마라. 이유: PRD 10.1.
- 폰에서 표를 카드형으로 바꾸거나 행 펼치기를 만들지 마라. 표 행·배지에 아이콘을 넣지 마라. 이유: design.md 7.3·8절.
- jsdom·testing-library를 설치하지 마라. `dark:` 접두어, 컴포넌트 안 색 값(#…), 이모지·유니코드 도형을 쓰지 마라.
- 기존 테스트를 깨뜨리지 마라
