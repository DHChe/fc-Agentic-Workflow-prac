# Step 10: landing-page

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `docs/UI_GUIDE.md` — 디자인 원칙, 안티패턴 표, 타이포그래피(랜딩 헤드라인), 아이콘
- `docs/PRD.md` — 목표, 핵심 기능 1
- `src/app/page.tsx` (step 0의 임시 페이지), `src/app/layout.tsx`
- `src/lib/supabase/server.ts`, `src/components/ui/*`, `src/components/theme-toggle.tsx`

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 작업

### 1. 컴포넌트 (`src/components/landing/`, Server Component 호환)

```ts
export function LandingHeader(): React.JSX.Element
// h-14 border-b border-line. 좌측 "SlipScan". 우측: ThemeToggle, "로그인"(primary 링크 /login)

export const FEATURES: ReadonlyArray<{ title: string; description: string; icon: 'upload' | 'scan' | 'archive' }>
export function FeatureList(): React.JSX.Element
// 3개: "업로드" (PDF나 사진을 올리면 끝), "자동 추출" (가맹점·일자·금액·부가세·품목을 표로), "보관" (계정에 저장, 어디서든 조회)
// 각 항목: lucide 아이콘(Upload / ScanText / Archive, strokeWidth 1.5, 배경 박스 없음) + 제목 + 설명. 좌측 정렬, 세로 나열 또는 3열 그리드
```

### 2. 페이지 `src/app/page.tsx` (Server Component)

- `getCurrentUser()`(step 2) → `user`가 있으면 `redirect('/dashboard')`.
- 구조: `LandingHeader` → `main.mx-auto.max-w-5xl.px-6` → 히어로(헤드라인 "영수증 사진 한 장이면 정리는 끝납니다.", 부제 "PDF나 사진을 올리면 가맹점·일자·금액·부가세를 자동으로 추출해 표로 보여줍니다. 중소기업 경비 담당자를 위한 도구입니다.", primary 버튼 "로그인하고 시작하기" → `/login`, 그 아래 `text-xs text-fg-3`로 "계정은 관리자가 발급합니다.") → `FeatureList` → 푸터(`text-xs text-fg-4`, "© 2026 SlipScan").
- 히어로는 좌측 정렬. `max-w-2xl`로 줄 길이를 제한한다.
- `export const dynamic = 'force-dynamic'` (세션 확인 때문).

### 3. 테스트 (먼저 작성)

- `src/components/landing/feature-list.test.tsx`: 항목 3개의 제목이 렌더된다.
- `src/components/landing/landing-header.test.tsx`: `/login` 링크가 있고 `/signup` 링크는 없다. `next-themes`는 `vi.mock`.

## Acceptance Criteria

```bash
npm run lint
npm run build
npm run test
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가? (`components/landing`)
   - ADR 기술 스택을 벗어나지 않았는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
   - UI_GUIDE 안티패턴이 하나도 없는가? `grep -rn "backdrop-blur\|bg-gradient\|blur-3xl\|rounded-2xl\|shadow-.*glow\|Powered by" src/` 결과가 비어야 한다.
3. 결과에 따라 `phases/0-mvp/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- 그라데이션 텍스트, backdrop blur, 글로우, 배경 orb, "AI 기반" 배지를 넣지 마라. 이유: UI_GUIDE 안티패턴.
- 스크린샷·일러스트 이미지 파일을 추가하지 마라. 이유: 자산이 없고 텍스트 중심이 원칙이다.
- 가격표, FAQ, 고객 로고 섹션을 만들지 마라. 이유: PRD 범위 밖.
- 대시보드·인증 코드를 수정하지 마라. 이유: 이 step은 `/`와 `components/landing`만 다룬다.
- 기존 테스트를 깨뜨리지 마라.
