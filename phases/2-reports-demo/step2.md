# Step 2: report-generate-ui

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/PRD.md` F8, F9, 10.1
- `/docs/ARCHITECTURE.md` 5.3(완료 판정, 렌더링 규칙), 7.3, ADR-21·ADR-26, 13.1
- `/docs/USER_FLOWS.md` UC-15(E1~E6), UC-16, UC-17, 4.1(폰에서의 표), 7.3·7.5·7.8
- `/docs/design.md` 6.1(버튼·비활성 이유 한 줄), 6.7(월 통계 제목줄), 6.8(보고서 화면), 7.1, 7.3, 9절(움직임), 10절(문구 톤)
- `/docs/UI_GUIDE.md`
- 이전 step·묶음에서 만든 파일:
  - `app/api/reports/route.ts`, `app/api/reports/[id]/route.ts` (직전 step. 응답 형태와 `X-Report-Id`)
  - `lib/messages.ts`
  - `components/ui/button.tsx`, `components/section.tsx`, `components/panel.tsx`, `components/notice-line.tsx`
  - `components/dashboard/dashboard-data.tsx` (`useDashboardData`: `data`, `month`, `refresh`, `limitReached`)
  - `components/dashboard/stats-panel.tsx` (제목줄 오른쪽에 보고서 버튼 자리를 `StatsPanel({ titleAside })` 속성으로 남겨 두었다. 코드에서 이름이 다르면 코드가 우선이다)
  - `app/dashboard/page.tsx` (구획을 끼우는 방식)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 작업

보고서 만들기 버튼과, 글이 실시간으로 흐르는 영역을 만든다. 보고서 목록과 상세 화면은 다음 step(`report-pages-ui`)의 범위다. 화면은 클라이언트 컴포넌트이고 **API 라우트만 읽는다**(서버 컴포넌트에서 DB를 직접 읽지 않는다).

만들 파일: `components/reports/report-markdown.tsx`, `components/reports/report-markdown.test.ts`, `components/dashboard/report-generator.tsx`, `components/dashboard/report-generator.test.ts`. 고칠 파일: `app/dashboard/page.tsx`(보고서 구획 맨 위에 글 영역을 끼우고, 생성 상태를 두 구획이 나눠 쓰게 연결. 구획 아래쪽의 빈 상태 문장은 다음 step이 목록으로 바꿀 때까지 그대로 둔다), `components/dashboard/stats-panel.tsx`(제목줄 자리에 버튼 연결), 필요하면 `lib/messages.ts`의 `MESSAGES.ui`.

`react-markdown`을 설치한다(`^메이저` 범위).

### 시그니처

```ts
// components/dashboard/report-generator.tsx
export function reportButtonState(args: { count: number; limitReached: boolean; generating: boolean }): { disabled: boolean; reason: string | null }
export type ReportGeneration = {
  phase: 'idle' | 'streaming' | 'saved' | 'interrupted' | 'failed'
  text: string                 // 지금까지 받은 글
  reportId: string | null
  message: string | null       // MESSAGES의 문장
}
export function useReportGeneration(opts: { onFinished: () => void }): { state: ReportGeneration; start: (month: string) => Promise<void> }
export function ReportCreateButton(props: { month: string; count: number; limitReached: boolean; generating: boolean; onCreate: () => void }): React.JSX.Element
export function ReportStreamArea(props: { state: ReportGeneration }): React.JSX.Element | null

// components/reports/report-markdown.tsx
export const DISALLOWED_ELEMENTS: readonly string[]      // ['a', 'img']
export const UNWRAP_DISALLOWED: boolean                  // true
export function ReportMarkdown(props: { markdown: string; streaming?: boolean }): React.JSX.Element
```

`onFinished`는 보고서가 저장됐을 때 한 번 불린다. 대시보드 화면은 여기서 숫자 하나(`reportsReloadKey`)를 올려 둔다. 다음 step의 보고서 목록이 이 값을 받아 다시 읽는다. 이 step에서는 그 값을 읽는 곳이 없어 lint가 미사용 변수로 잡을 수 있다. 그러면 보고서 `Section`에 `key`로 넘겨 두고, 다음 step이 `ReportList`로 옮긴다. 저장 뒤의 `열기` 링크가 가리키는 `/dashboard/reports/[id]` 화면도 다음 step에서 만든다(이 step에서 그 화면을 먼저 만들지 않는다).

API 응답 형태(직전 step): `POST /api/reports` → 200 `text/plain` 스트림 + 헤더 `X-Report-Id`, 스트림 시작 전 실패는 `{ error }` + 400·401·429·502·500. `GET /api/reports/[id]` → `{ id, month, status, contentMd, modelUsed, createdAt, completedAt }`.

### 핵심 규칙 — 버튼 (통계 구획 제목줄)

- "이 달 보고서 만들기"(`MESSAGES.label.button.createReport`, primary)는 통계 구획 제목줄 오른쪽에 있고, **지금 보고 있는 달**의 보고서를 만든다(ADR-21). 기간을 고르는 폼은 없다.
- `reportButtonState`: `generating` → 비활성·이유 없음 / `limitReached` → 비활성·`MESSAGES.api.limitReached` / `count === 0` → 비활성·`MESSAGES.report.noTransactions` / 그 외 활성. 한도와 0건이 겹치면 한도 문장이 우선이다. `generating`일 때의 비활성은 화면 상태일 뿐 잠금이 아니다. 서버의 중복 생성 방지는 만들지 않는다(PRD 10.3).
- 비활성일 때 버튼을 숨기지 않는다. 이유는 툴팁만이 아니라 버튼 옆에 보이는 한 줄로 쓴다(design.md 6.1).
- 생성 상태는 대시보드 화면(또는 작은 context)이 갖고, 통계 제목줄의 버튼과 보고서 구획의 글 영역이 함께 쓴다.

### 핵심 규칙 — 생성 흐름 (`useReportGeneration`)

1. `fetch('/api/reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ month }) })`.
2. 응답이 OK가 아니면(스트림 시작 전 실패): 401 → `/sign-in?redirect_url=/dashboard`로 보낸다. 그 외는 JSON의 `error` 문장을 그대로 보여주고(`phase: 'failed'`) `refresh()`로 사용량을 다시 읽는다. 문장을 화면에서 새로 만들지 않는다.
3. OK면 `X-Report-Id` 헤더를 읽고, `response.body.getReader()` + `TextDecoder`로 글을 받아 `state.text`에 이어 붙인다. 시작할 때 보고서 구획이 보이도록 `scrollIntoView()`를 한 번 부른다(부드러운 스크롤 효과 없이).
4. 스트림이 끝나면(정상 종료든 읽기 오류든) `GET /api/reports/{id}`를 한 번 부른다. `status === 'completed'` → `MESSAGES.report.saved`(`phase: 'saved'`), 보고서 목록 다시 읽기, `refresh()`. 그 외 → `MESSAGES.report.interrupted`(`phase: 'interrupted'`), 받은 글은 화면에 남긴다.
5. 글이 흐르는 동안 `beforeunload`를 등록한다(`event.preventDefault()`와 `returnValue` 지정. 브라우저 기본 대화가 뜬다). 끝나면 해제한다. 문장은 `MESSAGES.report.leaveWarning`이다.
6. 끝난 뒤 자동으로 다시 시도하지 않는다.

### 핵심 규칙 — 글 영역

- `ReportStreamArea`: 보고서 구획 맨 위. `phase`가 `idle`이면 그리지 않는다. 제목 `보고서 작성 중`(`MESSAGES.ui`), 본문은 `ReportMarkdown`(`streaming`일 때 글 끝에 강조색 깜빡이는 커서. 허용된 두 가지 움직임 중 하나다), 상태 문장은 `NoticeLine`. 저장되면 그 보고서를 여는 링크(`열기`)를 둔다.
- `ReportMarkdown`: 스트리밍 중인 글과 저장본이 **같은 부품**을 쓴다. `react-markdown` 기본 설정(raw HTML 무시) + `disallowedElements={DISALLOWED_ELEMENTS}` + `unwrapDisallowed={UNWRAP_DISALLOWED}`. 링크의 글자는 남고 링크는 사라진다. 이미지는 사라진다. 제목·목록·굵은 글씨의 크기와 간격은 design.md 4절 토큰으로 맞춘다.
- 모든 문장은 `MESSAGES`에서 가져온다. 없으면 design.md 10절 말투로 `MESSAGES.ui`에 더한다. 컴포넌트에 문장을 직접 쓰지 않는다.
- 색은 design.md 토큰만, `dark:` 없음, 컴포넌트에 색 값(#…) 없음, 아이콘은 lucide만, 표 행·배지에 아이콘 없음.

`data-testid`: `report-create`(버튼), `report-stream`(글 영역), `report-status`(완료·중단·실패 문장).

### 확인된 사용법 (2026-09-18 조사)

- react-markdown: raw HTML은 기본으로 무시된다(`rehype-raw`를 넣어야만 그려진다). `disallowedElements={['a','img']}`만 쓰면 링크 글자까지 사라지므로 `unwrapDisallowed`를 함께 쓴다. 표는 GFM 플러그인이 있어야 그려진다. 보고서 프롬프트가 표를 쓰지 않으므로 플러그인을 설치하지 않는다.

설치된 패키지의 타입 정의와 다르면 타입 정의가 우선이다. 다르면 summary에 적어라.

### 테스트 (DOM 테스트 도구를 설치하지 않는다)

- `reportButtonState`: 활성 / 0건 / 한도 / 생성 중 / 한도와 0건이 겹칠 때 한도 문장 우선. 이유 문장은 `MESSAGES`의 값과 같다.
- `report-markdown`: `DISALLOWED_ELEMENTS`가 `['a','img']`와 같고 `UNWRAP_DISALLOWED === true`다. 파일 본문에 `rehype-raw`와 `dangerouslySetInnerHTML`이 없다(테스트가 파일을 글자로 읽어 확인한다).

## Acceptance Criteria

```bash
set -eu
npm run lint
npm run build
npm run test

if grep -rn --exclude='*.test.*' "rehype-raw\|remark-gfm\|dangerouslySetInnerHTML" components app package.json; then echo "AC 실패: 있으면 안 되는 것이 발견됐다(위 출력)"; exit 1; fi
if grep -rn "dark:" app components; then echo "AC 실패: 있으면 안 되는 것이 발견됐다(위 출력)"; exit 1; fi
if grep -rnE "#[0-9a-fA-F]{3,8}\b" components; then echo "AC 실패: 있으면 안 되는 것이 발견됐다(위 출력)"; exit 1; fi
for id in report-create report-stream report-status; do
  grep -rq "$id" components app || { echo "missing testid: $id"; exit 1; }
done
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가?
   - ADR 기술 스택을 벗어나지 않았는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/2-reports-demo/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`. summary에는 만든 부품과 props, 도우미 `reportButtonState`, 생성 상태를 어디에 두었는지(`reportsReloadKey` 포함), 붙인 `data-testid` 3개, `MESSAGES.ui`에 더한 문장을 담는다.
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- 보고서 본문의 링크와 이미지를 그리지 마라. raw HTML을 허용하지 마라. 이유: 영수증에 적힌 문구가 다른 방문자의 화면에서 링크·스크립트로 동작하는 길을 막는다(PRD F8, ARCH 5.3).
- 기간 선택 폼, 주간·연간 보고서를 만들지 마라. 이유: 버튼은 보고 있는 달 하나뿐이다(ADR-21, PRD 10.1).
- 보고서를 자동으로 만들지 마라. 보고서 삭제·편집을 만들지 마라. 이유: PRD F8, UC-16.
- 앱 안의 화면 이동을 막는 장치를 만들지 마라. 이유: 이탈 경고는 `beforeunload` 하나다(UC-15 E1·E2).
- 스트림이 끊겼을 때 자동으로 다시 요청하지 마라. 이유: 요청 1번이 사용 1회다.
- 보고서 목록과 보고서 상세 화면을 만들지 마라. 이유: 다음 step(`report-pages-ui`)의 범위다.
- 서버 컴포넌트에서 DB를 직접 읽지 마라. 이유: 조회 장치는 API 하나다.
- `remark-gfm`·`rehype-raw`·jsdom·testing-library를 설치하지 마라. 이유: 위 렌더링 규칙과 "순수 함수만 단위 테스트" 방침.
- 숫자 카운트업·등장 효과·그라데이션 등 UI_GUIDE 금지 목록을 쓰지 마라. 움직임은 스트리밍 커서뿐이다(design.md 9절).
- 컴포넌트에 문장을 직접 쓰지 마라. `dark:` 접두어, 색 값(#…), 이모지·유니코드 도형을 쓰지 마라.
- 기존 테스트를 깨뜨리지 마라
