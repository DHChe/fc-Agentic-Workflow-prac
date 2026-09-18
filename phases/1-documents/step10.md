# Step 10: dashboard-list-ui

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/ARCHITECTURE.md` 5.2(폴링 규칙), 5.4(응답 형태), 8절(에러 응답 규약)
- `/docs/PRD.md` F5, F9, 5절, 10.1
- `/docs/USER_FLOWS.md` UC-03 E1, UC-04, UC-08, UC-10, UC-17, 4.1(폰에서의 표), 7.1, 7.3, 7.6, 7.8
- `/docs/design.md` 3절, 4절, 6.2(배지), 6.3(금액), 6.4(헤더), 6.5(구획·표), 6.9(빈 상태·안내 줄), 7.1, 7.3, 8절, 9절
- `/docs/UI_GUIDE.md`
- `/lib/messages.ts`, `/lib/format.ts`, `/lib/categories.ts`
- `/components/ui/button.tsx`, `/components/ui/badge.tsx`, `/components/section.tsx`, `/components/panel.tsx`, `/components/empty-state.tsx`, `/components/notice-line.tsx`, `/components/app-header.tsx`
- `/app/dashboard/layout.tsx`, `/app/dashboard/page.tsx` (묶음 `0-foundation`이 만든 빈 상태 화면)
- `/lib/api-types.ts`, `/app/api/dashboard/route.ts` (이 묶음 step 9)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 작업

대시보드의 데이터 읽기 장치 하나와, 그 위에 얹는 헤더 사용량·문서 목록을 만든다. 업로드·통계·보고서 구획은 이 step에서 건드리지 않는다(묶음 `0-foundation`의 정적 빈 상태 그대로 둔다).

만들 파일·고칠 파일:

- `components/dashboard/polling.ts`, `components/dashboard/polling.test.ts` (테스트를 먼저 쓴다)
- `components/dashboard/dashboard-data.tsx` (`'use client'`)
- `components/dashboard/usage-counter.tsx` (`'use client'`)
- `components/dashboard/document-list.tsx` (`'use client'`)
- `app/dashboard/layout.tsx` (수정: provider로 감싸고 헤더의 사용량 자리에 `UsageCounter`를 넣는다)
- `app/dashboard/page.tsx` (수정: 문서 구획만 실제 데이터로 바꾼다)

### 1. `components/dashboard/polling.ts` (순수 함수. JSX 없음. 테스트 먼저)

```ts
export const POLL_INTERVAL_MS = 4000
import type { DocumentStatus } from '@/lib/db/schema'   // 타입만. 값 import 금지(DB 코드가 브라우저 묶음에 들어간다)
export function shouldPoll(documents: Array<{ status: DocumentStatus }>): boolean          // processing이 하나라도 있으면 true
export function nextTickAction(state: { inFlight: boolean; hasProcessing: boolean }): 'fetch' | 'skip' | 'stop'
```

테스트 케이스: 빈 목록 → false / completed·failed만 → false / processing 하나 → true / `hasProcessing: false` → `'stop'`(진행 중 여부와 무관) / `hasProcessing: true, inFlight: true` → `'skip'` / `hasProcessing: true, inFlight: false` → `'fetch'` / `POLL_INTERVAL_MS === 4000`.

### 2. `components/dashboard/dashboard-data.tsx`

```ts
export function DashboardDataProvider(props: { children: React.ReactNode }): React.JSX.Element
export function useDashboardData(): {
  data: DashboardResponse | null
  month: string | null            // 서버가 고른 기본 달을 받은 뒤에는 그 값
  setMonth: (month: string) => void
  refresh: () => Promise<DashboardResponse | null>
  limitReached: boolean           // used >= limit
  loading: boolean
}
```

핵심 규칙(ARCH 5.2, UC-04):
- `GET /api/dashboard` **하나만** 부른다. 첫 로드, 4초 폴링, 업로드·삭제·보고서 직후의 `refresh()`가 모두 같은 함수다.
- 사용자가 달을 직접 옮기기 전(`setMonth`를 부르기 전)에는 첫 로드·폴링·`refresh()` 모두 `month` 없이 부르고, 응답의 `month`를 화면에 쓴다. 이유: 빈 계정에 첫 문서를 올리면 기본 달이 "거래가 있는 가장 최근 달"로 바뀌어야 방금 올린 건이 통계에 보인다(PRD F7, J1 8단계). `setMonth`를 부른 뒤에는 그 달로 고정해 `?month=YYYY-MM`로 읽는다(폴링 포함).
- 폴링은 `shouldPoll(data.documents)`가 true일 때만 돈다. 주기마다 `nextTickAction`으로 판정한다: 직전 요청이 아직 진행 중이면 그 주기를 건너뛰고, processing이 없으면 타이머를 멈춘다.
- 응답이 401이면 폴링을 멈추고 `window.location.assign('/sign-in?redirect_url=' + encodeURIComponent(현재 경로))`로 보낸다.
- 그 외 오류(네트워크, 500)는 직전 `data`를 유지한다. `refresh()`는 실패하면 null을 돌려준다.
- 언마운트 때 타이머를 지운다.

### 3. `components/dashboard/usage-counter.tsx`와 레이아웃

- `MESSAGES.label.usage(used)`("오늘 사용 n/50")를 보여준다. 숫자는 `tabular-nums`, 줄바꿈하지 않는다. `data-testid="usage-counter"`. 데이터가 오기 전에는 아무것도 그리지 않는다.
- `app/dashboard/layout.tsx`는 서버 컴포넌트로 남는다(시연 계정이면 로그아웃 버튼, 아니면 `UserButton`을 고르는 분기를 그대로 둔다). `DashboardDataProvider`로 헤더와 본문을 함께 감싸고, `AppHeader`의 사용량 자리에 `<UsageCounter />`를 넘긴다. 넘기는 방식은 `components/app-header.tsx`가 정한 그대로 따른다.
- provider가 레이아웃에 있으므로 문서 상세·보고서 상세 화면에서도 헤더 사용량이 보인다.

### 4. `components/dashboard/document-list.tsx`

- 열: 상태 배지 · 종류 · 거래 · 합계 · 올린 시각(`MESSAGES.ui`의 문서 목록 열 이름). design.md 6.5: 열 이름은 caption + muted, 표 안은 `text-cell`, 행 위아래 10px, 행 사이 `border-soft` 선.
- 상태 배지: `Badge` tone `processing`·`completed`·`failed` + `MESSAGES.label.status.*`.
- 종류: `MESSAGES.ui`의 문서 종류 표기. `unknown`이면 `MESSAGES.label.placeholder`("—").
- 거래·합계: null이면 "—". 합계는 `formatAmount`, 오른쪽 정렬, `tabular-nums`, 음수는 destructive 색.
- 올린 시각: `formatDateTime`.
- 실패 행은 행 아래에 `failureReason` 문장을 그대로 보여준다(`data-testid="document-failure-reason"`). 재시도 버튼은 없다.
- 행 전체가 `/dashboard/documents/{id}`로 가는 링크다. 행과 배지 안에 아이콘을 넣지 않는다.
- 문서가 없으면 `EmptyState`(inbox 아이콘) + `MESSAGES.empty.documents`.
- 폰(< 768px)에서는 **거래 열만 숨긴다**(USER_FLOWS 4.1). 카드형으로 바꾸지 않는다.
- 주소에 `?deleted=1`이 있으면 `NoticeLine`으로 `MESSAGES.remove.done`을 한 번 보여주고 `router.replace('/dashboard')`로 쿼리를 지운다. `useSearchParams`를 쓰는 컴포넌트는 `Suspense`로 감싼다(빌드 오류 방지).
- `data-testid`: `document-list`(표 또는 목록 뿌리), `document-row`(+ `data-status="processing|completed|failed"`), `document-status-badge`, `document-failure-reason`.

### 5. `app/dashboard/page.tsx`

클라이언트 구성 컴포넌트를 렌더한다. 구획 순서(업로드 → 월 통계 → 문서 → 보고서)를 유지하고, 문서 구획의 본문만 `DocumentList`로 바꾼다. 나머지 세 구획은 다음 step들이 바꾼다.

공통 규칙:
- 문장은 모두 `MESSAGES`에서 가져온다. 없으면 design.md 10절 말투로 `MESSAGES.ui`에 추가한다. 컴포넌트에 문장을 직접 쓰지 않는다.
- 색은 design.md 토큰만 쓴다. 타입은 `lib/api-types.ts`에서 가져온다.

## Acceptance Criteria

```bash
set -eu
npm run lint
npm run build
npm run test
grep -q 'data-testid="usage-counter"' components/dashboard/usage-counter.tsx
grep -q 'document-failure-reason' components/dashboard/document-list.tsx
if grep -rn "dark:" components/dashboard app/dashboard; then echo "AC 실패: 있으면 안 되는 것이 발견됐다(위 출력)"; exit 1; fi
if grep -rnE "#[0-9a-fA-F]{3,8}\b" components/dashboard; then echo "AC 실패: 있으면 안 되는 것이 발견됐다(위 출력)"; exit 1; fi
if grep -rn "visibilitychange" components app; then echo "AC 실패: 있으면 안 되는 것이 발견됐다(위 출력)"; exit 1; fi
for id in document-list document-row document-status-badge document-failure-reason; do
  grep -q "$id" components/dashboard/document-list.tsx || { echo "missing testid: $id"; exit 1; }
done
grep -q 'data-status=' components/dashboard/document-list.tsx
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가? (`components/dashboard/`)
   - ADR 기술 스택을 벗어나지 않았는가? (ADR-25: 조회 하나)
   - AGENTS.md CRITICAL 규칙을 위반하지 않았는가? (화면은 쓰기를 하지 않는다. 문구는 `lib/messages.ts`)
3. 결과에 따라 `phases/1-documents/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "..."`. summary에는 `useDashboardData()`가 돌려주는 필드 이름, `polling.ts`의 export, 헤더에 사용량을 넘긴 방식, 붙인 `data-testid` 목록, `app/dashboard/page.tsx`에서 다음 step이 바꿀 자리(업로드·통계·보고서 구획)를 적는다.
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- 목록·통계·사용량을 서로 다른 요청으로 읽지 마라. 이유: ADR-25. 폴링은 요청 1개이고 세 값이 같은 시점이어야 한다.
- 처리 중 문서가 없는데 폴링하지 마라. 이유: ARCH 5.2. Neon 무료 한도(CU-시간)를 쓸데없이 쓴다.
- 직전 요청이 끝나기 전에 다음 요청을 겹쳐 보내지 마라. 이유: 느린 응답이 쌓여 순서가 뒤집힌다.
- `visibilitychange`로 즉시 재조회하는 장치를 넣지 마라. 이유: PRD 10.1에서 제외했다. 화면을 켜면 4초 안에 폴링이 재개된다.
- SWR·React Query 같은 데이터 라이브러리를 설치하지 마라. 이유: fetch와 타이머로 충분하다. 장치는 하나로 둔다.
- 서버 컴포넌트에서 DB를 직접 읽지 마라. 이유: 10분 실패 판정이 API 안에 있다. 조회 길을 하나로 둔다.
- 목록 상한·"더 보기"·검색·정렬 UI, 재시도 버튼, 목록 행의 삭제 버튼을 만들지 마라. 이유: PRD 10.1. 삭제는 상세 화면에서 한다.
- 목록 행·배지·표 칸에 아이콘을 넣지 마라. 폰에서 카드형 목록으로 바꾸지 마라. 이유: design.md 7.3·8절.
- jsdom·testing-library를 설치하지 마라. 이유: 단위 테스트는 `polling.ts`의 순수 함수만 다룬다.
- `dark:` 접두어, 컴포넌트 안 색 값(#…), 이모지·유니코드 도형(▶, ✓ 등)을 쓰지 마라.
- 업로드·통계·보고서 구획을 이 step에서 구현하지 마라. 이유: 다음 step과 충돌한다.
- 기존 테스트를 깨뜨리지 마라
