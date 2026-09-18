# Step 12: stats-ui

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/ARCHITECTURE.md` 5.4(기간 통계, 응답 형태, 비율 규칙)
- `/docs/PRD.md` F7, F8(버튼 위치만), 10.1
- `/docs/USER_FLOWS.md` UC-13, UC-04 V2, 4.1(폰에서의 표), 7.1, 7.8
- `/docs/design.md` 3.2(카테고리 8색), 4절(글꼴·`amount-lg`), 6.3(금액·숫자), 6.5, 6.7(월 통계), 7.1, 7.3(반응형), 8절(아이콘), 9절(움직임)
- `/docs/UI_GUIDE.md`
- `/lib/messages.ts`, `/lib/format.ts`, `/lib/categories.ts`
- `/components/ui/button.tsx`, `/components/section.tsx`, `/components/panel.tsx`, `/components/empty-state.tsx`
- `/app/globals.css` (`--chart-1`~`--chart-8`, `--border` 토큰)
- `/lib/stats/aggregate.ts` (이 묶음 step 0. `shiftMonth`)
- `/lib/api-types.ts` (step 9)
- `/components/dashboard/dashboard-data.tsx`, `/app/dashboard/page.tsx` (step 10), `/components/dashboard/upload-panel.tsx` (step 11. 구획을 끼우는 방식 참고)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 작업

대시보드의 월 통계 구획을 만든다. 숫자는 `useDashboardData()`의 `data.stats`를 그대로 보여준다. 화면에서 다시 집계하지 않는다.

만들 파일·고칠 파일:

- `components/dashboard/donut-arcs.ts`, `components/dashboard/donut-arcs.test.ts` (테스트를 먼저 쓴다)
- `components/dashboard/category-donut.tsx`
- `components/dashboard/stats-panel.tsx` (`'use client'`)
- `app/dashboard/page.tsx` (수정: 월 통계 구획의 본문을 `StatsPanel`로 바꾼다)

### 이 step이 쓰는 것 (이미 있다. 다시 만들지 마라)

```ts
// lib/api-types.ts / lib/stats/aggregate.ts
type MonthStats = { total: number; count: number; categories: Array<{ key: CategoryKey; amount: number; ratio: number | null }> }
//   categories는 8개 모두, 금액 내림차순(같으면 CATEGORY_KEYS 순). ratio는 0~1 분수(음수 가능), 총액 ≤ 0이면 전부 null
export function shiftMonth(month: string, delta: number): string      // '2026-01', -1 → '2025-12'
// lib/format.ts
export function formatAmount(amount: number): string                  // "1,126,600원", "-8,900원"
export function formatRatio(ratio: number | null): string             // 0.366 → "36.6%", null → "—"
export function formatMonthLabel(month: string): string               // "2026-09" → "2026년 9월"
// components/dashboard/dashboard-data.tsx
useDashboardData(): { data, month, setMonth, refresh, limitReached, loading }
```

### 1. `components/dashboard/donut-arcs.ts` (순수 함수. JSX 없음. 테스트 먼저)

```ts
export type DonutArc = { key: CategoryKey; colorIndex: number; startAngle: number; endAngle: number }   // 각도는 도(°). 0 = 12시 방향, 시계 방향
export function donutArcs(
  categories: Array<{ key: CategoryKey; amount: number }>,
  opts?: { gapDeg?: number },
): DonutArc[]
```

- 금액이 0보다 큰 카테고리만 조각이 된다. 비율은 "양수 금액의 합" 기준이다(조각을 그리기 위한 값일 뿐이고, 표의 비율은 API의 `ratio`를 쓴다).
- `colorIndex`는 **입력 배열에서의 순서**(0~7)다. 표의 색 점과 조각의 색이 같아야 한다.
- 조각이 2개 이상이면 조각 사이에 틈(`gapDeg`)을 둔다. 조각이 1개면 틈 없이 0~360이다. 양수 금액이 없으면 빈 배열이다.

테스트 케이스: 두 카테고리 3:1 → 호의 비가 3:1이고 호의 합 = 360 − 틈×2 / 0원·음수 카테고리는 조각이 없지만 뒤 카테고리의 `colorIndex`는 밀리지 않는다 / 단일 카테고리 → `[0, 360]` 한 조각 / 전부 0 이하 → `[]` / 첫 조각의 `startAngle`은 0(12시)에서 시작하고 각도가 단조 증가한다.

### 2. `components/dashboard/category-donut.tsx`

```ts
export function CategoryDonut(props: { categories: MonthStats['categories'] }): React.JSX.Element
```

인라인 SVG. 지름 200px, 두께 26px, 조각 사이 2px 틈(두께 중심 반지름에서 2px에 해당하는 각도를 `gapDeg`로 넘긴다), 12시 방향부터 시계 방향(design.md 6.7). 색은 `var(--chart-1)`~`var(--chart-8)`을 `colorIndex` 순서로 쓴다. 조각이 없으면 `var(--border)` 색의 빈 고리를 그린다. 손으로 그리는 SVG는 이 도넛 원호 하나만 허용된다(design.md 8). 등장 효과와 hover 효과는 없다.

### 3. `components/dashboard/stats-panel.tsx`

```ts
export function StatsPanel(props: { titleAside?: React.ReactNode }): React.JSX.Element   // titleAside = 제목줄 오른쪽 자리
```

제목줄(design.md 6.7):
- 이전·다음 버튼(lucide `chevron-left`·`chevron-right`, ghost sm, `data-testid="stats-prev"`·`"stats-next"`) 사이에 `formatMonthLabel(month)`(`data-testid="stats-month-label"`). 누르면 `setMonth(shiftMonth(month, ∓1))`. 이동 범위에 제한을 두지 않는다. 버튼에는 읽기용 이름(`aria-label`)을 `MESSAGES.ui`에 추가해 붙인다.
- 제목줄 오른쪽 끝은 `titleAside` 자리다. 묶음 `2-reports-demo`가 여기에 "이 달 보고서 만들기" 버튼을 넣는다. **이 step에서는 버튼을 그리지 않고 자리만 둔다.**

패널 안:
- 왼쪽(약 260px): `formatAmount(stats.total)`을 `text-amount-lg`로(`data-testid="stats-total"`) → `MESSAGES.ui`의 건수 문구(`data-testid="stats-count"`) → 통계 기준 caption(`MESSAGES.ui`의 "금액 미인식과 중복 거래는 뺐습니다.") → `CategoryDonut`.
- 오른쪽: 카테고리 표. 열 이름은 `MESSAGES.ui`의 통계 표 열(카테고리 · 금액 · 비율). 행: 색 점(모서리 50%) · `CATEGORY_LABELS[key]` · `formatAmount(amount)` · `formatRatio(ratio)`. **API가 준 순서 그대로** 그리고 색도 그 순서로 준다(금액이 큰 카테고리가 1번 색). 금액·비율은 오른쪽 정렬, `tabular-nums`, 음수 금액은 destructive 색.
- `stats.count === 0`이면 표 대신 `MESSAGES.empty.stats`(`data-testid="stats-empty"`)를 보여주고 도넛은 빈 고리다. 총액은 "0원"으로 보인다.
- 총액이 0 이하이면 API가 `ratio: null`을 주므로 비율 칸이 "—"가 된다. 화면에서 따로 판정하지 않는다.

반응형(design.md 7.3, USER_FLOWS 4.1):
- 폰(< 768px): 총액 → 도넛 → 카테고리 표 순으로 쌓고, 표는 **상위 5개 행만** 보여준다(나머지는 숨긴다. 펼치기 버튼 없음).
- 태블릿(768–1024px): 도넛 위, 표 아래. 데스크톱: 두 열.

핵심 규칙:
- 처리 중 문서가 완료되면 같은 폴링 주기에 `data.stats`가 바뀐다. 별도 요청을 만들지 않는다(UC-13 V2).
- `shiftMonth`는 `lib/stats/aggregate.ts`의 것을 쓴다. 월 계산을 화면에서 다시 만들지 않는다. `aggregate.ts`는 이 묶음 step 0에서 DB 코드를 모듈 맨 위에서 import하지 않게 만들어졌다(DB 함수 안의 `await import`). 그래도 브라우저 묶음에 DB 드라이버가 끌려오면 step 0의 규칙이 깨진 것이므로, 파일을 나누지 말고 `aggregate.ts`의 맨 위 import를 규칙대로 고친다(날짜 계산은 `lib/stats/aggregate.ts` 한 곳에 둔다).
- 문장은 모두 `MESSAGES`에서, 색은 토큰에서 가져온다.

## Acceptance Criteria

```bash
set -eu
npm run lint
npm run build
npm run test
for id in stats-month-label stats-prev stats-next stats-total stats-count stats-empty; do
  grep -q "$id" components/dashboard/stats-panel.tsx || { echo "missing testid: $id"; exit 1; }
done
if grep -rnE "#[0-9a-fA-F]{3,8}\b" components/dashboard/stats-panel.tsx components/dashboard/category-donut.tsx; then echo "AC 실패: 있으면 안 되는 것이 발견됐다(위 출력)"; exit 1; fi
if grep -nE '"(recharts|chart\.js|d3|victory|@nivo/[a-z-]+|echarts)"' package.json; then echo "AC 실패: 있으면 안 되는 것이 발견됐다(위 출력)"; exit 1; fi
if grep -rnE "@neondatabase|drizzle-orm" components; then echo "AC 실패: 있으면 안 되는 것이 발견됐다(위 출력)"; exit 1; fi
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가?
   - ADR 기술 스택을 벗어나지 않았는가? (ADR-7: 숫자는 서버가 계산한다. ADR-21: 보고서 버튼 자리는 통계 구획 안)
   - AGENTS.md CRITICAL 규칙을 위반하지 않았는가? (날짜 경계 계산은 `lib/stats/aggregate.ts` 한 곳)
3. 결과에 따라 `phases/1-documents/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "..."`. summary에는 `StatsPanel`의 props(제목줄 오른쪽 자리 이름 `titleAside`), `donutArcs`의 시그니처, 붙인 `data-testid` 목록, 순수 날짜 함수를 다른 파일로 옮겼는지 여부와 경로를 적는다.
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- 차트 라이브러리를 설치하지 마라. 이유: design.md 6.7·8절. 차트는 도넛 하나이고 원호만 직접 그린다.
- 막대·추세선·전월 비교를 넣지 마라. 이유: design.md 6.7, PRD 10.1.
- 숫자 카운트업, 패널·도넛 등장 효과, hover 확대를 넣지 마라. 이유: design.md 9. 움직이는 것은 업로드 진행률과 보고서 커서 둘뿐이다.
- 날짜 선택기, 일·주·연 전환, 카테고리 클릭 필터를 만들지 마라. 이유: PRD 10.1.
- 금액을 줄여 쓰지 마라("약 113만원"). 이유: design.md 6.3. 사용자는 숫자를 검산한다.
- 화면에서 거래를 다시 집계하거나 비율을 다시 계산하지 마라. 이유: ADR-7. 표의 숫자는 API 값 그대로다.
- "이 달 보고서 만들기" 버튼과 보고서 생성 로직을 만들지 마라. 이유: 묶음 `2-reports-demo`의 범위다. 자리만 둔다.
- 월 이동 화살표에 유니코드 도형(◀ ▶)을 쓰지 마라. 이유: design.md 8. Lucide를 쓴다.
- DB 코드(`lib/db/*`, DB를 import하는 모듈)를 클라이언트 컴포넌트로 끌어오지 마라. 이유: 번들이 깨지고 서버 전용 코드가 브라우저로 간다.
- jsdom·testing-library를 설치하지 마라. `dark:` 접두어, 컴포넌트 안 색 값(#…), 이모지를 쓰지 마라.
- 기존 테스트를 깨뜨리지 마라
