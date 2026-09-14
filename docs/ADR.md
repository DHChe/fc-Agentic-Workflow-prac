# Architecture Decision Records

## 철학
MVP 속도 최우선. 관리형 서비스(Supabase, Vercel, Claude API)에 기대고 직접 운영하는 인프라는 두지 않는다. 단, 외부 서비스는 인터페이스 한 겹 뒤에 두어 교체 비용을 낮춘다. 작동하는 최소 구현을 고르고, "나중을 위한" 추상화는 그 한 겹까지만 허용한다.

---

### ADR-001: Next.js 16 App Router + TypeScript strict + Tailwind CSS v4
**결정**: `create-next-app` 최신 안정판(Next 16, React 19)을 `src/` 디렉토리, App Router, Turbopack으로 사용한다. 스타일은 Tailwind v4.
**이유**: Vercel 배포와 가장 마찰이 적다. Server Components로 데이터 조회 코드가 단순해진다. Tailwind v4는 CSS 변수 기반 토큰이 기본이라 라이트/다크 토큰 관리가 쉽다.
**트레이드오프**: Next 16은 `middleware.ts`가 `proxy.ts`로 바뀌고 `next lint`가 제거되는 등 과거 예제와 차이가 있다. 구현 시 공식 문서 기준으로 확인한다.

### ADR-002: 인증은 Supabase Auth — 공개 가입 없음, 운영자 발급 계정으로 이메일+비밀번호와 Google 로그인
**결정**: Supabase 대시보드에서 "Allow new users to sign up"을 끈다. 계정은 운영자가 Authentication → Users → Add user(Auto Confirm)로 발급해 전달한다. 앱에는 로그인·로그아웃만 있고 회원가입 페이지가 없다. 로그인은 이메일+비밀번호 또는 Google OAuth(PKCE, `/auth/callback`)이며, Google은 발급된 계정과 같은 이메일일 때만 성공한다. 인증 호출은 모두 브라우저 Supabase 클라이언트에서 한다 (서버 액션 없음).
**이유**: MVP는 단일 기업 시연용이라 셀프 가입이 필요 없다. 공개 가입을 열어두면 (a) 남의 이메일로 선점한 계정에 피해자의 Google 로그인이 자동 연결되는 계정 탈취, (b) 임의 사용자의 유료 분석 호출로 비용 노출이 생긴다. 가입을 닫으면 둘 다 근본적으로 사라지고, 이메일 확인 설정도 무관해진다.
**트레이드오프**: 셀프 온보딩이 없다. 비밀번호 전달과 재설정을 운영자가 대시보드에서 처리해야 한다. 앱 내 초대·역할 관리는 다음 phase에서 조직 모델과 함께 설계한다.
### ADR-003: 저장은 Supabase Postgres + Storage, 격리는 RLS
**결정**: 분석 결과는 `analyses` 테이블(`result jsonb`)에, 원본 파일은 비공개 버킷 `receipts`의 `{user_id}/{uuid}.{ext}` 경로에 저장한다. 테이블 RLS와 Storage 정책으로 본인 데이터만 접근 가능하게 한다. `service_role` 키는 쓰지 않는다.
**이유**: 시연 시 기기와 무관하게 같은 데이터가 보인다. Supabase를 이미 쓰므로 추가 비용이 테이블 1개와 버킷 1개뿐이다. 브라우저 저장소(IndexedDB)는 기기에 묶여 시연에 부적합하다.
**트레이드오프**: 결과가 jsonb라 스키마가 바뀌면 옛 행과 새 행이 섞인다. 이를 위해 `AnalysisResult`의 선택 필드는 모두 nullable로 두고, 파싱은 관대하게 한다.

### ADR-004: 파일은 클라이언트에서 Storage로 직접 업로드
**결정**: 브라우저가 Supabase Storage에 직접 업로드하고, API 라우트에는 `storagePath`만 보낸다. 서버는 Storage에서 파일을 내려받아 분석한다.
**이유**: Vercel 서버리스 함수의 요청 본문 한도가 4.5MB라 PDF·사진을 API로 보내면 실패한다. Storage 정책이 사용자 폴더를 강제하므로 보안상 손실이 없다.
**트레이드오프**: 업로드 성공 후 분석이 실패하면 고아 파일이 남는다. API 라우트가 실패 경로에서 `storage.remove`로 정리한다.

### ADR-005: 분석은 Claude API, 구조화 출력은 tool use 강제, `DocumentAnalyzer` 인터페이스
**결정**: `@anthropic-ai/sdk`로 호출한다. PDF는 `document` 블록(base64), 이미지는 `image` 블록으로 보낸다. 출력은 단일 도구 `record_analysis`(input_schema = zod 스키마를 `z.toJSONSchema()`로 변환)와 `tool_choice: { type: 'tool' }`로 강제하고, 받은 input을 zod로 다시 파싱한다. 모델은 `ANTHROPIC_MODEL` 환경변수, 기본 `claude-opus-5`. 호출 파라미터는 `max_tokens: 16000`, `output_config: { effort: 'low' }`이고 `thinking`은 기본값(adaptive)을 유지한다. 이유: Opus 5는 생각 토큰이 `max_tokens`에 포함되므로 한도를 넉넉히 두고, 노력 수준을 낮춰 45초 안에 끝낸다. thinking을 끄면 도구 호출을 텍스트로 쓰는 오동작 사례가 있어 끄지 않는다. 호출은 `DocumentAnalyzer` 인터페이스 뒤에 둔다.
**이유**: PDF를 변환 없이 네이티브로 입력할 수 있다. tool use 강제는 "JSON만 출력해"보다 형식 오류가 훨씬 적다. 인터페이스 덕에 OpenAI 구현체를 추가해도 화면·API는 바뀌지 않는다.
**트레이드오프**: 요청 안에서 동기 호출하므로 라우트에 `maxDuration = 60`이 필요하고 큰 PDF는 느리다. 호출마다 비용이 발생하며, Opus 5는 Sonnet 5 대비 입력·출력 단가가 2.5배다 (2026-09-15, 추출 정확도를 우선해 기본 모델을 Sonnet 5에서 Opus 5로 변경).

### ADR-006: Repository 패턴 + 생성자 주입
**결정**: `AnalysisRepository` 인터페이스와 `SupabaseAnalysisRepository` 구현을 둔다. 구현체는 생성자로 SupabaseClient를 받는다. 화면과 API는 인터페이스 타입과 `createAnalysisRepository()` 팩토리만 보고, 구현 클래스는 import 하지 않는다. ESLint `no-restricted-imports`로 강제한다.
**이유**: 실무 전환 시 자체 Postgres 등으로 옮겨도 구현체 하나만 추가하면 된다. 테스트에서 mock 주입이 쉽다.
**트레이드오프**: 파일이 몇 개 늘어난다. RLS가 있어 `userId` 인자가 중복이지만, DB 독립성을 위해 인터페이스에 유지한다.

### ADR-007: 테스트는 Vitest + React Testing Library, 외부 SDK는 mock, e2e 없음
**결정**: 단위·컴포넌트 테스트만 둔다. Supabase·Anthropic 클라이언트는 mock을 주입한다. 브라우저 e2e는 MVP에서 제외한다.
**이유**: `.claude/settings.json`의 Stop 훅이 매번 `lint && build && test`를 실행하므로 빠르고 결정적인 테스트여야 한다.
**트레이드오프**: 실제 Supabase·Claude 연동은 `npm run dev`로 수동 검증한다.

### ADR-008: 테마는 next-themes + Tailwind `dark` 커스텀 variant, 토큰은 CSS 변수
**결정**: `next-themes`의 `attribute="class"`, 기본값 `system`. `globals.css`에서 `:root`와 `.dark`에 색 토큰을 정의하고 `@theme inline`으로 Tailwind 유틸리티(`bg-page`, `text-fg` 등)에 연결한다. 컴포넌트는 토큰 클래스만 쓴다.
**이유**: 컴포넌트마다 `dark:`를 붙이면 누락이 생긴다. 토큰만 바꾸면 양쪽 테마가 동시에 맞는다.
**트레이드오프**: `<html>`에 `suppressHydrationWarning`이 필요하다. 토큰 이름을 새로 익혀야 한다.

### ADR-009: 배포는 Vercel CLI로 로컬에서 — step마다 preview, phase 완료 시 production
**결정**: GitHub 연동 대신 Vercel CLI를 쓴다. 사용자가 한 번 `npm i -g vercel` → `vercel login` → 루트에서 `vercel link` → `vercel env add`로 환경 변수를 등록해 두면, `scripts/execute.py`가 step이 완료될 때마다 `vercel deploy --yes`(preview, URL을 `index.json`의 `preview_url`에 기록)를, phase가 끝나면 `vercel deploy --prod --yes`(production)를 실행한다. `.vercel/`은 커밋하지 않는다. `.vercel/project.json`이나 `vercel` CLI가 없으면 배포만 건너뛰고 나머지는 그대로 진행한다.
**이유**: 저장소를 push하지 않아도 로컬 상태를 바로 배포해 첫 step부터 실제 Vercel 환경에서 확인할 수 있다. 시연 주소(production)에는 완성본만 올라간다.
**트레이드오프**: 배포마다 1~3분이 더 걸리고, Vercel 로그인·프로젝트 연결이 자동 배포의 사전 조건이 된다. preview 배포 실패는 경고로만 남기므로 Vercel 빌드 오류를 놓칠 수 있다. production 배포 실패는 중단한다.
