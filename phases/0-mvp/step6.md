# Step 6: dashboard-pages

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `docs/UI_GUIDE.md` — 카드, 표, 배지, 타이포그래피(요약 숫자), 레이아웃
- `docs/ARCHITECTURE.md` — "패턴"의 읽기 경로, "데이터 흐름"의 조회
- `docs/PRD.md` — 핵심 기능 4, 5
- `docs/USER_FLOWS.md` — 8절(상세·삭제 흐름), 10절 UC-12~UC-17, UC-20, UC-21, 11절 예외 표
- `src/types/analysis.ts`, `src/lib/utils/format.ts`, `src/lib/utils/summary.ts` (`computeSummary`)
- `src/services/repository/index.ts` (`createAnalysisRepository`), `src/services/storage/index.ts` (`createReceiptStorage`) — 페이지는 이 팩토리만 import 한다
- `src/lib/supabase/server.ts`, `src/app/(app)/layout.tsx`, `src/app/(app)/dashboard/page.tsx` (step 3의 임시 페이지)
- `src/components/ui/*`

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 작업

이 step은 읽기 전용 화면만 만든다. 업로드와 삭제는 step 7에서 붙인다.

### 1. 컴포넌트 (`src/components/dashboard/`, 모두 Server Component 호환 — `'use client'` 없음)

```ts
export function SummaryCards(props: { summary: DashboardSummary }): React.JSX.Element
// 카드 2개: "전체 분석" (count, 단위 "건"), "이번 달 합계" (formatAmount(monthTotal))

export function AnalysisList(props: { items: AnalysisSummary[] }): React.JSX.Element
// 표: 일자 | 유형(Badge: 영수증/카드명세서/미분류) | 가맹점(없으면 파일명) | 카테고리 | 금액(formatAmount(totalAmount, currency), 우측, tabular-nums). `overflow-x-auto` 컨테이너로 감싼다
// 각 <td> 안에 Link(`/dashboard/${id}`)를 넣어 행 전체가 클릭되게 한다. <a>로 <tr>을 감싸지 마라 (유효하지 않은 HTML, hydration 불일치). items가 비면 EmptyState.

export function EmptyState(): React.JSX.Element
// "아직 분석한 문서가 없습니다." + "위에서 첫 파일을 업로드하세요." (중앙 정렬 허용)

export function SummaryGrid(props: { result: AnalysisResult }): React.JSX.Element
// 2~3열 그리드: 가맹점 / 일자 / 합계 / 부가세 / 카테고리 / 신뢰도(퍼센트). step 8의 편집 폼이 보기 모드에서 재사용한다

export function AnalysisDetail(props: { analysis: Analysis; previewUrl: string | null; actions?: React.ReactNode; editor?: React.ReactNode }): React.JSX.Element
// editor가 있으면 SummaryGrid 자리에 editor를 렌더한다 (step 8이 넣는다). 없으면 SummaryGrid
// 상단: 파일명(제목), 생성일시(formatDateTime), 유형 Badge, confidence < 0.6 이면 "확인 필요" Badge(text-warning), actions 슬롯(우측)
// documentType === 'unknown' 이면 요약 그리드 대신 안내 카드: "영수증이나 명세서로 판독하지 못했습니다." + notes + "이 항목을 삭제하고 다른 파일을 올려 보세요." (삭제 버튼은 actions 슬롯이 담당)
// 요약: SummaryGrid (또는 editor). editedAt이 있으면 상단에 Badge "수정됨 " + formatDateTime(editedAt)
// items가 있으면 "품목" 표(품목명 | 수량 | 금액), transactions가 있으면 "거래 내역" 표(일자 | 가맹점 | 카테고리 | 금액). 모든 표는 `overflow-x-auto` 컨테이너로 감싼다 (모바일)
// notes가 있으면 "메모" 카드
// 원본: previewUrl이 있고 mimeType이 image/* 면 <img> (바로 위에 {/* eslint-disable-next-line @next/next/no-img-element */} 를 붙인다. next/image는 쓰지 마라: 서명 URL은 만료되는 외부 호스트라 remotePatterns 설정이 필요해진다), application/pdf 면 <iframe title="원본 PDF" className="w-full h-[600px]">. 아래에 "새 탭에서 열기" 링크(`target="_blank" rel="noopener noreferrer"`). previewUrl이 null이면 "원본을 불러올 수 없습니다. 새로고침하세요."
```

### 2. 페이지

- `src/app/(app)/dashboard/page.tsx` (Server Component): `getCurrentUser()`(없으면 `redirect('/login')`) → `createServerSupabase()` → `createAnalysisRepository(supabase).listByUser(user.id)` → `computeSummary(items, new Date())`. 렌더 순서: 제목 "대시보드" → `SummaryCards` → 섹션 제목 "분석 내역" → `AnalysisList`. step 7이 `SummaryCards`와 목록 사이에 업로드 폼을 넣는다.
- `src/app/(app)/dashboard/[id]/page.tsx`: `params`(Promise) await → `getById(id, user.id)` → `null`이면 `notFound()`. `previewUrl`은 `createReceiptStorage(supabase).createSignedUrl(analysis.storagePath, 300)`을 try/catch로 감싸 실패하면 `null` (페이지가 죽지 않는다). 300초: 명세서를 표와 대조하며 읽는 시간. 상단에 "← 대시보드" 텍스트 링크. `AnalysisDetail` 렌더.
- `src/app/(app)/dashboard/[id]/not-found.tsx`: "분석을 찾을 수 없습니다." + 대시보드 링크.
- 페이지 콘텐츠 wrapper에 `space-y-8`. 매 요청 조회이므로 `export const dynamic = 'force-dynamic'`을 두 페이지에 선언한다.

### 3. 테스트 (먼저 작성)

- `src/components/dashboard/summary-cards.test.tsx`: `{ count: 3, monthTotal: 125000 }` → "3건", "125,000원"이 보인다.
- `src/components/dashboard/analysis-list.test.tsx`: 2개 항목 → 행 2개와 `/dashboard/<id>` 링크. 빈 배열 → 빈 상태 문구.
- `src/components/dashboard/analysis-detail.test.tsx`: 영수증(items 2개) → "품목" 표와 행 2개, "거래 내역" 없음. 카드명세서(transactions 3개) → 반대. `previewUrl`이 이미지면 `img`, PDF면 `iframe`, `null`이면 안내 문구. `confidence: 0.4` → "확인 필요" 배지, `0.9` → 없음. `documentType: 'unknown'` → 판독 실패 안내 문구.

페이지(Server Component)는 테스트하지 않는다.

## Acceptance Criteria

```bash
npm run lint
npm run build
npm run test
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가? (`components/dashboard`, `(app)/dashboard/[id]`)
   - ADR 기술 스택을 벗어나지 않았는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가? (읽기는 Server Component에서 repository 팩토리 호출, 구현 클래스·SDK 직접 import 없음, 자기 API fetch 없음, `dark:` 없음)
   - UI_GUIDE 안티패턴(그라데이션, blur, 글로우, 아이콘 컨테이너)이 없는가?
3. 결과에 따라 `phases/0-mvp/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"` (컴포넌트 이름과 `actions`·`editor` 슬롯, 업로드 폼 삽입 위치 포함)
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- 업로드 폼과 삭제 버튼을 만들지 마라. 이유: step 7의 범위다.
- 클라이언트 컴포넌트에서 `fetch('/api/...')`로 목록을 가져오지 마라. 이유: 읽기는 Server Component 경로 (CLAUDE.md).
- 서명 URL 만료 시간을 300초보다 길게 두지 마라. 이유: 원본은 민감 정보다. 5분은 상세 화면을 읽는 시간에 맞춘 값이다.
- 컴포넌트에서 `dark:` 변형을 쓰지 마라. 이유: 토큰 클래스만 사용 (ADR-008).
- 기존 테스트를 깨뜨리지 마라.
