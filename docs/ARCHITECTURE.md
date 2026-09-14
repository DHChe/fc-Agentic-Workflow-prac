# 아키텍처

## 디렉토리 구조
```
src/
├── app/
│   ├── layout.tsx                     # html/body, ThemeProvider
│   ├── error.tsx                      # 한국어 에러 경계 + 다시 시도
│   ├── page.tsx                       # 랜딩. 로그인 상태면 /dashboard로 redirect
│   ├── globals.css                    # Tailwind v4 + 테마 토큰 (UI_GUIDE 참조)
│   ├── (auth)/layout.tsx              # 중앙 정렬 카드 레이아웃
│   ├── (auth)/login/page.tsx
│   ├── auth/callback/route.ts         # GET: OAuth code → 세션 교환 → /dashboard
│   ├── (app)/layout.tsx               # 세션 필수. 없으면 /login. 앱 헤더(로고·테마 토글·로그아웃)
│   ├── (app)/dashboard/page.tsx       # 요약 카드 + 업로드 + 목록
│   ├── (app)/dashboard/[id]/page.tsx  # 분석 상세
│   ├── (app)/dashboard/[id]/not-found.tsx
│   ├── api/analyses/route.ts          # POST: 분석 실행 (HTTP 메서드와 라우트 설정 상수만 export)
│   ├── api/analyses/[id]/route.ts     # DELETE: 분석 삭제, PATCH: 결과 수정
│   ├── api/analyses/handler.ts        # createPostHandler / createDeleteHandler / createPatchHandler (deps) — 순수 로직
│   └── api/analyses/deps.ts           # buildDeps(): 실제 Supabase·Claude 구현체 조립
├── proxy.ts                           # Next 16 proxy (구 middleware): 세션 갱신 + 라우트 가드
├── components/
│   ├── ui/                            # Button, Input, Card, Badge
│   ├── theme-provider.tsx, theme-toggle.tsx, app-header.tsx
│   ├── auth/                          # LoginForm, GoogleButton, SignOutButton
│   ├── dashboard/                     # SummaryCards, AnalysisList, EmptyState, AnalysisDetail, SummaryGrid, DeleteAnalysisButton, EditAnalysisForm, ExportCsvButton
│   ├── upload/                        # UploadForm
│   └── landing/                       # LandingHeader, FeatureList
├── test/setup.ts                      # Vitest 설정 (jest-dom, matchMedia)
├── types/
│   └── analysis.ts                    # AnalysisResult, Analysis, AnalysisSummary
├── lib/
│   ├── supabase/client.ts             # createBrowserSupabase()
│   ├── supabase/server.ts             # createServerSupabase(), getCurrentUser() (React cache)
│   ├── supabase/proxy.ts              # updateSession(request) — proxy.ts에서 사용
│   ├── supabase/guard.ts              # decideRedirect(pathname, hasUser) — 순수 함수
│   ├── schemas/analysis.ts            # zod: AnalysisResult, API 요청 본문, JSON Schema 변환
│   ├── schemas/auth.ts                # zod: 이메일·비밀번호
│   ├── upload/validate-file.ts        # 파일 형식·크기 검증 (순수 함수)
│   ├── csv.ts                         # analysesToCsv(items) (순수 함수, UTF-8 BOM)
│   └── utils/                         # format.ts(금액·날짜), summary.ts(monthRange, computeSummary)
└── services/
    ├── analyzer/types.ts              # DocumentAnalyzer 인터페이스, AnalyzerError
    ├── analyzer/prompt.ts             # 시스템 프롬프트 (한국어)
    ├── analyzer/claude-analyzer.ts    # Claude 구현
    ├── analyzer/index.ts              # createDocumentAnalyzer() 팩토리 (env 읽음, server-only)
    ├── repository/types.ts            # AnalysisRepository 인터페이스
    ├── repository/supabase-analysis-repository.ts
    ├── repository/index.ts            # createAnalysisRepository(supabase) 팩토리
    ├── storage/types.ts               # ReceiptStorage 인터페이스 (서버용)
    ├── storage/supabase-receipt-storage.ts
    ├── storage/index.ts               # createReceiptStorage(supabase) 팩토리
    └── storage/browser-upload.ts      # uploadReceipt(supabase, userId, file) — 브라우저용
supabase/
└── migrations/0001_init.sql           # analyses 테이블, RLS, receipts 버킷, 스토리지 정책
vitest.config.ts
```

## 핵심 인터페이스
```ts
// src/services/analyzer/types.ts
export interface AnalyzeInput { data: Uint8Array; mimeType: string; fileName: string }
export interface DocumentAnalyzer { analyze(input: AnalyzeInput): Promise<AnalysisResult> }
export class AnalyzerError extends Error {
  constructor(message: string, public readonly code: 'unsupported_file' | 'invalid_output' | 'rejected_input' | 'provider_error')
  // rejected_input: 제공자가 입력 자체를 거부(암호 PDF, 페이지·해상도 초과). 재시도 무의미 → 422
}

// src/services/repository/types.ts
export interface CreateAnalysisInput {
  userId: string; fileName: string; mimeType: string; storagePath: string; result: AnalysisResult
}
export interface AnalysisRepository {
  create(input: CreateAnalysisInput): Promise<Analysis>
  listByUser(userId: string): Promise<AnalysisSummary[]>        // 최신순, 최근 100건
  getById(id: string, userId: string): Promise<Analysis | null>
  delete(id: string, userId: string): Promise<Analysis | null>   // 지운 행을 돌려준다 (파일 정리용). 없으면 null
  update(id: string, userId: string, patch: Partial<EditableFields>): Promise<Analysis | null>  // result 병합 + edited_at 기록
}

// src/services/storage/types.ts
export interface ReceiptStorage {
  download(storagePath: string): Promise<Uint8Array>
  remove(storagePath: string): Promise<void>
  createSignedUrl(storagePath: string, expiresInSeconds: number): Promise<string>
}
```
구현체는 생성자에서 외부 클라이언트(SupabaseClient, Anthropic)를 주입받는다. 페이지·API는 `services/*/index.ts`의 팩토리(`createAnalysisRepository`, `createReceiptStorage`, `createDocumentAnalyzer`)만 import 하고 구현 클래스를 직접 import 하지 않는다. 테스트는 mock을 주입한다. `eslint.config.mjs`의 `no-restricted-imports`가 이 경계를 강제한다.

## 패턴
- Server Components 기본. 폼·업로드·테마 토글처럼 인터랙션이 필요한 곳만 `'use client'`.
- Next 16 규칙: `cookies()`, `params`, `searchParams`는 Promise다. 반드시 `await`.
- 읽기: Server Component → `createServerSupabase()` → `createAnalysisRepository(supabase)` → 조회 → 렌더. 자기 자신의 API를 fetch 하지 않는다. 대시보드 요약(건수·이번 달 합계)은 조회한 목록에서 `computeSummary()`로 계산한다.
- 쓰기: Client Component → `fetch('/api/analyses', ...)` → 라우트 핸들러가 services를 조합. 결과 수정은 `PATCH /api/analyses/{id}`에 변경된 필드만 보낸다.
- API 라우트 구조: `route.ts`는 HTTP 메서드와 라우트 설정 상수(`runtime`, `maxDuration`)만 export 한다. 로직은 `handler.ts`의 팩토리 함수가 `deps` 객체를 받아 만든다. 테스트는 가짜 `deps`로 핸들러를 직접 호출한다.
- 인증: 공개 가입 없음. 계정은 운영자가 Supabase 대시보드에서 발급한다. 브라우저 Supabase 클라이언트로 `signInWithPassword` / `signInWithOAuth({ provider: 'google' })` / `signOut`. `@supabase/ssr`가 쿠키를 기록하므로 서버가 세션을 읽을 수 있다. 성공 후 `router.push()` + `router.refresh()`. Google은 `redirectTo: \`${location.origin}/auth/callback\``로 돌아오고, `auth/callback/route.ts`가 `exchangeCodeForSession(code)` 후 `/dashboard`로 redirect 한다.
- 라우트 가드: `src/proxy.ts`가 페이지 요청마다 세션을 갱신하고 `decideRedirect()` 결과대로 redirect 한다. 비로그인 `/dashboard/**` → `/login`, 로그인 상태의 `/login` → `/dashboard`. `/auth/callback`은 redirect 하지 않고, `/api/**`는 matcher에서 제외한다 (핸들러가 직접 세션을 확인). Server Component는 `getCurrentUser()`(React `cache`)로 요청당 1회만 사용자를 조회한다.
- 검증: 외부 경계(LLM 출력, API 요청 본문, 폼 입력, 업로드 파일)는 zod 또는 순수 검증 함수로 파싱한다. 내부 함수 간에는 타입을 신뢰한다. DB의 `result` jsonb는 이 앱의 서버만 쓰는 컬럼이므로 읽을 때 `AnalysisResult`로 캐스팅한다.
- 응답 헤더(`next.config.ts`): `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`. 세션 쿠키는 `sameSite: lax` + `secure`(프로덕션), HttpOnly는 브라우저 클라이언트가 읽어야 해서 끈다.
- API 방어: `storagePath`는 허용 목록 정규식(`^{userId}/{uuid}.{ext}$`)으로만 통과시킨다. 그 외 남용 방어(요청 출처 검사, 파일 내용 검사, 사용량 한도)는 MVP 제외다. 이유: 공개 가입이 없어 사용자가 전부 운영자 발급 계정이다 (ADR-002).
- 에러: API 라우트는 `{ error: string }`(고정된 한국어 메시지)와 HTTP 상태로 응답한다. 400 잘못된 요청, 401 미인증, 403 남의 경로, 404 없음("분석을 찾을 수 없습니다. 이미 삭제되었을 수 있습니다."), 413 크기 초과, 422 LLM 출력 파싱 실패 또는 제공자의 입력 거부(재시도 무의미), 502 LLM 일시 장애, 500 그 외. 예외 메시지는 서버 로그에만 남기고 응답에는 넣지 않는다. 클라이언트는 `error`를 그대로 표시한다.

## 데이터 흐름
업로드·분석:
```
사용자 파일 선택
→ UploadForm(client): validateReceiptFile() 형식·크기 검증
→ uploadReceipt(): supabase.storage.from('receipts').upload(`${userId}/${uuid}.${ext}`, file)
→ POST /api/analyses  { storagePath, fileName, mimeType }
→ 핸들러: 세션 확인 → storagePath 허용 목록 정규식 검사
→ storage.download(storagePath) → 크기 재확인 → analyzer.analyze()
→ repository.create()
→ 200 { id }   (download 이후 실패 시 storage.remove 후 에러 응답)
→ router.push(`/dashboard/${id}`)
```
조회: Server Component → `repository.listByUser()` / `getById()` → 렌더. 원본 미리보기는 서버에서 `storage.createSignedUrl(path, 300)`.
삭제: `DELETE /api/analyses/{id}` → `repository.delete()`(행을 지우며 반환, 없으면 404) → 반환된 `storagePath`로 `storage.remove()` → 클라이언트가 `/dashboard`로 이동.
수정: 상세의 편집 폼 → `PATCH /api/analyses/{id}` `{ merchant?, date?, totalAmount?, vatAmount?, category? }` → zod 검증 → `repository.update()` → 200 → `router.refresh()`.
내보내기: 대시보드 Server Component가 목록을 `ExportCsvButton`에 props로 넘김 → 클라이언트에서 `analysesToCsv()` → Blob 다운로드. API 없음.

## 상태 관리
- 서버 상태: Server Components가 매 요청 조회. 변경 후 `router.refresh()`.
- 클라이언트 상태: `useState`로 업로드 단계(idle / uploading / analyzing / error)와 폼 입력만 관리.
- 전역 상태 라이브러리 없음.

## 데이터 모델
```sql
public.analyses (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  file_name    text not null,
  mime_type    text not null,
  storage_path text not null,
  result       jsonb not null,          -- AnalysisResult (사용자 수정 반영)
  created_at   timestamptz not null default now(),
  edited_at    timestamptz              -- 사용자 수정 시각. null이면 미수정
  -- check: storage_path like user_id || '/%'  (본인 폴더만), mime_type in (허용 4종)
  -- unique: storage_path
)
-- RLS: select / insert / update / delete 모두 auth.uid() = user_id (authenticated 역할)
-- index: (user_id, created_at desc)

storage.buckets 'receipts': public=false, file_size_limit=20MB,
  allowed_mime_types = pdf/jpeg/png/webp
-- storage.objects 정책: (storage.foldername(name))[1] = auth.uid()::text 인 경우만 select/insert/delete
```
전체 SQL은 `supabase/migrations/0001_init.sql`. 실행은 Supabase 대시보드 SQL Editor에서 수동으로 한다.

## 환경 변수
| 이름 | 노출 | 용도 |
|------|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | 클라이언트 OK | Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 클라이언트 OK | anon key 또는 publishable key (`sb_publishable_…`) |
| `ANTHROPIC_API_KEY` | 서버 전용 | Claude API |
| `ANTHROPIC_MODEL` | 서버 전용, 선택 | 기본 `claude-opus-5` |

같은 변수(선택 포함)를 Vercel 프로젝트에도 등록한다 (`vercel env add <이름> production preview` 또는 대시보드). 배포 흐름은 ADR-009 참조.

Google OAuth의 Client ID/Secret은 Supabase 대시보드(Authentication → Providers → Google)에만 등록한다. 앱 환경변수에는 넣지 않는다.
