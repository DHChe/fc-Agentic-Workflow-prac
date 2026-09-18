# Step 11: upload-ui

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/ARCHITECTURE.md` 5.1(업로드와 사용량), 13.1(Vercel Blob)
- `/docs/PRD.md` F3, F9, 7절(제한값), 10.1
- `/docs/USER_FLOWS.md` UC-05, UC-06, UC-07, UC-17, 7.2, 7.3, 7.8
- `/docs/design.md` 6.1(버튼), 6.6(업로드 영역), 6.9, 7.3, 8절, 9절
- `/docs/UI_GUIDE.md`
- `/lib/messages.ts`, `/lib/format.ts`
- `/components/ui/button.tsx`, `/components/section.tsx`, `/components/panel.tsx`, `/components/notice-line.tsx`
- `/lib/upload/validate.ts` (이 묶음 step 1)
- `/public/samples/receipt-sample.jpg` (step 4)
- `/app/api/blob/upload/route.ts`, `/app/api/documents/route.ts` (step 8)
- `/components/dashboard/dashboard-data.tsx`, `/app/dashboard/page.tsx` (step 10)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 작업

대시보드 맨 위의 업로드 구획을 만든다. 브라우저가 파일을 Vercel Blob으로 직접 올리고, 끝나면 `POST /api/documents`를 부른다.

만들 파일·고칠 파일:

- `components/dashboard/upload-helpers.ts`, `components/dashboard/upload-helpers.test.ts` (테스트를 먼저 쓴다)
- `components/dashboard/upload-panel.tsx` (`'use client'`)
- `app/dashboard/page.tsx` (수정: 업로드 구획의 본문을 `UploadPanel`로 바꾼다)

### 이 step이 쓰는 것 (이미 있다. 다시 만들지 마라)

```ts
// lib/upload/validate.ts — 서버·브라우저 공용
export const MAX_FILE_BYTES = 10_000_000
export type UploadExt = 'jpg' | 'jpeg' | 'png' | 'pdf'
export function extFromContentType(type: string): UploadExt | null
export function checkClientFile(file: { size: number; type: string }): null | 'invalidType' | 'tooLarge'

// components/dashboard/dashboard-data.tsx
useDashboardData(): { data, month, setMonth, refresh, limitReached, loading }
```

API: `POST /api/blob/upload`(토큰 발급. 이 시점에 사용 +1), `POST /api/documents` 본문 `{ blobUrl: string, fileName: string }` → 201 `{ documentId }`. 오류는 `{ error }` + 400·401·429·500.

### 1. `components/dashboard/upload-helpers.ts` (순수 함수. JSX 없음. 테스트 먼저)

```ts
export function buildUploadPath(userId: string, uploadId: string, ext: UploadExt): string   // `${userId}/${uploadId}.${ext}`
export function pickUploadError(used: number, limit: number): 'limitReached' | 'failed'      // used >= limit이면 limitReached
```

테스트 케이스: 경로 모양(`user_abc/<uuid>.jpg`), 슬래시를 더 붙이지 않는다 / `pickUploadError(50, 50)`·`(51, 50)` → `'limitReached'`, `(49, 50)`·`(0, 50)` → `'failed'`.

### 2. `components/dashboard/upload-panel.tsx`

배치(design.md 6.6): 패널 안에 `bg-sunken`·모서리 7px 영역. upload 아이콘(24px) + 안내 한 줄(`MESSAGES.ui`의 업로드 안내) + 오른쪽에 "올리기"(primary)와 "샘플로 해보기"(secondary). 영역 아래에 형식·크기 제한 한 줄(caption, `MESSAGES.ui`의 업로드 제한). primary 버튼은 이 구획에 하나다.

흐름(UC-05):
1. 영역을 누르면 파일 선택 창이 열린다. `<input type="file">`은 `accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"`, 파일 1개. `multiple`과 촬영 강제 속성을 붙이지 않는다(보관함 사진을 고를 수 있어야 한다, UC-07).
2. 고르면 영역 안에 파일명과 크기를 보여주고 `checkClientFile`을 돌린다. `'invalidType'` → `MESSAGES.upload.invalidType`, `'tooLarge'` → `MESSAGES.upload.tooLarge`를 한 줄로 보여주고 "올리기"는 비활성이다.
3. "올리기": `uploadId = crypto.randomUUID()`, `ext = extFromContentType(file.type)`, `pathname = buildUploadPath(userId, uploadId, ext)`. `userId`는 Clerk `useAuth()`에서 얻는다.
4. `upload(pathname, file, { access: 'public', handleUploadUrl: '/api/blob/upload', onUploadProgress })`. 진행률 바(강조색, `data-testid="upload-progress"`)를 `percentage`로 채운다. 이 앱에서 움직여도 되는 두 가지 중 하나다(design.md 9).
5. 끝나면 `POST /api/documents`에 `{ blobUrl: result.url, fileName: file.name }`.
6. 성공: 폼을 비우고, `MESSAGES.ui`의 업로드 뒤 안내("올렸습니다. 분석이 끝나면 …")를 `NoticeLine`으로 보여주고, `refresh()`를 부른다. 목록 맨 위에 "처리 중" 행이 나타나고 폴링이 시작된다.

"샘플로 해보기"(G-1): `fetch('/samples/receipt-sample.jpg')` → `new File([blob], 'receipt-sample.jpg', { type: 'image/jpeg' })` → 3~6번과 **같은 경로**로 올린다. 클릭 1회 = 사용 1회다.

핵심 규칙:
- **실패 공통 규칙(UC-05 E3).** 토큰 거절, Blob 업로드 끊김, `POST /api/documents` 실패 어느 것이든 똑같이 처리한다: `const fresh = await refresh()` → (`fresh`가 null이면, 즉 다시 읽기도 실패했으면 `MESSAGES.upload.failed`) → `pickUploadError(used, limit)` → `'limitReached'`면 `MESSAGES.api.limitReached`, 아니면 `MESSAGES.upload.failed`를 `data-testid="upload-error"` 줄로 보여준다. Blob 클라이언트가 던진 오류의 모양이나 문구를 읽어서 분기하지 않는다. 이유: 그 모양에 기대지 않기로 했다(ARCH 5.1).
- `limitReached`면 두 버튼 모두 비활성이고, 구획 안에 `data-testid="limit-notice"` 줄로 `MESSAGES.api.limitReached`를 보여준다. 버튼은 숨기지 않는다(design.md 6.1).
- 업로드 중에는 두 버튼 모두 비활성이다. 앞 문서가 "처리 중"인 것은 막는 이유가 아니다(다음 파일을 계속 올릴 수 있다, PRD F3).
- 형식·크기 검사는 `lib/upload/validate.ts`의 값을 쓴다. 10,000,000바이트를 다시 적지 않는다.
- 문장은 모두 `MESSAGES`에서 가져온다. 색은 design.md 토큰만 쓴다.
- `data-testid`: `upload-input`(file input), `upload-submit`, `upload-sample`, `upload-error`, `upload-progress`, `limit-notice`.

확인된 Vercel Blob 사용법(2026-09-18 조사, `@vercel/blob` 2.8.0). 설치된 패키지의 타입 정의와 다르면 타입 정의가 우선이다. 다르면 summary에 적어라.
- 브라우저: `import { upload } from '@vercel/blob/client'`, `upload(pathname, file, { access: 'public', handleUploadUrl, onUploadProgress })`. 진행 이벤트는 `{ loaded, total, percentage }`다. 반환값에 `url`이 있다.
- 서버가 토큰 발급을 거절하면 `upload()`가 reject된다(오류 모양은 문서화되어 있지 않다).
- `addRandomSuffix`는 기본 false라 브라우저가 만든 경로가 그대로 저장된다.

## Acceptance Criteria

```bash
set -eu
npm run lint
npm run build
npm run test
grep -q 'receipt-sample.jpg' components/dashboard/upload-panel.tsx
if grep -nE '(capture|multiple)(=|[ />])' components/dashboard/upload-panel.tsx; then echo "AC 실패: 있으면 안 되는 것이 발견됐다(위 출력)"; exit 1; fi
for id in upload-input upload-submit upload-sample upload-error upload-progress limit-notice; do
  grep -q "$id" components/dashboard/upload-panel.tsx || { echo "missing testid: $id"; exit 1; }
done
if grep -rnE "onDrop|onDragOver" components/dashboard/upload-panel.tsx; then echo "AC 실패: 있으면 안 되는 것이 발견됐다(위 출력)"; exit 1; fi
if grep -rnE "#[0-9a-fA-F]{3,8}\b" components/dashboard/upload-panel.tsx; then echo "AC 실패: 있으면 안 되는 것이 발견됐다(위 출력)"; exit 1; fi
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가?
   - ADR 기술 스택을 벗어나지 않았는가? (ADR-3: 브라우저 → Blob 직접 업로드)
   - AGENTS.md CRITICAL 규칙을 위반하지 않았는가? (파일 본문을 API 라우트로 보내지 않는다. 비밀값을 브라우저 코드에 넣지 않는다)
3. 결과에 따라 `phases/1-documents/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "..."`. summary에는 `UploadPanel`의 props, `upload-helpers.ts`의 export, 붙인 `data-testid` 목록, `MESSAGES.ui`에 추가한 문장이 있으면 그 키를 적는다.
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- 파일 본문을 우리 API 라우트로 보내지 마라. 이유: 서버 요청 본문 한도가 4.5MB다. 본문은 Blob으로 직접 간다.
- 드래그 앤 드롭, 여러 파일 동시 선택, 문서 종류 선택 UI, 직원명 입력 칸을 만들지 마라. 이유: PRD 10.1에서 제외했다.
- "샘플로 해보기" 연타 방지(디바운스, 쿨다운)를 넣지 마라. 이유: PRD 10.1. 1클릭 = 1회이고 헤더에 사용량이 보인다. 업로드 중 비활성만 둔다.
- 브라우저에서 HEIC 변환, 이미지 축소·회전을 하지 마라. 이유: ADR-10. 분석용 사본은 서버가 만든다.
- 촬영 강제 속성을 파일 입력에 붙이지 마라. 이유: 카메라를 강제하면 보관함 사진을 고를 수 없다(UC-07).
- 실패 시 자동 재시도를 하지 마라. 이유: 재시도마다 새 uploadId로 1회가 더 차감된다(UC-05 E5).
- "사진 크기를 줄여 주세요" 같은 추가 안내를 넣지 마라. 이유: UC-07 E1. 7.2 문구만 쓴다.
- Blob 클라이언트 오류의 문구·코드를 파싱해 분기하지 마라. 이유: 위 실패 공통 규칙.
- 업로드 직후 화면에서 가짜 "처리 중" 행을 만들어 넣지 마라. 이유: 목록은 `GET /api/dashboard` 하나로만 만든다.
- jsdom·testing-library를 설치하지 마라. `dark:` 접두어, 컴포넌트 안 색 값(#…), 이모지·유니코드 도형을 쓰지 마라.
- 기존 테스트를 깨뜨리지 마라
