# plan.md 독립 리뷰

- 리뷰어: grok
- 날짜: 2026-09-14
- 대상: `plan.md` (SlipScan MVP 구현 계획, 리뷰용 정리본)

시작 시 `git status --short`: `develop...origin/develop`, 수정 `.gitignore` `CLAUDE.md` `docs/ADR.md` `docs/ARCHITECTURE.md` `docs/PRD.md` `docs/UI_GUIDE.md`, 미추적 `docs/USER_FLOWS.md` `phases/` `plan.md` `supabase/`.

## 요약

blocker 3, major 7, minor 5. 계획의 레이어 분할(S0 스캐폴드 → 타입 → 인프라 → 인증/분석기 → API → 화면)과 Next 16·Vercel 4.5MB·Storage 직접 업로드·tool use 강제 같은 핵심 가정은 원본·공식 문서와 대체로 맞다. 그대로 실행하면 가장 위험한 지점은 S0의 핀되지 않은 `vitest`(2026-09-03 이후 latest는 5.0, Node 22.12 필요)와 S4의 `claude-sonnet-5` 기본값(adaptive thinking ON, effort `high`)에 `max_tokens: 4096`·SDK timeout 45초를 그대로 쓰는 조합이다. 전자는 AC(`npm run test`)가 환경에 따라 즉시 `error`로 끝나고, 후자는 step 테스트(mock)는 통과하지만 시연의 핵심 경로(업로드→표)가 타임아웃·`max_tokens` 절단·422로 무너진다. S1 JSON Schema `required` 테스트는 같은 step 안의 `.catch()` 설명과 모순이라 3회 재시도 후 `error` 가능성이 있다. §11 제외 항목의 근거는 시연·운영자 발급 계정 전제에서 타당하다. Google OAuth를 S3 `blocked` 게이트로 둔 것은 시연에 안 쓰면서 파이프라인 전체를 멈추므로 과잉이다.

## 지적 사항

[blocker] S0 — `vitest`를 버전 핀 없이 설치하면 Vitest 5가 내려오고, Node 22.12 미만에서 S0 AC가 실패한다
근거: Vitest 5.0(2026-09-03) 마이그레이션 가이드와 `engines`는 Node `^22.12.0 || ^24.0.0 || >=26.0.0`. Next.js 16 공식 요구는 Node 20.9+. `phases/0-mvp/step0.md`는 `npm install -D vitest`만 하고, Node 점검은 `plan.md` S11·`step11.md`에만 있다. execute.py는 Node 버전을 보지 않는다.
수정안: S0에서 (a) `node -v`가 22.12 미만이면 `blocked`(사유에 Volta/nvm으로 22.x)로 두거나, (b) `vitest@4`로 핀해 Next 16 최소 Node와 맞춘다. `engines`는 S11이 아니라 S0 `package.json`에 넣는다.

[blocker] S4 / ADR-005 / §5.6 — `claude-sonnet-5` 기본 호출이 adaptive thinking·effort `high`인데 `max_tokens: 4096`과 timeout 45초만 지정돼 있다
근거: Claude Sonnet 5 개요(https://platform.claude.com/docs/en/models/sonnet-5/overview) — thinking은 기본 ON, 기본 effort `high`, sampling 비기본값은 400. Thinking 문서 — thinking 토큰은 `max_tokens`에 포함되며 응답 텍스트와 합쳐 한도를 쓴다. Effort 문서 — `high` 이상에서는 큰 `max_tokens`가 필요하고, effort는 소프트 가이드·`max_tokens`가 하드 캡. `phases/0-mvp/step4.md`는 `max_tokens: 4096`, `timeout: 45_000`, `maxRetries: 0`만 있고 `thinking`/`output_config.effort`가 없다. S4 테스트는 `messages.create`를 mock하므로 AC는 통과하고, 실제 분석(S7·시연 H1)에서만 터진다.
수정안: 구조화 추출 MVP에서는 `thinking: { type: 'disabled' }`(Sonnet 5가 명시적으로 허용) 또는 `output_config: { effort: 'low' }` + `max_tokens`를 16384 이상으로 올린다. 프롬프트·테스트에 thinking 블록이 끼어도 `tool_use`만 고르라고 적는다. timeout은 thinking을 끄면 45초로 충분하고, 켜 두면 60초 `maxDuration`과 충돌한다.

[blocker] S1 / §6.2 — JSON Schema `required` 테스트가 같은 step의 `.catch()` 규칙과 모순이다 (확인 필요, 확실성 중상)
근거: `step1.md` §2는 merchant/notes를 `.nullable().catch(null)`, items를 `.array(...).max(500).catch([])`로 두고, 이어지는 문장은 `.catch()` 필드(`date`·`category`·`confidence`)가 `io: 'input'`에서도 `required`에 남는다고 한다. 같은 파일 테스트는 `required`에 `documentType`·`totalAmount`가 있고 `items`·`notes`·`merchant`는 없다고 단정한다. Zod 현재 `toJSONSchema` 객체 처리(catch는 inner로 recurse, `optin === undefined`만 required)와 issue #4768(`.catch()` + `io:'input'`이 여전히 required)은 items/notes/merchant도 required에 넣을 가능성이 크다. 계획 본문은 "zod 4.6에서 확인됨"이라고만 하고 재현 스크립트는 없다.
수정안: 로컬에서 `z.toJSONSchema(analysisResultSchema, { io: 'input' }).required`를 한 번 찍고 테스트 기대를 그 결과에 맞춘다. 모델에게 선택으로 두고 싶으면 catch가 아니라 `.optional()`(또는 `.default()`만)을 쓰고, required에 남을 필드와 테스트 목록을 한 표로 고정한다.

[major] S6 / S8 — `unknown` 안내 카드와 `editor` 슬롯의 우선순위가 없어 S8이 넣은 수정 폼이 안 보일 수 있다
근거: `step6.md`는 `editor`가 있으면 SummaryGrid 자리에 editor, `documentType === 'unknown'`이면 요약 그리드 대신 안내 카드라고 나란히 적는다. `step8.md`는 unknown이어도 `editor`를 넣으라고 한다. `docs/USER_FLOWS.md` 8절은 unknown 분기(U) 이후에도 수정 버튼으로 이어진다. S6·S8 테스트 모두 unknown+editor 조합이 없다.
수정안: S6에 렌더 순서를 못 박는다. 예: 상단 배지·actions → unknown이면 안내 카드 → 그 아래 `editor ?? SummaryGrid` → 표·원본. S8 테스트에 unknown 결과 + "수정" 버튼이 보이는 케이스를 추가한다.

[major] §7.3 / S4 / USER_FLOWS 11절 — 한 사진의 영수증 여러 장 규칙이 세 가지로 갈린다
근거: `docs/USER_FLOWS.md` 11절은 "첫 번째만 인식". `phases/0-mvp/step4.md` 프롬프트는 "가장 크게 보이는 한 장만". `plan.md` §7.3은 "한 장만 인식". execute.py는 USER_FLOWS 전체와 step4 본문을 같은 프롬프트에 넣으므로 S4 에이전트가 어느 문구를 SYSTEM_PROMPT에 넣을지 비결정적이다.
수정안: 원본(USER_FLOWS)을 "가장 크게 보이는 한 장"으로 고치거나, step4·plan §7.3을 "첫 번째만"으로 맞춘다. 한쪽으로 통일한 뒤 S4 금지사항/프롬프트 불릿만 남긴다.

[major] S6 — `[id]/page.tsx`가 `user.id`를 쓰지만 `getCurrentUser()` 호출을 지시하지 않는다
근거: `step6.md` 대시보드 페이지는 `getCurrentUser()` → `createServerSupabase()` → `listByUser(user.id)` 순서를 명시한다. 상세는 `params` await → `getById(id, user.id)`만 있고 `user`의 출처가 없다. `(app)/layout.tsx`의 user는 자식 page로 자동 전달되지 않는다. 복붙하면 `user` 미정의로 `tsc` 실패 → 재시도로 회복 가능하나, 시그니처 누락이다.
수정안: 상세 페이지에도 대시보드와 동일하게 `const user = await getCurrentUser(); if (!user) redirect('/login')`를 적고, `getById(id, user.id)`와 `createReceiptStorage`에 그 user/supabase를 쓰라고 한다.

[major] S3 / §13.1 — 시연에 안 쓰는 Google provider를 `blocked` 게이트로 두면 이메일 로그인 MVP가 멈춘다
근거: `docs/USER_FLOWS.md` 9절·`plan.md` §7.4·§12는 시연 중 Google을 피하라고 한다. `step3.md` 검증 절차는 `"google":false`이면 코드가 통과해도 `blocked`다. execute.py는 blocked에서 이후 step을 실행하지 않는다. ADR-002·PRD는 Google을 범위에 넣지만, 운영자 발급 이메일 로그인만으로 F2·시연 시나리오는 성립한다. §11 항목이 아니라 남아 있는 과잉 게이트다.
수정안: Google 버튼·콜백·`error=oauth` 코드는 유지하되, `"google":false`는 README 경고/`summary` 기록만 하고 step을 `completed`로 둔다. `"disable_signup":false` blocked는 ADR-002 탈취 경로라 유지한다. Google을 다음 phase로 미루는 선택은 PRD 결정이므로 이 리뷰가 범위를 지우지는 않는다.

[major] S0 / C4 — `no-restricted-imports`가 `handler.ts`·`deps.ts`를 비워 C4를 lint로 강제하지 못한다
근거: `CLAUDE.md` CRITICAL C4는 `@anthropic-ai/sdk`·`@supabase/supabase-js`를 `src/services/`·`src/lib/supabase/` 밖에서 import하지 말라고 한다. `step0.md` 적용 파일은 `src/components/**`, `src/app/**/page.tsx`·`layout.tsx`·`route.ts`뿐이다. `src/app/api/analyses/handler.ts`와 `deps.ts`는 예외다. `deps.ts`는 팩토리만 쓰라고 적혀 있지만, headless가 SDK를 직접 넣어도 Stop 훅 lint가 통과한다.
수정안: 금지 글롭을 `src/app/**` 전체로 넓히고, 구현체 경로 금지는 유지한다. 팩토리 import는 허용된다. `deps.ts`/`handler.ts`를 적용 목록에 명시하는 것으로도 충분하다.

[major] S2 — `setAll`이 `@supabase/ssr`가 넘기는 캐시 헤더를 응답에 쓰지 않는다
근거: Supabase SSR 가이드(https://supabase.com/docs/guides/auth/server-side/creating-a-client, 2026-09-14) — `setAll(cookiesToSet, headers)`의 두 번째 인자는 `Cache-Control`/`Expires`/`Pragma`이고, 프록시 응답에 적용하지 않으면 CDN이 `Set-Cookie`를 캐시해 세션이 섞일 수 있다. `@supabase/ssr` v0.10.0부터 이 인자를 넘긴다. `step2.md` 스니펫은 `setAll(cookiesToSet)` 한 인자만 받고 헤더를 무시한다. JS라 런타임 에러는 안 나지만 헤더가 유실된다.
수정안: 공식 Next 프록시 예제처럼 `setAll(cookiesToSet, headers)`에서 `headers`를 `response`에 복사한다. Server Component의 try/catch는 그대로 둔다.

[major] §3 / CLAUDE.md — 쓰기 경로가 원본과 충돌한다
근거: `plan.md` §0.1은 원본이 기준. `CLAUDE.md`는 "쓰기(분석 실행·삭제)는 `src/app/api/**`". `docs/PRD.md` 핵심 기능 7과 `docs/ARCHITECTURE.md`는 `PATCH` 수정을 포함한다. `plan.md` §3은 괄호를 "분석·삭제·수정"으로 확장했다. execute.py는 CLAUDE.md와 step5/8을 함께 주입하므로 가드레일과 작업 지시가 어긋난다.
수정안: CLAUDE.md 쓰기 문장에 수정을 넣는다(원본 수정). 정리본만 고치지 말고 원본을 고친다. plan §3은 원본과 같아져야 한다.

[minor] §7.1 — 화면 지도가 USER_FLOWS 3절보다 간선이 적다
근거: `docs/USER_FLOWS.md` 3절은 상세→로그아웃→랜딩, 상세 비로그인→로그인. `plan.md` §7.1 mermaid는 둘 다 없다. `(app)/layout`의 헤더 로그아웃은 상세에도 있다.
수정안: 압축이 목적이면 "원본 3절 대비 생략: 상세 로그아웃·상세 비로그인"을 한 줄로 적거나, 간선을 원본과 맞춘다.

[minor] S7 — JSON이 아닌 응답을 전부 60초 초과로 취급한다
근거: `step7.md` 실패 분기: `504 또는 본문이 JSON이 아님` → 시간 초과 문구. USER_FLOWS 11절의 504 행과 같다. 실제로는 500 HTML·프록시 에러 페이지도 같은 문구가 된다.
수정안: `status === 504`만 시간 초과로 두고, 비JSON 4xx/5xx는 "분석 중 오류가 발생했습니다."로 둔다. 동작은 하므로 문구 문제.

[minor] S8 — `type="number"` 값이 문자열로 스키마에 들어가면 클라이언트 검증이 실패한다
근거: `updateAnalysisRequestSchema`는 `totalAmount`/`vatAmount`를 유한 number로 둔다(`step1.md`). `step8.md`는 `Input type="number"`만 있고 `Number(...)` 변환을 말하지 않는다. 테스트 (c)는 가맹점만 바꿔 우회한다.
수정안: 저장 전에 `totalAmount`/`vatAmount`를 number | null로 변환하라고 한 줄 적는다.

[minor] S7 / S8 / UI_GUIDE — 아이콘 표와 step이 어긋난다
근거: `docs/UI_GUIDE.md` 아이콘: 삭제 `Trash2`, 문서 `FileText`, 이미지 `Image`. `step7.md` 삭제 버튼은 아이콘을 지정하지 않고, `step8.md`는 표에 없는 `Pencil`을 쓴다. `plan.md` §13.5가 이미 열어 둔 항목.
수정안: UI_GUIDE에 `Pencil`/`Download`/`Loader2`를 추가하고 S7 삭제에 `Trash2`를 지정한다. 또는 step에서 UI_GUIDE 표를 따른다고만 하고 Pencil을 뺀다.

[minor] §5.5 / ARCHITECTURE — 404 문구가 원본보다 둘이 됐다
근거: `docs/ARCHITECTURE.md` 에러 절은 404를 "분석을 찾을 수 없습니다. 이미 삭제되었을 수 있습니다." 한 줄로 압축한다. `plan.md` §5.5와 `step5.md`는 파일 404 / 분석 404를 나눈다. 구현은 step이 맞다.
수정안: ARCHITECTURE 에러 목록을 step5와 같은 두 문구로 고친다.

## 확인했으나 문제 없음

**step 간 선행·파일 존재.** S0→S1 타입, S2가 S1 인터페이스를 구현, S3가 S2 클라이언트/`proxy.ts`를 읽음, S4는 S1만 필요, S5는 S2+S4 산출물, S6은 S3 임시 대시보드를 교체, S7/S8/S9가 S6 슬롯에 붙는 순서는 `index.json`·각 step 「읽어야 할 파일」과 맞다. 아직 없는 소스 파일을 선행 step 없이 읽으라고 한 경우는 없다. `src/proxy.ts` 위치는 Next 16 공식(src 사용 시 `src/proxy.ts`)과 같다.

**Next 16.** `proxy.ts` + 함수명 `proxy` + `export const config.matcher`는 공식 Proxy 문서와 일치한다. `cookies()`/`params`/`searchParams` Promise await(P2), `next lint` 제거 후 `eslint`(S0)도 Next 16 변경과 맞다. `create-next-app`의 `--skip-install`·`--disable-git`·`--yes`는 CLI 레퍼런스에 있다.

**@supabase/ssr.** `getAll`/`setAll`, 서버에서 `getSession()` 금지, `getUser()`로 갱신, `setAll`을 request+response 양쪽에 쓰는 패턴은 유효하다. 공식 Next 예시가 `getClaims()`로 옮긴 것은 최적화이지 `getUser()` 무효화가 아니다. Storage 정책 `(storage.foldername(name))[1] = auth.uid()::text`, update 정책 생략, `upsert: false`는 `0001_init.sql`·ADR-004와 일치한다.

**zod v4 / Anthropic tool.** `z.toJSONSchema(schema, { io: 'input' })`, `$schema` 제거, `ToolInputSchema`를 interface가 아니라 type 별칭으로 두는 이유(SDK 인덱스 시그니처)는 맞다. PDF `document`+base64, 이미지 `image` 블록, `tool_choice: { type: 'tool', name }`은 현재 Messages/tool-use 문서와 같고, adaptive thinking에서도 forced tool use는 허용된다(문제는 thinking 토큰 예산이지 tool_choice 문법 자체가 아니다).

**Vercel.** 함수 본문 4.5MB, `maxDuration = 60`이 전 플랜에서 허용되는 점은 2026-08 한도 표와 맞다. Fluid 기본 300초 안내(S11)도 현재 Hobby 기본과 맞다. 클라이언트 Storage 직접 업로드(C3/ADR-004)는 그 한도의 올바른 우회다.

**§11·§12.** 사용량 한도, 원본 추출값 컬럼, Origin 검사, 매직 바이트, 클라이언트 고아 정리, DB jsonb 집계, 분석기 재시도 예산을 자른 근거는 ADR-002(공개 가입 없음)와 시연 MVP 전제에서 틀리지 않다. 401·504 고아 파일과 목록 100건 요약은 명시한 감수라 재론하지 않는다. 빠진 시연 필수 기능(이메일 로그인, 업로드→상세, 요약 카드, 삭제, 테마)은 step 맵에 있다. 빠진 것은 모델 호출 파라미터(위 blocker)이지 화면 유스케이스가 아니다.

**C1–C3.** 키는 서버만, `service_role` 없음, 파일 본문을 API로 보내지 않음은 step 금지사항·테스트(403 시 download 미호출, FormData 금지)까지 내려가 있다.
