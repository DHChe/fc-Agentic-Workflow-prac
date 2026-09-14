# Step 11: deploy-docs

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `CLAUDE.md`, `docs/ARCHITECTURE.md` ("환경 변수"), `docs/ADR.md` (ADR-002, ADR-005, ADR-009)
- `.env.example`, `supabase/migrations/0001_init.sql`, `package.json`
- `src/app/api/analyses/route.ts` (`maxDuration`), `src/app/auth/callback/route.ts`
- `phases/0-mvp/index.json` — 이전 step summary들

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 작업

이 step은 문서와 배포 준비만 한다. 기능 코드를 바꾸지 않는다.

### 1. `README.md` (한국어) — 아래 절을 모두 포함

1. **소개**: 두 문장. 무엇을 하는지, 스택 한 줄.
2. **로컬 실행**: `npm install` → `.env.example`을 `.env.local`로 복사해 값 채우기 → `npm run dev`. 검증 명령 `npm run lint && npm run build && npm run test`.
3. **Supabase 설정 체크리스트** (순서대로, 체크박스):
   - 프로젝트 생성, Project Settings → API에서 URL과 anon/publishable key 복사
   - Authentication → Sign In / Providers: "Allow new users to sign up" 끄기 (공개 가입 차단. 이유: 계정 선점 후 Google 연결로 탈취되는 경로를 막는다)
   - 계정 발급: Authentication → Users → "Add user" → 이메일·비밀번호 입력, "Auto Confirm User" 체크. 비밀번호는 안전한 경로로 전달. 비밀번호 변경·재설정도 같은 화면에서 운영자가 한다
   - SQL Editor에서 `supabase/migrations/0001_init.sql` 전체 실행
   - Authentication → Providers → Google 켜기. Google Cloud Console → APIs & Services → Credentials → OAuth client ID(웹 애플리케이션). 승인된 리디렉션 URI에 `https://<project-ref>.supabase.co/auth/v1/callback`. Client ID/Secret을 Supabase에 입력
   - Authentication → URL Configuration: Site URL을 배포 도메인으로, Redirect URLs에 `http://localhost:3000/auth/callback`과 `https://<vercel-domain>/auth/callback` 추가
   - OAuth 동의 화면이 "테스트" 상태면 시연 계정 이메일을 테스트 사용자로 추가하거나 "프로덕션"으로 게시
4. **Vercel 배포** (Vercel CLI, ADR-009): `npm i -g vercel` → `vercel login`(브라우저 로그인) → 프로젝트 루트에서 `vercel link`(새 프로젝트 생성 또는 기존 선택) → `vercel env add NEXT_PUBLIC_SUPABASE_URL production preview` 식으로 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `ANTHROPIC_API_KEY` (선택 `ANTHROPIC_MODEL`) 등록. 이후 `python3 scripts/execute.py 0-mvp`가 step 완료마다 preview, phase 완료 시 production을 자동 배포한다. 수동 배포는 `vercel deploy --prod`. 배포 후 위 Redirect URLs에 production 도메인 반영. 분석 API는 `maxDuration = 60`이며 모든 플랜에서 허용된다. Fluid compute가 켜진 프로젝트는 Hobby도 300초까지 가능하므로, 큰 PDF에서 시간 초과가 잦으면 `src/app/api/analyses/route.ts`의 값을 120~180으로 올릴 수 있다는 안내.
5. **시연 준비**: 위 계정 발급 절차로 시연 계정을 만든다. 더미 영수증 2~3개와 카드명세서 PDF 1개를 미리 업로드해 대시보드를 채운다. 실제 직원 데이터는 쓰지 않는다. iPhone 사진은 HEIC이므로 JPEG로 변환.
6. **트러블슈팅** 표: "Invalid login credentials" / Google 로그인 후 `/login?error=oauth`(미발급 이메일) / 413 / 422 "이 파일은 분석할 수 없습니다"(암호 PDF, 100페이지 초과, 8000px 초과 — 재시도해도 같다) / 502(일시 장애) / 60초 초과 / `"google":false` / `"disable_signup":false` / 404 on `/rest/v1/analyses` 각각의 원인과 조치.
7. **기능 요약**: 업로드·분석, 대시보드, 결과 수정(PATCH), CSV 내보내기(분석 1건 = 1행, UTF-8 BOM) 한 줄씩.
8. **데이터 취급**: 원본 파일은 비공개 버킷에, 추출 결과는 Postgres jsonb에 저장하고 본인 계정만 읽을 수 있다(RLS). 원본 바이트는 분석을 위해 Anthropic API로 전송된다. 사용자가 삭제할 때까지 보관한다(자동 삭제 없음).
9. **알려진 제한**: 업로드 후 세션 만료(401)·시간 초과(504)·네트워크 끊김으로 분석이 끝나지 않으면 Storage에 행 없는 파일이 남을 수 있다. MVP에서는 자동 정리하지 않으며, 필요하면 Supabase 대시보드 Storage → `receipts/<user_id>/`에서 수동 삭제한다. 대시보드 목록과 요약 카드는 최근 100건 기준이다.
10. **구조**: `docs/` 문서 링크와 `phases/` 하네스 한 줄 설명.

### 2. 배포 설정 점검

- `package.json`에 `"engines": { "node": ">=22.12" }` 추가. 이유: Vitest 5는 Node 22.12 이상을 요구한다. Vercel 프로젝트 설정의 Node.js 버전도 22.x인지 README에 적는다.
- `.env.example`이 ARCHITECTURE.md 환경 변수 표와 일치하는지 확인하고 다르면 맞춘다.
- `.gitignore`에 `.env*`, `!.env.example`, `.vercel`이 있는지 확인.
- `next.config.ts`에 불필요한 설정이 없는지 확인. Supabase 서명 URL 이미지를 `<img>`로 쓰므로 `images.remotePatterns` 설정은 필요 없다.

### 3. 최종 확인

```bash
npm run build
git status --short   # 추적되지 않는 산출물(.env.local 등)이 없어야 한다
```

## Acceptance Criteria

```bash
npm run lint
npm run build
npm run test
test -f README.md && grep -q "0001_init.sql" README.md && grep -q "auth/callback" README.md
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - README의 환경 변수 이름이 ARCHITECTURE.md와 정확히 일치하는가?
   - README의 Supabase 절차가 ADR-002·ADR-003과 모순되지 않는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가? (README에 실제 키 값이 없다)
3. 결과에 따라 `phases/0-mvp/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- `vercel` 명령(login, link, deploy)을 직접 실행하지 마라. 이유: 로그인·link는 사용자 계정 인증이 필요하고, 배포는 `scripts/execute.py`가 step 완료 후 자동으로 한다 (ADR-009).
- 기능 코드(`src/**`)를 수정하지 마라. 이유: 이 step은 문서·설정 전용이다. 버그를 발견하면 README 트러블슈팅이 아니라 `summary`에 기록하라.
- README에 실제 API 키, 프로젝트 URL, 시연 계정 비밀번호를 적지 마라. 이유: 저장소는 공개될 수 있다.
- 기존 테스트를 깨뜨리지 마라.
