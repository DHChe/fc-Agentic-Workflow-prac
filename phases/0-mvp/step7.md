# Step 7: upload-flow

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `docs/ARCHITECTURE.md` — "데이터 흐름"의 업로드·분석, 삭제. "상태 관리"
- `docs/PRD.md` — "입력 제약", 핵심 기능 3
- `docs/UI_GUIDE.md` — 업로드 영역, 버튼(danger), 애니메이션(스피너만 허용)
- `docs/USER_FLOWS.md` — 6절 상태 머신과 상태별 화면 표, 11절 예외 표. 이 step의 UI 상태는 그 표를 그대로 구현한다
- `src/types/analysis.ts` (`ALLOWED_MIME_TYPES`, `MAX_*_BYTES`)
- `src/services/storage/browser-upload.ts`, `src/lib/supabase/client.ts`
- `src/app/api/analyses/handler.ts` — 요청 본문과 에러 응답 형식
- `src/app/(app)/dashboard/page.tsx`, `src/app/(app)/dashboard/[id]/page.tsx`, `src/components/dashboard/analysis-detail.tsx` — step 6 산출물

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 작업

### 1. 파일 검증 `src/lib/upload/validate-file.ts` (순수 함수)

```ts
export type FileCheck = { ok: true } | { ok: false; reason: string }
export function validateReceiptFile(file: { type: string; size: number; name: string }): FileCheck
```
- 허용 형식이 아니면 "PDF, JPEG, PNG, WEBP 파일만 업로드할 수 있습니다." (HEIC이면 "HEIC은 지원하지 않습니다. JPEG로 변환해 주세요.")
- PDF 20MB 초과 → "PDF는 20MB 이하만 가능합니다.", 이미지 5MB 초과 → "이미지는 5MB 이하만 가능합니다."
- 크기 0 → "빈 파일입니다."

### 2. 업로드 폼 `src/components/upload/upload-form.tsx` (`'use client'`)

```ts
export type UploadPhase = 'idle' | 'uploading' | 'analyzing' | 'error' | 'needLogin'
export function UploadForm(props: { userId: string }): React.JSX.Element
```
- UI_GUIDE의 업로드 영역: 점선 박스, 클릭하면 파일 선택(`accept`는 허용 MIME 목록), 드래그 앤 드롭 지원(드래그 오버 시 `border-accent`). 파일 1개만. 박스 안에 안내 한 줄: "PDF 20MB, 이미지(JPEG·PNG·WEBP) 5MB 이하".
- 흐름: `validateReceiptFile` 실패 → `error` 단계에 이유 표시, 네트워크 호출 없음. 성공 → `uploading`: `uploadReceipt(createBrowserSupabase(), userId, file)` → `analyzing`: `fetch('/api/analyses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ storagePath, fileName: file.name, mimeType: file.type }) })` → `ok`면 `router.push(`/dashboard/${id}`)`.
- 실패 분기 (USER_FLOWS 11절):
  - 업로드 자체 실패 → `error`, "업로드에 실패했습니다. 다시 시도하세요." (Supabase 오류 메시지를 그대로 보이지 않는다)
  - `fetch`가 reject(네트워크) → `error`, "네트워크 오류입니다. 다시 시도하세요."
  - 401 → `needLogin`, "세션이 만료되었습니다." + `/login` 링크.
  - 504 또는 본문이 JSON이 아님 → `error`, "시간이 초과되었습니다. 페이지 수가 적은 파일로 다시 시도하세요."
  - 그 외 4xx/5xx → `error`, 본문의 `error` 문구.
  - 서버가 download 이후 실패하면 파일을 스스로 지운다 (step 5). 그 전에 실패한 경우(401 등)나 504의 고아 파일은 MVP에서 정리하지 않는다. 클라이언트는 Storage에서 파일을 지우지 않는다.
  - `error` 상태에는 "다른 파일 선택" 외에 "다시 시도" 버튼을 둔다. 다시 시도는 같은 `File`로 처음(`uploading`)부터 다시 진행한다. 이유: 서버가 실패 시 파일을 지우므로 `storagePath` 재사용은 안전하지 않다.
- 진행 중에는 입력을 막고 "업로드 중…" / "분석 중… 최대 1분 걸릴 수 있습니다." 문구와 스피너(`lucide-react`의 `Loader2` + `animate-spin`).
- `error`에서 다른 파일을 고르면 `idle`로 돌아간다.

### 3. 삭제 버튼 `src/components/dashboard/delete-analysis-button.tsx` (`'use client'`)

```ts
export function DeleteAnalysisButton(props: { id: string }): React.JSX.Element
```
- 첫 클릭 → 같은 자리에 "정말 삭제할까요?" + [삭제](danger) [취소](text). `window.confirm`은 쓰지 않는다.
- 삭제 확정 → `fetch(`/api/analyses/${id}`, { method: 'DELETE' })` → `ok` 또는 `status === 404`(이미 삭제됨)면 `router.push('/dashboard')` 후 `router.refresh()`. 그 외 실패 시 응답 `error` 표시. 확정 후 두 번째 클릭은 무시한다(`disabled`).

### 4. 연결

- `src/app/(app)/dashboard/page.tsx`: `SummaryCards`와 "분석 내역" 사이에 `<UploadForm userId={user.id} />`를 넣는다.
- `src/app/(app)/dashboard/[id]/page.tsx`: `AnalysisDetail`의 `actions`에 `<DeleteAnalysisButton id={analysis.id} />`.

### 5. 테스트 (먼저 작성)

- `src/lib/upload/validate-file.test.ts`: 허용 4형식 통과, `image/heic` 메시지, PDF 21MB 실패, 이미지 5MB 정확히 통과·5MB+1 실패, 크기 0 실패.
- `src/components/upload/upload-form.test.tsx`: `@/lib/supabase/client`, `@/services/storage/browser-upload`, `next/navigation`을 `vi.mock`, `global.fetch`를 `vi.fn()`으로 대체. (a) gif 선택 → 이유 표시, `uploadReceipt`·`fetch` 미호출. (b) png 선택 → `uploadReceipt` 호출 → `fetch`가 `/api/analyses`에 `storagePath` 포함 JSON으로 POST → `router.push('/dashboard/abc')`. (c) `fetch`가 `{ ok: false, status: 502, json: () => ({ error: '분석 서비스 호출에 실패했습니다.' }) }` → 그 문구 표시. (d) `status: 401` → "세션이 만료되었습니다."와 `/login` 링크. (e) `status: 504`이고 `json`이 reject → 시간 초과 문구. (f) 오류 후 "다시 시도" 클릭 → `uploadReceipt`가 다시 호출된다.
- `src/components/dashboard/delete-analysis-button.test.tsx`: 첫 클릭은 `fetch` 미호출, 확정 클릭 → DELETE 호출 → `router.push('/dashboard')`. `status: 404`도 `router.push('/dashboard')`.

## Acceptance Criteria

```bash
npm run lint
npm run build
npm run test
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 데이터 흐름(검증 → Storage 업로드 → POST 경로만 → 이동)을 따르는가?
   - ADR 기술 스택을 벗어나지 않았는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가? (API에 파일 본문 없음, `@supabase/supabase-js` 직접 import 없음)
3. 결과에 따라 `phases/0-mvp/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- `FormData`로 파일을 API에 보내지 마라. 이유: Vercel 4.5MB 제한 (CLAUDE.md CRITICAL).
- 여러 파일 동시 업로드, 이미지 축소, 업로드 진행률 바를 구현하지 마라. 이유: PRD MVP 제외.
- 클라이언트에서 Storage 파일을 지우는 정리 로직을 넣지 마라. 이유: 서버가 정리한다. 남는 경우는 MVP에서 감수한다.
- `window.confirm`/`alert`를 쓰지 마라. 이유: 테스트 불가하고 UI_GUIDE와 어긋난다.
- 삭제 후 목록을 클라이언트에서 다시 fetch 하지 마라. 이유: `router.refresh()`로 Server Component가 다시 조회한다.
- 기존 테스트를 깨뜨리지 마라.
