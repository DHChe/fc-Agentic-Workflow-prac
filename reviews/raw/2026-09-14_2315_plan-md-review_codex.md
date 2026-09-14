# SlipScan MVP plan.md 독립 리뷰

리뷰어: codex  
날짜: 2026-09-14 (Asia/Seoul)

## 요약

**blocker 2건 / major 9건 / minor 5건**

§0 전체를 먼저 읽고, §0.2의 순서대로 plan.md와 지정된 원본 전체를 교차 검토했다. step 순서와 주요 서비스 시그니처는 대체로 일관되지만, S1의 JSON Schema 테스트와 중첩 필드 타입은 지시를 그대로 지키면 테스트 또는 타입 검사를 통과할 수 없다. 기술 검토에서는 Next 16·Supabase SSR·Storage 정책의 기본 방향은 타당하며, PDF 페이지 제한의 제공자 의존과 하네스 훅의 차단 방식에는 수정이 필요하다. MVP 범위에서는 Google 설정을 전체 실행의 필수 관문으로 둔 부담과 판독 불가 결과의 수정 진입 누락이 눈에 띄며, §11·§12의 확정된 제외·제한은 근거 오류와 직접 관련된 부분만 지적했다.

## 지적 사항

[blocker] §6.2 / S1 — `.catch()` 조합과 JSON Schema의 `required` 테스트 기대값이 양립하지 않는다.  
근거: `phases/0-mvp/step1.md` §2는 `items.catch([])`, `merchant/notes.nullable().catch(null)` 및 `io: 'input'`을 지정하지만 §5는 이 세 필드가 `required`에 없어야 한다고 요구한다; 같은 §2와 plan.md §6.2는 `.catch()` 필드가 필수로 남는다고 설명하고, plan.md S1은 원본보다 강하게 `documentType`·`totalAmount`만 필수라고 요약한다. [Zod 공식 변환 구현의 inputOptin/objectProcessor](https://github.com/colinhacks/zod/blob/main/packages/zod/src/v4/core/json-schema-processors.ts)는 catch 내부 스키마의 선택성을 기준으로 필수 키를 결정하므로 지정된 세 필드는 필수로 남는다; 확실성 높음, 실행 재현 없이 소스와 명세를 대조했다.  
수정안: 현재 `.catch()` 조합을 유지하고 §2·§5·plan.md S1의 기대값을 실제 변환 규칙에 맞춘다; `.default('KRW')`인 currency와 `.catch()` 필드를 구분하고, 파싱 시 누락을 복구하는 정책과 모델에게 요청하는 JSON Schema의 필수 필드를 별도로 설명한다.

[blocker] S1 — 품목명·거래 가맹점을 null로 보정하라는 규칙이 선언된 string 타입과 충돌한다.  
근거: `phases/0-mvp/step1.md` §1의 `LineItem.name`·`Transaction.merchant`는 `string`인데, §2의 null 보정 조합은 품목·거래의 name/merchant도 200자 초과 시 null로 만든다고 명시한다; 동시에 `analysisResultSchema: z.ZodType<AnalysisResult>`와 타입 할당 검증을 요구하므로 `string | null`을 생성하는 스키마는 이 선언에 맞지 않는다. plan.md §6.2의 압축 표는 해당 중첩 필드 규칙을 생략해 원본의 충돌을 드러내지 않는다; [Zod의 nullable·catch 동작](https://zod.dev/api#catch), 확실성 높음.  
수정안: 최상위 merchant의 null 허용과 중첩 name/merchant의 문자열 유지를 구분한다; 중첩 필드는 예를 들어 `z.string().max(200).catch('')`로 통일하고, 누락·길이 초과 시에도 `AnalysisResult`에 할당 가능한 결과가 나오는지 S1 검증에 포함한다.

[major] S6 / S8 — `unknown` 화면이 편집 슬롯을 숨겨 수동으로 값을 채우라는 후속 요구를 막는다.  
근거: `phases/0-mvp/step6.md` §1은 `documentType === 'unknown'`이면 요약 그리드를 안내 카드로 대체하고 editor는 그 요약 그리드 자리에 넣도록 한다; 반면 `step8.md` §2는 사용자가 값을 채우도록 unknown에도 editor를 넣으라고 요구한다. plan.md S6·S8도 같은 충돌을 유지하며, `docs/USER_FLOWS.md` §8은 unknown 이후에도 수정 버튼으로 이어진다.  
수정안: S6에서 unknown 안내 카드와 editor 렌더 영역을 분리해 둘 다 표시하도록 정하고, S8에 `unknown + editor` 조합에서 수정 버튼·저장까지 접근 가능한 컴포넌트 검증을 추가한다.

[major] S7 — 파일 검증 실패 후에도 ‘다시 시도’가 검증을 건너뛰고 업로드를 실행한다.  
근거: `phases/0-mvp/step7.md` §2와 `docs/USER_FLOWS.md` §6은 형식·크기·빈 파일 검증 실패를 모두 error로 보내면서 error의 재시도를 같은 File의 uploading 단계부터 시작하도록 한다; 따라서 거부된 GIF·빈 파일·초과 파일에도 업로드 호출이 가능해져 UC-08의 ‘요청 없음’ 조건을 깨뜨린다. S7 테스트 (a)는 최초 선택만 확인하고, (f)는 검증 실패와 네트워크 실패를 구분하지 않는다.  
수정안: 재시도도 최초 선택과 동일한 검증 함수를 거치게 하거나, 검증을 통과했던 파일에만 재시도 버튼을 노출한다; 검증 실패 후 재시도에서도 uploadReceipt·fetch가 호출되지 않는 경우를 명시한다.

[major] §5.5 / S5 — DELETE·PATCH의 저장소 예외를 고정 JSON 오류로 바꾸는 경로가 빠져 있다.  
근거: `phases/0-mvp/step2.md` §3은 Supabase error를 throw하도록 하지만 `step5.md` §1의 DELETE·PATCH에는 null·성공 분기만 있고 repository 예외의 500 처리가 없다; §2·§3의 buildDeps 호출 실패도 핸들러 밖에서 발생한다. 이는 `docs/ARCHITECTURE.md` ‘에러’와 plan.md §5.5의 고정 한국어 `{ error: string }` 계약과 어긋나며, S7 삭제 버튼은 응답 error가 있다는 전제다.  
수정안: POST·DELETE·PATCH와 의존성 생성의 예상 밖 예외를 잡아 로그에는 원인을 남기고 응답에는 500 고정 JSON을 반환하도록 S5에 명시한다; repository.delete/update reject와 buildDeps 실패를 확인하되 이미 결정된 401·404 및 삭제 파일 정리 실패의 200 처리는 유지한다.

[major] §2.1 / §7.3 / S4 — ‘100페이지 초과 PDF는 Claude가 거부한다’는 전제로는 앱의 100페이지 제한을 지킬 수 없다.  
근거: `docs/PRD.md` ‘입력 제약’은 PDF 100페이지 이하이고 `step4.md` §2·`docs/USER_FLOWS.md` §11은 초과 시 제공자가 거부한다고 가정하지만, S5·S7은 크기만 검사한다. [공식 PDF 제한](https://platform.claude.com/docs/en/build-with-claude/pdf-support#check-pdf-requirements)은 1M 컨텍스트에서 최대 600페이지이며 [기본 모델 Sonnet 5](https://platform.claude.com/docs/en/models/sonnet-5/whats-new-sonnet-5)는 1M을 기본으로 사용하므로, 101페이지가 반드시 4xx가 된다는 근거는 틀리다; 확실성 높음.  
수정안: PRD의 100페이지 제한을 유지하려면 S5의 서버 입력 검증에 페이지 수 확인과 명확한 초과 응답을 배정하고 S4·README의 제공자 제한 설명을 고친다; 제공자에게 위임하기로 바꾸려면 먼저 PRD의 100페이지 제한을 변경해야 하며, 단순히 예외 문구만 고쳐서는 해결되지 않는다.

[major] S4 / S11 — Vercel maxDuration만 늘리라는 안내는 SDK의 45초 제한 때문에 효과가 없다.  
근거: `phases/0-mvp/step4.md` §3은 Anthropic 클라이언트에 `timeout: 45_000`, `maxRetries: 0`을 고정하지만 `step11.md` §1의 Vercel 배포 안내와 plan.md S11은 큰 PDF 시간 초과의 해결책으로 라우트 maxDuration만 120~180초로 늘리라고 한다. 이 경우에도 분석 호출은 45초 제한을 유지하며 S4·S5 규칙상 provider_error/502로 끝난다; Vercel에서 더 긴 시간이 허용된다는 사실과 별개의 설정 충돌이다.  
수정안: MVP의 45초 SDK·60초 함수 예산을 유지한다면 해당 증설 안내를 제거한다; 증설 방법을 남긴다면 SDK timeout을 함수 제한보다 정리·저장 시간만큼 짧게 함께 조정하는 절차와 업로드 대기 문구 변경을 명시한다.

[major] §9 — PreToolUse 훅이 잘못된 입력 경로와 종료 코드로 인해 위험 명령을 차단하지 못한다.  
근거: `.claude/settings.json` PreToolUse는 `$CLAUDE_TOOL_INPUT`을 검색하고 탐지 시 `exit 1`을 반환한다; [Claude Code 공식 훅 문서](https://code.claude.com/docs/en/hooks#hook-input-and-output)는 이벤트 JSON을 stdin으로 전달하고 도구 차단에는 exit 2 또는 구조화된 deny 결정을 사용한다. 현재 설정은 stdin의 `tool_input.command`를 읽지 않으며 exit 1 자체에도 차단 효력이 없어, plan.md §9의 ‘차단한다’는 설명을 충족하지 않는다; 확실성 높음.  
수정안: stdin JSON에서 `tool_input.command`를 추출하고 탐지 시 stderr 사유와 exit 2 또는 PreToolUse deny JSON을 반환하도록 훅을 고친다; 실제 위험 명령을 실행하지 않는 훅 입력 검증으로 차단 결정을 확인한다.

[major] §9 — Stop 훅 실패와 Claude 비정상 종료가 step 성공 판정을 막지 못할 수 있다.  
근거: `.claude/settings.json` Stop은 `lint && build && test`의 일반 종료 코드를 그대로 반환하고 실패 출력을 stdout으로 보낸다; [공식 훅 종료 코드 규칙](https://code.claude.com/docs/en/hooks#exit-code-output)상 exit 1은 차단 결정이 아니다. 또한 `scripts/execute.py`의 `_invoke_claude`는 비정상 종료를 WARN으로만 남기고 `_execute_single_step`은 반환된 exitCode를 보지 않은 채 index의 completed만으로 다음 step을 실행한다.  
수정안: Stop의 검증 실패를 명시적 차단 결과로 변환하고, 러너는 Claude의 정상 종료와 step completed를 함께 만족할 때만 성공 처리한다; 비정상 종료 시 기록된 stderr/실패 정보를 기존 재시도 입력으로 넘기도록 한다.

[major] §9 — headless 세션의 30분 제한 초과는 재시도·error 기록 없이 러너를 종료시킨다.  
근거: `scripts/execute.py` `_invoke_claude`의 `subprocess.run(..., timeout=1800)`을 `_execute_single_step`까지 어느 곳에서도 예외 처리하지 않는다; [Python 공식 subprocess.run 문서](https://docs.python.org/3/library/subprocess.html#subprocess.run)에 따르면 제한 초과 시 TimeoutExpired가 발생한다. 따라서 이 경로에서는 output 기록, 최대 3회 재시도, failed_at/error_message 기록에 도달하지 못해 plan.md §9의 복구 계약이 성립하지 않는다; 확실성 높음.  
수정안: TimeoutExpired를 잡아 해당 시도 실패와 확보된 출력을 기록하고 기존 재시도 루프로 전달한다; 재시도 소진 시 step과 phase를 error로 갱신하도록 명시한다.

[major] §6.3 / S2 — 테이블 grant를 프로젝트 기본 설정에 의존해 마이그레이션 후에도 연결 검증이 막힐 수 있다 (확인 필요).  
근거: `supabase/migrations/0001_init.sql`은 analyses 생성·RLS 정책만 정의하고 anon/authenticated의 테이블 권한을 명시하지 않지만, `step2.md` AC는 익명 조회 200을 항상 기대하고 다른 코드는 SQL 재적용으로 안내한다. [Supabase 공식 RLS 문서](https://supabase.com/docs/guides/database/postgres/row-level-security#grants-and-row-level-security)는 프로젝트마다 기본 grant가 다르며 권한이 없으면 정책 평가 전 42501이 발생한다고 설명한다; 누락 자체의 확실성은 높고, 실제 프로젝트에서 발생하는지는 기본 권한을 조회하지 않아 중간이다.  
수정안: authenticated에 필요한 테이블 SELECT·INSERT·UPDATE·DELETE 권한을 마이그레이션에 명시하고, anon 조회를 거부할지 빈 배열로 허용할지 AC와 함께 정한다; 연결 실패의 응답 코드·본문을 구분해 키·권한·스키마 오류별 조치를 안내한다. 이는 §11에서 제외한 컬럼 단위 쓰기 제한을 재도입하는 제안이 아니다.

[minor] §13.1 / S3 — 시연에서 쓰지 않는 Google 설정이 핵심 분석 기능 구현까지 막는 필수 관문이다.  
근거: `docs/USER_FLOWS.md` §9는 시연 중 Google 로그인을 피하도록 하지만 `phases/0-mvp/step3.md`는 provider 미설정 시 blocked로 종료하고, `scripts/execute.py`는 그 뒤 S4~S11을 진행하지 않는다; plan.md §13.1이 요청한 MVP 과잉 설계 검토에 해당한다.  
수정안: 리뷰 의견은 Google을 다음 phase로 미루는 쪽이다; 범위 결정 시 PRD·ADR-002·S3·README를 함께 맞추고 공개 가입 차단은 유지한다. 이번 MVP에 유지하더라도 외부 설정은 핵심 분석 구현의 진행 조건과 분리해 마지막 수동 연동 확인으로 옮긴다.

[minor] §4 / §13.2 — ADR-008 제목은 사용하지 않는 Tailwind dark 커스텀 variant를 요구하는 것처럼 읽힌다.  
근거: `docs/ADR.md` ADR-008 제목은 ‘Tailwind dark 커스텀 variant’지만 본문·`docs/UI_GUIDE.md`는 CSS 변수 토큰 방식이고 `phases/0-mvp/step0.md` §4는 `@custom-variant dark`를 정의하지 말라고 명시한다.  
수정안: 제목을 ‘next-themes + CSS 변수 토큰, dark: 변형 미사용’으로 바꿔 본문과 일치시킨다.

[minor] §7 / S8 — 수정 유스케이스의 음수 검증 실패 설명이 환불 허용 정책과 반대다.  
근거: `docs/USER_FLOWS.md` §10 UC-25는 예외에 ‘검증 실패(음수·날짜 형식)’를 적었지만 `docs/PRD.md` ‘입력 제약’, `step1.md` §2, `step8.md` §1·§3은 음수 합계를 허용하고 -12000 통과를 요구한다; plan.md는 환불 허용으로 정리해 원본의 상충 문구가 남아 있다.  
수정안: UC-25 예외의 ‘음수’를 ‘빈 합계·유한하지 않은 숫자’ 등 실제 거부 조건으로 교체한다.

[minor] §7.3 / S4 — 여러 영수증 중 선택 기준이 첫 번째와 가장 큰 것으로 갈린다.  
근거: `docs/USER_FLOWS.md` §11은 ‘첫 번째만 인식’이고 `phases/0-mvp/step4.md` §1 및 plan.md S4는 ‘가장 크게 보이는 한 장’을 지정한다; plan.md §7.3의 ‘한 장만’ 요약은 이 원본 간 충돌을 숨긴다.  
수정안: 가장 크게 보이는 한 장으로 기준을 통일하고 USER_FLOWS 예외 표와 plan.md §7.3에도 같은 표현을 쓴다.

[minor] §8 / S10 — 한 화면에 primary 한 곳이라는 UI 규칙과 랜딩의 primary 두 곳이 충돌한다.  
근거: `docs/UI_GUIDE.md` ‘포인트·시맨틱’과 plan.md §8은 포인트 색을 한 화면의 primary 액션 한 곳에만 쓰도록 하지만, `phases/0-mvp/step10.md` §1·§2와 plan.md S10은 헤더 로그인 링크와 히어로 CTA를 모두 primary로 지정한다.  
수정안: 히어로 CTA만 primary로 두고 헤더 로그인은 text 또는 secondary로 지정한다.

## 확인했으나 문제 없음

- **§0.2 ① 순서·계약:** index.json의 S0~S11 번호·이름과 원본 step 파일이 일치한다. 실제 순차 실행을 기준으로 ‘읽어야 할 파일’에 선행 step이 아직 생성하지 않은 필수 파일을 요구하는 사례는 발견하지 못했다. AnalyzerError 코드, Repository의 delete 반환 행·update patch, Storage 반환 타입, 팩토리 이름은 주요 소비 step과 일치한다.
- **스키마 필드 수:** PRD와 S1의 AnalysisResult는 documentType부터 notes까지 정확히 11개다. properties 11개 요구는 맞으며 지적에서 제외했다.
- **§0.2 ② Next 16:** proxy.ts/proxy, await cookies·params·searchParams, route.ts의 제한된 export, 별도 ESLint 실행 지시는 [공식 업그레이드 문서](https://nextjs.org/docs/app/guides/upgrading/version-16)와 맞는다.
- **Supabase SSR·Storage:** getAll/setAll, 갱신 쿠키를 request·response 양쪽에 전달하고 redirect 응답에도 복사하는 방향, getSession 대신 getUser로 신원을 확인하는 방식은 [공식 SSR 안내](https://supabase.com/docs/guides/auth/server-side/creating-a-client)와 부합한다. SQL의 bucket_id 조건, `(storage.foldername(name))[1]`, INSERT의 WITH CHECK와 SELECT/DELETE의 USING, upsert:false에 맞춘 UPDATE 정책 생략은 [Storage 정책 문법](https://supabase.com/docs/guides/storage/security/access-control)상 문제가 없다; 테이블 grant의 환경 의존성은 별도 지적했다.
- **Zod·Anthropic:** z.toJSONSchema와 io: 'input', nullable/catch 조합 자체는 지원된다. ToolInputSchema를 type 별칭과 `type: 'object'` 리터럴로 두는 방향, PDF document·이미지 image 블록 및 이름을 포함한 tool_choice는 [Messages API의 요청 형식](https://platform.claude.com/docs/en/api/http/messages/create)에 맞는다. claude-sonnet-5는 [공식 모델 ID](https://platform.claude.com/docs/en/models/sonnet-5/whats-new-sonnet-5)이며, 기본 adaptive thinking 때문에 강제 tool 호출이 반드시 실패한다는 지적은 하지 않았다; [현재 공식 설명](https://platform.claude.com/docs/en/about-claude/models/extended-thinking-models)은 adaptive thinking의 강제 tool 호출을 허용한다.
- **Vercel:** 4.5MB 요청 본문 제한 때문에 Storage로 직접 업로드하고 API에 경로만 보내는 설계는 타당하다. maxDuration 60과 Fluid compute Hobby 최대 300초 설명도 [공식 제한](https://vercel.com/docs/functions/limitations)과 맞으며, S11의 문제는 플랫폼 상한이 아니라 SDK timeout과의 불일치다.
- **§0.2 ③ MVP 범위:** 최근 100건 집계, 사용자 수정 5개 필드, 분석 1건당 CSV 1행, 동기 분석, 제한적인 고아 파일 수동 정리, e2e 제외를 다시 확장할 필요는 찾지 못했다. 부분 PATCH는 기존 타입·API가 이미 있으므로 유지하는 편이 합리적이다. Google은 위 축소 의견을 제시했고, unknown 수정 진입은 이미 포함된 기능을 완성하는 데 필요한 누락이다.

검증 기록: 다른 리뷰어 결과나 reviews/의 다른 파일은 읽지 않았고, 다른 에이전트와 상의하지 않았다. npm install·빌드·테스트·git commit·브랜치 변경·push는 실행하지 않았으며, 리뷰 지적의 구현 수정도 하지 않았다. 아래는 시작 전 `git status --short` 원문이다.

```text
 M .gitignore
 M CLAUDE.md
 M docs/ADR.md
 M docs/ARCHITECTURE.md
 M docs/PRD.md
 M docs/UI_GUIDE.md
?? docs/USER_FLOWS.md
?? phases/
?? plan.md
?? supabase/
```

종료 시 `git status --short`는 위 시작 상태에 `?? reviews/`만 추가됐다. 이 리뷰가 작성한 파일은 `reviews/plan-review-codex.md` 하나이며, 모든 지적의 3줄 형식·심각도 정렬·개수와 필수 절의 존재를 정적으로 확인했다. 지정된 원본 파일은 시작 시점의 SHA-256과 모두 일치한다.

부가 관찰: reviews/와 .git·node_modules·.next를 제외한 264개 파일의 해시도 비교했으며, Git 상태에 나타나지 않는 `.omc/state/sessions/a71d7d28-b828-4016-94fc-354f99717503/` 아래 `last-tool-error-state.json`·`pre-tool-advisory-throttle.json`의 값 변경이 관찰됐다. 이 리뷰는 해당 런타임 상태 파일을 편집하지 않았고, 변경 주체는 확인하지 않았다; 따라서 전체 작업 디렉토리의 모든 바이트가 불변이었다고 주장하지 않는다.
