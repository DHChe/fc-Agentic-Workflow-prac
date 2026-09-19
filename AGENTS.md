# 프로젝트: SlipScan

영수증 사진·카드 명세서 PDF를 올리면 Claude가 거래를 추출해 월 통계와 월간 보고서를 만드는 시연용 MVP. 설계 기준(SOT)은 `docs/PRD.md`(무엇을), `docs/ARCHITECTURE.md`(어떻게), `docs/USER_FLOWS.md`(흐름·문구)다. 문서가 어긋나면 PRD가 기준이다.

## 기술 스택
- Next.js 16 (App Router, 루트 `app/`, `src/` 없음. 라우트 가드는 `proxy.ts`), TypeScript strict
- Tailwind CSS + shadcn/ui (라이트 전용. 색·글꼴·부품은 `docs/design.md`, 금지 목록은 `docs/UI_GUIDE.md`, 배치 원칙과 화면 점검표는 `docs/UX_GUIDE.md`)
- Clerk (`@clerk/nextjs`, Restricted 모드, 이메일+비밀번호)
- Neon Postgres + Drizzle ORM (`@neondatabase/serverless` Pool + `drizzle-orm/neon-serverless`)
- Vercel Blob (브라우저 직접 업로드), Vercel Hobby 배포
- Claude API (`@anthropic-ai/sdk`), zod
- Vitest(단위), Cypress(화면 3개 시나리오)

## 아키텍처 규칙
- CRITICAL: 앱에서 Claude 호출과 모든 쓰기(DB·Blob)는 `app/api/**` 라우트 핸들러와 그것이 부르는 `lib/**` 서버 코드에서만 한다. `ANTHROPIC_API_KEY`를 비롯한 비밀값은 서버 전용이며 `NEXT_PUBLIC_` 접두사를 붙이지 않는다. `scripts/`의 시드와 테스트 준비 코드는 앱 밖의 운영 도구이며, 대상 user_id(`DEMO_USER_ID`·테스트 계정)를 명시적으로 받아 그 범위로만 쓴다.
- CRITICAL: 모든 DB 조회·수정·삭제는 user_id 조건을 건다. 라우트에서는 현재 Clerk userId다. 남의 id로 요청하면 404.
- CRITICAL: 파일 본문은 브라우저에서 Vercel Blob으로 직접 올린다. API 라우트는 파일 본문을 받지 않는다(서버 본문 한도 4.5MB). 업로드 경로와 `blobUrl`은 ARCHITECTURE 5.1의 정규식으로 검증한다.
- CRITICAL: Blob `list()`를 호출하지 않는다. 목록은 DB에 저장한 URL로만 만든다(월 2,000회 한도를 넘기면 30일 차단).
- CRITICAL: `docs/PRD.md` 10절(제외·감수 목록)에 있는 기능과 방어 장치는 만들지 않는다. 필요해 보이면 구현하지 말고 보고한다.
- 화면 문구·실패 사유·빈 상태 문장은 `lib/messages.ts` 한 곳에 둔다. 문장의 출처는 USER_FLOWS 7절이고 글자 그대로 옮긴다.
- 하루 사용량은 `usage_log` 표에서만 센다. 날짜 경계(Asia/Seoul) 계산은 `lib/stats/aggregate.ts` 한 곳에 두고 다른 코드는 가져다 쓴다.
- 디렉토리는 ARCHITECTURE 4절을 따른다. 외부 서비스용 인터페이스·DI 계층은 두지 않는다(ADR-22).

## 개발 프로세스
- CRITICAL: ARCHITECTURE 9.1에 적힌 핵심 로직(`lib/**`의 스키마·중복 감지·사용량·통계·검증·실패 매핑)은 테스트를 먼저 쓰고 통과시키는 구현을 쓴다(TDD). 화면 흐름은 Cypress 3개 시나리오와 USER_FLOWS 9.1 수동 리허설로 확인한다.
- 테스트는 실제 Claude·Blob·Clerk를 호출하지 않는다. `SLIPSCAN_TEST_MODE=1`의 fixture를 쓴다.
- 외부 SDK 사용법은 ARCHITECTURE 13절 목록을 공식 문서로 확인한 뒤 코드에 반영한다.
- 커밋 메시지는 conventional commits(feat:, fix:, docs:, refactor:, chore:). `main`에 직접 push하지 않는다.

## 명령어
npm run dev      # 개발 서버
npm run build    # 프로덕션 빌드
npm run lint     # ESLint 직접 실행 (Next 16에는 `next lint`가 없다)
npm run test     # Vitest 단일 실행 (watch 아님)

<!-- graft:start -->
## Graft — repo context graph

This repo is indexed in `graft/`: small linked markdown nodes that explain each
system and carry exact file:line spans, kept in sync with the code through git.

For ANY task here — understanding how something works, finding where code lives,
or scoping a change — get context from the graph before grepping or opening
source files. Re-ask freely (it's cheap) and reuse literal identifiers you
already have (symbol, error string, file name) as the query. New to this repo?
Run `graft map` first — a token-budgeted orientation (dir clusters, hubs,
hotspots), no LLM, no key.

- Run `graft ask "<your question>" --source` → ranked nodes with the relevant
  code spans inlined (each hit's ≤8-line crux by default; `--full` for whole
  definitions when the crux isn't enough). Match the tool to the task shape:
  for understanding or editing, the top node IS the answer — cite its
  `covers:` file:line spans and edit straight from `--source`. For
  exhaustive tasks ("every occurrence / every caller of this pattern"), ranked
  results are top-N, not complete — run `graft grep "<literal>"` instead
  (exhaustive over indexed files, grouped by enclosing symbol), falling back
  to raw `grep -rn` only for unindexed files.
- `graft skeleton <file>` → every definition's signature + span, ~10× cheaper
  than reading the file; use it to skim an API surface.
- `graft callers <symbol>` gives precomputed, exact edges — who calls this.
  Add `--direction out` for what it calls, or `--depth N` to walk
  transitively for the full blast radius. For structural questions, skip
  ranking and use this directly.
- Or browse: `graft/INDEX.md` lists every node; follow the links.
- Monorepos and folders of multiple repos rank fairly across sub-projects —
  hits carry `[scope/]` labels naming which one they're from. Narrow with
  `graft ask "<task>" --in <scope>/` once you know where you're working.

If a returned span is truncated ("+N more lines"), open the file at that exact
range before finalizing. Only open source files when a node genuinely lacks a
needed detail, and then at the exact file:line the node points to — never
re-read whole files.

After big code changes, refresh the graph with `graft build` (deterministic,
no API key, $0).
<!-- graft:end -->
