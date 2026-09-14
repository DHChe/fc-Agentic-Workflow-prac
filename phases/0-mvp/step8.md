# Step 8: edit-flow

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `docs/ARCHITECTURE.md` — "데이터 흐름"의 수정, "에러"
- `docs/USER_FLOWS.md` — 8절(상세 흐름의 수정 분기), 10절 UC-25
- `docs/UI_GUIDE.md` — 입력 필드, 버튼, 배지
- `src/types/analysis.ts` — `EDITABLE_FIELDS`, `EditableFields`, `EXPENSE_CATEGORIES`
- `src/lib/schemas/analysis.ts` — `updateAnalysisRequestSchema`
- `src/app/api/analyses/handler.ts`, `src/app/api/analyses/[id]/route.ts` — step 5의 PATCH
- `src/components/dashboard/analysis-detail.tsx` — `SummaryGrid`와 `editor` 슬롯 (step 6)
- `src/app/(app)/dashboard/[id]/page.tsx`, `src/components/dashboard/delete-analysis-button.tsx` (step 7의 패턴을 따른다)
- `src/components/ui/*`

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라. 이 step은 UI만 만든다. 타입·스키마·저장소·API는 이미 있다.

## 작업

### 1. 편집 폼 `src/components/dashboard/edit-analysis-form.tsx` (`'use client'`)

```ts
export function EditAnalysisForm(props: { id: string; result: AnalysisResult; editedAt: string | null }): React.JSX.Element
```

- 보기 모드(기본): `SummaryGrid({ result })`를 렌더하고 그 위 우측에 "수정" 버튼(secondary, lucide `Pencil`).
- 편집 모드: 같은 자리에 폼. 필드 5개 — 가맹점(`Input` text), 일자(`Input type="date"`), 합계(`Input type="number" step=1`, 음수 허용: 환불 영수증), 부가세(`Input type="number"`, 빈 값은 null), 카테고리(`select`: "없음" + `EXPENSE_CATEGORIES`, UI_GUIDE 입력 필드 스타일). 버튼: 저장(primary), 취소(text).
- 저장 시 변경된 필드만 골라 `updateAnalysisRequestSchema.safeParse`로 검증한다. 실패 → 해당 필드 아래 메시지, 요청 없음. 변경이 하나도 없으면 요청 없이 보기 모드로 돌아간다.
- 요청: `fetch(`/api/analyses/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) })`. `ok` → `router.refresh()` → 보기 모드. 401 → "세션이 만료되었습니다." + `/login` 링크. 404 → "이미 삭제된 항목입니다."를 잠깐 보인 뒤 `router.push('/dashboard')`. 그 외 실패 → 응답 `error` 문구(본문 파싱 실패 시 "저장에 실패했습니다.").
- 제출 중에는 버튼 `disabled`, 라벨 "저장 중…".
- 취소는 입력값을 원래대로 되돌린다.

### 2. 연결

- `src/app/(app)/dashboard/[id]/page.tsx`: `AnalysisDetail`의 `editor`에 `<EditAnalysisForm id={analysis.id} result={analysis.result} editedAt={analysis.editedAt} />`를 넣는다. `documentType`이 `unknown`이어도 넣는다 (사용자가 값을 채워 쓸 수 있게).
- `AnalysisDetail`은 `editedAt`이 있으면 이미 "수정됨" 배지를 보여준다 (step 6). 폼에서 중복으로 보여주지 않는다.

### 3. 테스트 (먼저 작성) `src/components/dashboard/edit-analysis-form.test.tsx`

`next/navigation`을 `vi.mock`, `global.fetch`를 `vi.fn()`.
- (a) 보기 모드에서 가맹점·합계가 보이고, "수정" 클릭 → 입력 5개가 보인다.
- (b) 합계를 비우고 저장 → 검증 메시지, `fetch` 미호출. 합계 `-12000`은 통과한다(환불).
- (c) 가맹점만 `이마트`로 바꾸고 저장 → `fetch`가 PATCH, body가 정확히 `{"merchant":"이마트"}`, 이후 `router.refresh` 호출, 보기 모드 복귀.
- (d) 아무것도 바꾸지 않고 저장 → `fetch` 미호출, 보기 모드.
- (e) 응답 `status: 401` → 세션 만료 문구. `status: 404` → `router.push('/dashboard')`.
- (f) 취소 → 입력값이 원래 값으로 돌아간다.

## Acceptance Criteria

```bash
npm run lint
npm run build
npm run test
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 데이터 흐름(변경 필드만 PATCH → refresh)을 따르는가?
   - ADR 기술 스택을 벗어나지 않았는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가? (SDK 직접 import 없음, `dark:` 없음)
3. 결과에 따라 `phases/0-mvp/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- 품목(`items`), 거래(`transactions`), 문서 유형, 신뢰도를 편집하는 UI를 만들지 마라. 이유: PRD 핵심 기능 7의 범위는 5개 필드다.
- 새 API 라우트나 서버 액션을 만들지 마라. 이유: step 5의 `PATCH /api/analyses/[id]`를 쓴다.
- 변경되지 않은 필드를 PATCH 본문에 넣지 마라. 이유: 스키마가 최소 1개 필드를 요구하고, 불필요한 덮어쓰기를 막는다.
- `window.confirm`/`alert`를 쓰지 마라. 이유: 테스트 불가.
- 기존 테스트를 깨뜨리지 마라.
