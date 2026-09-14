# 프로젝트: SlipScan

중소기업용 영수증·카드명세서 분석 웹앱. 사용자가 PDF/이미지를 업로드하면 Claude API로 내역을 추출해 대시보드에 보여주고 보관한다.

## 기술 스택
- Next.js 16 (App Router, `src/` 디렉토리, Turbopack), React 19
- TypeScript strict mode
- Tailwind CSS v4, next-themes (라이트/다크 토글), lucide-react (아이콘)
- Supabase — Auth(이메일+비밀번호, Google OAuth), Postgres, Storage. 클라이언트는 `@supabase/ssr`
- Claude API — `@anthropic-ai/sdk`
- zod v4 (LLM 출력·API 요청 검증)
- Vitest + React Testing Library

## 아키텍처 규칙
- CRITICAL: `ANTHROPIC_API_KEY`와 Claude 호출은 서버 코드(`src/app/api/**`, `src/services/**`)에서만 사용한다. `NEXT_PUBLIC_` 접두사를 붙이거나 클라이언트 컴포넌트에서 import 하지 말 것.
- CRITICAL: Supabase 접근은 항상 사용자 세션 기반 클라이언트(anon key + 쿠키)로 하고 데이터 격리는 RLS에 맡긴다. `service_role` 키는 어디에도 사용하지 않는다.
- CRITICAL: 파일 바이너리는 클라이언트에서 Supabase Storage로 직접 업로드한다. API 라우트에 파일 본문을 보내지 않는다. 이유: Vercel 서버리스 요청 본문 4.5MB 제한.
- CRITICAL: 페이지·컴포넌트·API 라우트는 `DocumentAnalyzer`, `AnalysisRepository` 인터페이스(`src/services/**`)에만 의존한다. `@anthropic-ai/sdk`, `@supabase/supabase-js`를 `src/services/`, `src/lib/supabase/` 밖에서 import 하지 않는다.
- 데이터 읽기는 Server Component에서 repository를 직접 호출한다. 쓰기(분석 실행·삭제)는 `src/app/api/**` 라우트 핸들러를 통한다.
- 컴포넌트는 `src/components/`, 도메인 타입은 `src/types/`, 외부 서비스 래퍼는 `src/services/`, 유틸·클라이언트 팩토리는 `src/lib/`.
- UI는 `docs/UI_GUIDE.md`의 토큰과 규칙을 따른다. 컴포넌트에서 `dark:` 변형을 직접 쓰지 않는다.

## 개발 프로세스
- CRITICAL: 새 기능 구현 시 반드시 테스트를 먼저 작성하고, 테스트가 통과하는 구현을 작성할 것 (TDD)
- 외부 SDK(Supabase, Anthropic)는 테스트에서 mock 한다. 실제 네트워크 호출을 하는 테스트를 만들지 않는다.
- 커밋 메시지는 conventional commits 형식을 따를 것 (feat:, fix:, docs:, refactor:, chore:)

## 명령어
npm run dev      # 개발 서버
npm run build    # 프로덕션 빌드
npm run lint     # ESLint
npm run test     # Vitest (단일 실행, watch 아님)
