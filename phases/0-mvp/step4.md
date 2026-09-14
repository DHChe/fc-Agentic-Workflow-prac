# Step 4: claude-analyzer

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `docs/ADR.md` — ADR-005 (tool use 강제, document/image 블록, 모델 환경변수, 호출 파라미터)
- `docs/PRD.md` — "추출 결과 스키마", "입력 제약"
- `src/types/analysis.ts`, `src/lib/schemas/analysis.ts` — `analysisResultSchema`, `analysisResultJsonSchema`
- `src/services/analyzer/types.ts` — `DocumentAnalyzer`, `AnalyzeInput`, `AnalyzerError`

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라. `@anthropic-ai/sdk`의 `messages.create` 파라미터 타입(`tools`, `tool_choice`, `document`/`image` 콘텐츠 블록)은 `node_modules/@anthropic-ai/sdk`의 타입 정의를 직접 확인하고 맞춰라.

## 작업

### 1. 프롬프트 `src/services/analyzer/prompt.ts`

```ts
export const SYSTEM_PROMPT: string
export const USER_INSTRUCTION: string
export const TOOL_NAME = 'record_analysis'
export const TOOL_DESCRIPTION: string
```

`SYSTEM_PROMPT`는 한국어로, 최소 다음 규칙을 담는다:
- 역할: 한국 중소기업 경비 담당자를 돕는 영수증·카드명세서 판독기.
- `documentType` 판단: 품목과 합계가 있는 단일 거래 → `receipt`. 여러 거래가 표로 나열 → `card_statement`. 둘 다 아니면 `unknown`.
- 금액은 숫자만(콤마·원 기호 제거). 날짜는 `YYYY-MM-DD`. 연도가 없으면 `null`.
- 부가세가 명시되지 않았으면 추정하지 말고 `null`.
- `receipt`이면 `items`를 채우고 `transactions`는 빈 배열. `card_statement`이면 반대. `totalAmount`는 명세서의 경우 거래 합계.
- `category`는 목록(식비/교통/숙박/소모품/접대/통신/기타) 중 하나. 애매하면 `기타`.
- 판독이 어려운 부분은 `notes`에 한국어로 적고 `confidence`를 낮춘다. 0.6 미만이면 화면에 "확인 필요" 배지가 붙는다.
- 영수증·명세서가 아닌 이미지(풍경, 인물 등)면 `documentType: unknown`, `totalAmount: 0`, `notes`에 "영수증이나 명세서로 보이지 않습니다."
- 한 이미지에 영수증이 여러 장이면 가장 크게 보이는 한 장만 추출하고 `notes`에 "영수증 여러 장이 감지되어 한 장만 추출했습니다."를 적는다.
- 반드시 `record_analysis` 도구를 호출해 결과를 기록한다.

### 2. 구현체 `src/services/analyzer/claude-analyzer.ts`

```ts
export class ClaudeDocumentAnalyzer implements DocumentAnalyzer {
  constructor(private readonly client: Anthropic, private readonly model: string) {}
  analyze(input: AnalyzeInput): Promise<AnalysisResult>
}
```

- `mimeType === 'application/pdf'` → `{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }`.
- `image/jpeg` · `image/png` · `image/webp` → `{ type: 'image', source: { type: 'base64', media_type, data } }`.
- 그 외 → `AnalyzerError('지원하지 않는 파일 형식입니다.', 'unsupported_file')`. 호출 전에 던진다.
- base64는 `Buffer.from(input.data).toString('base64')`.
- `client.messages.create({ model, max_tokens: 16000, output_config: { effort: 'low' }, system: SYSTEM_PROMPT, messages: [{ role: 'user', content: [fileBlock, { type: 'text', text: USER_INSTRUCTION }] }], tools: [{ name: TOOL_NAME, description: TOOL_DESCRIPTION, input_schema: analysisResultJsonSchema }], tool_choice: { type: 'tool', name: TOOL_NAME } })`.
- `thinking`은 지정하지 않는다 (Opus 5 기본 adaptive thinking 유지). 생각 토큰도 `max_tokens`에 포함되므로 4096은 부족하고, `output_config.effort: 'low'`로 생각 깊이를 낮춰 45초 안에 끝낸다. 이유: thinking을 끄면 Opus 5가 도구 호출을 텍스트로 쓰는 오동작 사례가 있다 (ADR-005). `output_config`가 SDK 타입에 없으면 `node_modules/@anthropic-ai/sdk`에서 현재 이름을 확인해 맞춘다.
- 응답 `content`에서 `type === 'tool_use'`이고 `name === TOOL_NAME`인 블록의 `input`을 `analysisResultSchema.safeParse`. 블록이 없거나 파싱에 실패하면 `AnalyzerError('분석 결과 형식이 올바르지 않습니다.', 'invalid_output')`. 재시도하지 않는다. 이유: tool use 강제와 관대한 스키마로 형식 오류는 드물고, Vercel 함수 60초 안에 끝나야 한다.
- 성공 시 `console.info`로 모델, 소요 ms, `response.usage`의 input/output 토큰 수를 한 줄 남긴다. 문서 내용은 남기지 않는다. 이유: 시연 비용과 지연을 추측이 아니라 로그로 안다.
- SDK 예외 분류: `err instanceof Anthropic.APIError`이고 `status`가 400·413·422면 입력 자체가 거부된 것(암호 PDF, 100페이지 초과, 8000px 초과 등)이므로 `AnalyzerError('입력 파일이 거부되었습니다: ' + message, 'rejected_input')`. 그 외(네트워크, 429, 5xx, 529)는 `AnalyzerError('분석 서비스 호출에 실패했습니다: ' + message, 'provider_error')`. 이유: 영구 거부를 "잠시 후 재시도"로 안내하면 시도마다 과금된다. `unsupported_file`·`invalid_output`은 그대로 전파.

### 3. 팩토리 `src/services/analyzer/index.ts`

```ts
import 'server-only'
export function createDocumentAnalyzer(): DocumentAnalyzer
```

`ANTHROPIC_API_KEY`가 없으면 "ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다."로 throw. 모델은 `process.env.ANTHROPIC_MODEL ?? 'claude-opus-5'`. `new Anthropic({ apiKey, maxRetries: 0, timeout: 45_000 })`를 만들어 `ClaudeDocumentAnalyzer`에 주입한다. 이유: SDK 기본값(재시도 2회, 타임아웃 10분)은 Vercel 60초 한도를 넘겨 504로 끝난다. 이 파일과 `claude-analyzer.ts`는 서버 전용이다.

### 4. 테스트 (먼저 작성) `src/services/analyzer/claude-analyzer.test.ts`

`{ messages: { create: vi.fn() } }` 형태의 가짜 client를 `as unknown as Anthropic`으로 주입한다.
- PDF 입력 → `create`가 `document` 블록, `tools[0].name === 'record_analysis'`, `tool_choice.type === 'tool'`, `max_tokens === 16000`, `output_config.effort === 'low'`로 호출된다.
- PNG 입력 → `image` 블록과 `media_type: 'image/png'`.
- `image/gif` → `unsupported_file`로 throw, `create` 미호출.
- 유효한 `tool_use` 응답 → `AnalysisResult` 반환 (기본값 보정 포함).
- 잘못된 `input`(예: `totalAmount` 누락) → `invalid_output`, `create` 1회 호출.
- `create`가 `status: 400`인 `Anthropic.APIError`로 reject → `rejected_input`. `status: 529` → `provider_error`.
- `create`가 reject → `provider_error`.

`index.ts`는 `server-only` 때문에 Vitest에서 import 하면 실패한다. 팩토리는 테스트하지 않는다.

## Acceptance Criteria

```bash
npm run lint
npm run build
npm run test
```

추가로 API 키가 유효한지 확인한다 (모델 목록 조회, 과금 없음):

```bash
set -a; source .env.local; set +a
curl -s -o /dev/null -w "%{http_code}\n" https://api.anthropic.com/v1/models \
  -H "x-api-key: $ANTHROPIC_API_KEY" -H "anthropic-version: 2023-06-01"
# 기대값: 200  (401이면 키 오류, 키가 비어 있으면 실행 전에 blocked)
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가? (`src/services/analyzer/`)
   - ADR 기술 스택을 벗어나지 않았는가? (tool use 강제, 모델 환경변수)
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가? (`@anthropic-ai/sdk`를 `src/services/` 밖에서 import 하지 않음, `NEXT_PUBLIC_` 없음)
3. 코드와 테스트가 완성되고 AC가 통과했으면 먼저 커밋한다.
4. API 키 확인 결과에 따라 `phases/0-mvp/index.json`의 해당 step을 업데이트한다:
   - 200 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"` (클래스·팩토리 이름, 기본 모델 ID 포함)
   - `.env.local`에 `ANTHROPIC_API_KEY`가 없거나 200이 아님 → `"status": "blocked"`, `"blocked_reason": "ANTHROPIC_API_KEY를 .env.local에 채우세요. console.anthropic.com → API Keys에서 발급. (응답 코드: NNN)"` 후 즉시 중단
   - 코드가 3회 수정 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
5. 이 step이 재실행되어 파일이 이미 존재하면 다시 만들지 말고, AC와 API 키 확인만 수행한 뒤 상태를 갱신하라.

## 금지사항

- 실제 Claude API를 호출하는 테스트를 만들지 마라. 이유: 비용·네트워크·비결정성 (ADR-007).
- 응답 텍스트에서 정규식이나 `JSON.parse`로 결과를 뽑지 마라. 이유: tool use 강제로 통일 (ADR-005).
- `ANTHROPIC_API_KEY`를 `NEXT_PUBLIC_`로 노출하거나 클라이언트 컴포넌트에서 이 모듈을 import 하지 마라. 이유: CLAUDE.md CRITICAL.
- API 라우트나 화면을 만들지 마라. 이유: step 5, 7의 범위다.
- 이미지 축소·PDF 페이지 분할을 구현하지 마라. 이유: PRD MVP 제외.
- 기존 테스트를 깨뜨리지 마라.
