# Step 3: report-pages-ui

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/PRD.md` F8, F9, 10.1
- `/docs/ARCHITECTURE.md` 5.3(완료 판정, 렌더링 규칙), 7.3, ADR-21·ADR-26, 13.1
- `/docs/USER_FLOWS.md` UC-15(E1~E6), UC-16, UC-17, 4.1(폰에서의 표), 7.3·7.5·7.8
- `/docs/design.md` 6.1(버튼·비활성 이유 한 줄), 6.7(월 통계 제목줄), 6.8(보고서 화면), 7.1, 7.3, 9절(움직임), 10절(문구 톤)
- `/docs/UI_GUIDE.md`
- 이전 step·묶음에서 만든 파일:
  - `app/api/reports/route.ts`, `app/api/reports/[id]/route.ts` (응답 형태)
  - `components/reports/report-markdown.tsx` (직전 step. 저장본도 이 부품으로 그린다)
  - `components/dashboard/report-generator.tsx` (직전 step. 저장 뒤의 `열기` 링크, `onFinished`)
  - `lib/messages.ts`, `lib/format.ts` (`formatMonthLabel`, `formatDateTime`)
  - `components/ui/button.tsx`, `components/section.tsx`, `components/panel.tsx`, `components/empty-state.tsx`, `components/notice-line.tsx`
  - `components/dashboard/document-list.tsx` (목록 표·폰 열 숨김의 본보기)
  - `app/dashboard/page.tsx` (`reportsReloadKey`가 어디에 있는지), `app/dashboard/documents/[id]/page.tsx` (클라이언트 조회·404 블록·돌아가기 링크의 본보기)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 작업

보고서 목록과 보고서 상세 화면을 만든다. 화면은 클라이언트 컴포넌트이고 **API 라우트만 읽는다**(서버 컴포넌트에서 DB를 직접 읽지 않는다). 이 step은 패키지를 설치하지 않는다.

만들 파일: `components/dashboard/report-list.tsx`, `app/dashboard/reports/[id]/page.tsx`. 고칠 파일: `app/dashboard/page.tsx`(보고서 구획의 빈 상태 자리를 `ReportList`로 교체하고 직전 step의 `reportsReloadKey`를 넘긴다), 필요하면 `lib/messages.ts`의 `MESSAGES.ui`.

### 시그니처

```ts
// components/dashboard/report-list.tsx
export function ReportList(props: { reloadKey: number }): React.JSX.Element      // reloadKey가 바뀌면 GET /api/reports를 다시 읽는다
```

API 응답 형태: `GET /api/reports` → `{ reports: Array<{ id, month, createdAt, completedAt }> }`(완료된 것만, 최근 순), `GET /api/reports/[id]` → `{ id, month, status, contentMd, modelUsed, createdAt, completedAt }`, 오류는 `{ error }`.

### 핵심 규칙

- `ReportList`: 첫 로드와 보고서 생성 직후에만 `GET /api/reports`를 읽는다(폴링하지 않는다). 열은 `기간`(`formatMonthLabel`) · `만든 시각`(`formatDateTime`), 행 전체가 `/dashboard/reports/[id]` 링크, 비어 있으면 `MESSAGES.empty.reports`(EmptyState). 폰에서도 두 열을 모두 보인다(USER_FLOWS 4.1).
- 상세 `app/dashboard/reports/[id]/page.tsx`: 클라이언트에서 `GET /api/reports/[id]`. 404이거나 `status !== 'completed'`이면 `MESSAGES.api.reportNotFound` + `대시보드로 가기` 링크 블록. 401이면 로그인 화면으로. 본문 폭 720px, 위에 돌아가기 링크(chevron-left + `대시보드`), 제목줄에 기간·만든 시각·`사용 모델`, 오른쪽에 "복사"(`MESSAGES.label.button.copy`) 버튼. 복사는 `navigator.clipboard.writeText(contentMd)`(마크다운 원문)이고 성공하면 `복사했습니다.`를 보여준다.
- 상세의 본문은 직전 step의 `ReportMarkdown`으로 그린다. 링크·이미지·raw HTML 규칙을 이 step에서 다시 구현하지 않는다.
- 모든 문장은 `MESSAGES`에서 가져온다. 없으면 design.md 10절 말투로 `MESSAGES.ui`에 더한다. 컴포넌트에 문장을 직접 쓰지 않는다.
- 색은 design.md 토큰만, `dark:` 없음, 컴포넌트에 색 값(#…) 없음, 아이콘은 lucide만, 표 행·배지에 아이콘 없음.

`data-testid`: `report-list`(목록), `report-row`(목록 행), `report-copy`(복사 버튼).

### 확인된 사용법 (2026-09-18 조사)

- Next 16: 페이지의 `params`는 Promise다. 클라이언트 페이지에서는 `use(params)`로 읽거나, 얇은 서버 래퍼가 `id`를 넘긴다.

설치된 패키지의 타입 정의와 다르면 타입 정의가 우선이다. 다르면 summary에 적어라.

### 테스트

이 step에는 새 순수 함수가 없다. 새 단위 테스트를 억지로 만들지 않는다. 기존 테스트가 모두 통과해야 한다.

## Acceptance Criteria

```bash
set -eu
npm run lint
npm run build
npm run test

test -f components/dashboard/report-list.tsx
test -f "app/dashboard/reports/[id]/page.tsx"
if grep -rn --exclude='*.test.*' "rehype-raw\|remark-gfm\|dangerouslySetInnerHTML" components app package.json; then echo "AC 실패: 있으면 안 되는 것이 발견됐다(위 출력)"; exit 1; fi
if grep -rn "dark:" app components; then echo "AC 실패: 있으면 안 되는 것이 발견됐다(위 출력)"; exit 1; fi
if grep -rnE "#[0-9a-fA-F]{3,8}\b" components; then echo "AC 실패: 있으면 안 되는 것이 발견됐다(위 출력)"; exit 1; fi
for id in report-list report-row report-copy; do
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
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`. summary에는 만든 부품과 props, 목록을 다시 읽는 방식, 붙인 `data-testid` 3개, `MESSAGES.ui`에 더한 문장을 담는다.
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- 보고서 본문의 링크와 이미지를 그리지 마라. raw HTML을 허용하지 마라. 이유: 영수증에 적힌 문구가 다른 방문자의 화면에서 링크·스크립트로 동작하는 길을 막는다(PRD F8, ARCH 5.3).
- 보고서 삭제·편집을 만들지 마라. 이유: PRD F8, UC-16.
- 생성 중·중단된 보고서를 목록에 보여주지 마라. 이유: 목록은 완료만 보여준다(UC-16).
- CSV·PDF 등 복사 외의 내보내기를 만들지 마라. 이유: PRD 10.1.
- 보고서 목록을 폴링하지 마라. 이유: 첫 로드와 생성 직후에만 읽는다(UC-04).
- 서버 컴포넌트에서 DB를 직접 읽지 마라. 이유: 조회 장치는 API 하나다.
- `remark-gfm`·`rehype-raw`·jsdom·testing-library를 설치하지 마라. 이유: 렌더링 규칙과 "순수 함수만 단위 테스트" 방침.
- 숫자 카운트업·등장 효과·그라데이션 등 UI_GUIDE 금지 목록을 쓰지 마라. 움직임은 스트리밍 커서뿐이다(design.md 9절).
- 컴포넌트에 문장을 직접 쓰지 마라. `dark:` 접두어, 색 값(#…), 이모지·유니코드 도형을 쓰지 마라.
- 기존 테스트를 깨뜨리지 마라
