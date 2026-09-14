# Step 1: core-types

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `docs/ARCHITECTURE.md` — "핵심 인터페이스", "데이터 모델" 절
- `docs/PRD.md` — "추출 결과 스키마 (AnalysisResult)" 표. 필드·타입을 그대로 따른다
- `docs/ADR.md` — ADR-003 (nullable 정책), ADR-005 (JSON Schema 변환), ADR-006
- `package.json`, `vitest.config.ts` — step 0에서 만든 설정

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 작업

이 step은 도메인 타입, zod 스키마, 서비스 인터페이스, 순수 유틸만 만든다. 외부 SDK를 import 하지 않는다.

### 1. `src/types/analysis.ts`

```ts
export const DOCUMENT_TYPES = ['receipt', 'card_statement', 'unknown'] as const
export type DocumentType = (typeof DOCUMENT_TYPES)[number]

export const EXPENSE_CATEGORIES = ['식비', '교통', '숙박', '소모품', '접대', '통신', '기타'] as const
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]

export interface LineItem { name: string; quantity: number | null; amount: number }
export interface Transaction { date: string | null; merchant: string; amount: number; category: ExpenseCategory | null }

export interface AnalysisResult {
  documentType: DocumentType
  merchant: string | null
  date: string | null          // YYYY-MM-DD
  currency: string             // 기본 'KRW'
  totalAmount: number
  vatAmount: number | null
  category: ExpenseCategory | null
  items: LineItem[]
  transactions: Transaction[]
  confidence: number           // 0~1
  notes: string | null
}

export interface Analysis {
  id: string; userId: string; fileName: string; mimeType: string; storagePath: string
  result: AnalysisResult; createdAt: string   // ISO 8601
  editedAt: string | null                     // 사용자가 결과를 수정한 시각. 수정 전 null
}

export const EDITABLE_FIELDS = ['merchant', 'date', 'totalAmount', 'vatAmount', 'category'] as const
export type EditableFields = Pick<AnalysisResult, (typeof EDITABLE_FIELDS)[number]>

export interface AnalysisSummary {
  id: string; fileName: string; mimeType: string; createdAt: string
  documentType: DocumentType; merchant: string | null; date: string | null
  currency: string; totalAmount: number; category: ExpenseCategory | null
}

export const ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'] as const
export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number]
export const MAX_PDF_BYTES = 20 * 1024 * 1024
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
```

### 2. `src/lib/schemas/analysis.ts` (zod v4)

```ts
export const analysisResultSchema: z.ZodType<AnalysisResult>      // 아래 규칙 적용
export const createAnalysisRequestSchema                          // { storagePath: string(1~512), fileName: string(1~255), mimeType: enum(ALLOWED_MIME_TYPES) }
export type CreateAnalysisRequest = z.infer<typeof createAnalysisRequestSchema>
export const updateAnalysisRequestSchema                          // Partial<EditableFields>. 사용자 입력이므로 관대하지 않다 (아래 규칙)
export type UpdateAnalysisRequest = z.infer<typeof updateAnalysisRequestSchema>
export type ToolInputSchema = { type: 'object'; properties: Record<string, unknown>; required?: string[] }  // 반드시 type 별칭. interface는 암시적 인덱스 시그니처가 없어 SDK의 `Tool['input_schema']`([k: string]: unknown)에 할당되지 않는다
export const analysisResultJsonSchema: ToolInputSchema           // z.toJSONSchema(analysisResultSchema)에서 $schema 제거 후 캐스팅
```

핵심 규칙:
- LLM 출력은 관대하게 받는다: `items`·`transactions`는 누락 시 `[]`, `notes`·`merchant`·`date`·`vatAmount`·`category`는 누락 시 `null`, `currency` 누락 시 `'KRW'`, `confidence`는 0~1 밖이거나 누락이면 `0.5`. `documentType`과 `totalAmount`는 필수.
- `date`는 `YYYY-MM-DD` 형식만 허용하고 아니면 `null`로 바꾼다 (에러가 아니라 완화).
- `category`가 목록에 없는 값이면 `null`로 바꾼다.
- `z.toJSONSchema()`가 실패하는 zod 기능(`transform`, `preprocess`, `z.date` 등)은 쓰지 마라. 완화 로직은 아래 검증된 조합만 사용한다 (zod 4.6에서 `toJSONSchema` 변환과 파싱 모두 확인됨):
  - 누락 시 null: `z.string().max(200).nullable().catch(null)` (merchant, 품목·거래의 name/merchant는 200자, notes는 2000자. 초과하면 null)
  - 누락 시 빈 배열, 500개 초과 시 빈 배열: `z.array(...).max(500).catch([])`
  - 형식 불일치 시 null: `z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().catch(null)`, `z.enum(EXPENSE_CATEGORIES).nullable().catch(null)`
  - 범위 밖이면 기본값: `z.number().min(0).max(1).catch(0.5)`
  - `currency`: `z.string().default('KRW')`
- `analysisResultJsonSchema`는 `z.toJSONSchema(analysisResultSchema, { io: 'input' })` 결과에서 최상위 `$schema` 키를 제거하고 `ToolInputSchema`로 캐스팅한 객체다. `io: 'input'`을 쓰는 이유: 기본 모드(`output`)는 `.default()` 필드까지 `required`에 넣어 모델에게 `items`·`notes` 등을 강제하지만, `input` 모드는 그 필드들을 선택으로 두어 "누락 시 기본값" 의도와 맞는다. `.catch()` 필드(`date`, `category`, `confidence`)는 `input` 모드에서도 `required`에 남는데, 이는 의도된 것이다 (모델이 항상 값 또는 null을 내도록). Anthropic SDK의 `Tool['input_schema']`가 리터럴 `type: 'object'`를 요구하므로 `Record<string, unknown>`으로 두면 step 4에서 타입 에러가 난다. 반드시 최상위 `type: "object"`이고 `properties`에 11개 필드가 모두 있어야 한다.
- `z.infer<typeof analysisResultSchema>`가 `AnalysisResult`에 할당 가능한지 타입 수준에서 보장하라.
- `updateAnalysisRequestSchema`는 LLM 출력과 달리 엄격하다: `merchant` trim 후 1~100자 또는 null, `date` `YYYY-MM-DD` 아니면 에러, `totalAmount` 유한한 숫자(음수 허용: 환불 영수증), `vatAmount` 유한한 숫자 또는 null, `category` `EXPENSE_CATEGORIES` 또는 null. 모든 필드 optional이지만 최소 1개는 있어야 한다(`refine`). 알 수 없는 키는 거부(`strict`). 한국어 에러 메시지.

### 3. 서비스 인터페이스

`src/services/analyzer/types.ts`, `src/services/repository/types.ts`, `src/services/storage/types.ts`를 ARCHITECTURE.md "핵심 인터페이스"의 시그니처 그대로 만든다. `AnalyzerError`(code: `unsupported_file` | `invalid_output` | `rejected_input` | `provider_error`)도 여기서 정의한다.

### 4. 순수 유틸

```ts
// src/lib/utils/format.ts
export function formatAmount(amount: number, currency?: string): string  // KRW → "12,000원", 그 외 → "12,000 USD"
export function formatDate(iso: string | null): string                    // 'YYYY-MM-DD' 그대로, null → '-'
export function formatDateTime(iso: string): string                       // 'YYYY-MM-DD HH:mm' (Asia/Seoul)

// src/lib/utils/summary.ts
export interface DashboardSummary { count: number; monthTotal: number }
export function monthRange(now: Date): { from: string; to: string }   // Asia/Seoul 기준 이번 달 첫날과 마지막날, 'YYYY-MM-DD'
export function computeSummary(items: AnalysisSummary[], now: Date): DashboardSummary
// count = items.length. monthTotal = date가 monthRange(now) 안이고 currency === 'KRW'인 항목의 totalAmount 합.
// date가 null인 항목은 제외한다 (PRD 규칙). 대시보드는 조회한 목록(최근 100건)에서 이 함수로 요약을 계산한다.
```

### 5. 테스트 (먼저 작성)

- `src/lib/schemas/analysis.test.ts`: 영수증 샘플과 카드명세서 샘플이 통과한다. `totalAmount` 누락은 실패한다. `items` 누락 → `[]`, `date: '2026/09/01'` → `null`, `category: '기타등등'` → `null`, `confidence: 1.7` → `0.5`. `analysisResultJsonSchema.type === 'object'`이고 `properties`에 11개 키가 있으며, `required`에 `documentType`·`totalAmount`가 있고 `items`·`notes`·`merchant`는 없다. `createAnalysisRequestSchema`가 `image/gif`를 거부한다. `updateAnalysisRequestSchema`는 `{}`·`{ totalAmount: NaN }`·`{ date: '2026/09/01' }`·`{ items: [] }`를 거부하고 `{ totalAmount: -12000 }`은 통과시키며 `{ merchant: ' 스타벅스 ' }`를 `'스타벅스'`로 trim 한다.
- `src/lib/utils/format.test.ts`, `src/lib/utils/summary.test.ts`: 위 시그니처의 예시 값을 검증한다. `monthRange(new Date('2026-09-14T15:00:00Z'))` → `{ from: '2026-09-01', to: '2026-09-30' }` (KST 기준. 이 시각은 KST 9월 15일 00:00). `computeSummary`에 이번 달 KRW 2건(12000, -2000), 지난달 KRW 1건, 이번 달 USD 1건, `date: null` 1건을 주면 `{ count: 5, monthTotal: 10000 }`. `formatAmount(-12000)` → `'-12,000원'`.

## Acceptance Criteria

```bash
npm run lint
npm run build
npm run test
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가? (`src/types`, `src/lib/schemas`, `src/lib/utils`, `src/services/*/types.ts`)
   - ADR 기술 스택을 벗어나지 않았는가? (zod v4만 사용)
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가? (외부 SDK import 없음)
3. 결과에 따라 `phases/0-mvp/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"` (생성한 파일 경로와 export 이름을 포함)
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- Supabase·Anthropic 구현체를 만들지 마라. 이유: step 2, 4의 범위다.
- `any`를 쓰지 마라. 이유: strict 모드이며 LLM 출력 경계는 zod가 담당한다.
- PRD의 스키마 필드를 추가·삭제·개명하지 마라. 이유: DB `result` jsonb와 LLM tool schema가 이 타입에 묶인다.
- 기존 테스트를 깨뜨리지 마라.
