# Step 2: db-schema

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/ARCHITECTURE.md` 2절(DB·ORM 행), 5.7(`users` 표를 두지 않는다), 6절(데이터 모델 전체), 10절(`DATABASE_URL`), 12절 ADR-2·ADR-13·ADR-24, 13.1(Drizzle + Neon 확인 결과)
- `/docs/PRD.md` 8절(데이터 항목), F9(사용량은 지워도 줄지 않는다)
- `/AGENTS.md` (모든 DB 접근에 user_id 조건, 테스트는 외부 서비스를 부르지 않는다)
- 이전 step이 만든 파일: `/package.json`, `/tsconfig.json`, `/vitest.config.ts`, `/eslint.config.mjs`, `/lib/categories.ts`, `/lib/messages.ts`

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 작업

Drizzle 스키마, DB 클라이언트, 마이그레이션을 만들고 **테스트 DB**에 적용한다. `.env.local`의 `DATABASE_URL`은 테스트용 Neon 프로젝트(`slipscan-test`)여야 한다. 이 step은 그 DB만 쓴다. 마이그레이션 전에 연결 대상의 **호스트 이름만**(연결 문자열 전체가 아니다) 출력해 summary에 적는다. 호스트나 DB 이름이 시연용(`slipscan-demo`)으로 보이면 아무것도 적용하지 말고 `blocked`로 멈춘다.

설치: `drizzle-orm`, `@neondatabase/serverless`(dependencies), `drizzle-kit`, `tsx`(devDependencies). `^메이저` 범위로 적는다.

### 1. `lib/db/schema.ts` — 표 4개 (ARCH 6절 그대로)

```
documents
  id              uuid PK (defaultRandom)
  user_id         text        NOT NULL   -- Clerk userId
  doc_type        text        NOT NULL   -- 'receipt' | 'statement' | 'other' | 'unknown'(처리 전)
  status          text        NOT NULL   -- 'processing' | 'completed' | 'failed'
  failure_reason  text
  original_url    text        NOT NULL   -- Blob URL
  original_mime   text        NOT NULL
  page_count      int                    -- PDF만
  model_used      text
  uploaded_at     timestamptz NOT NULL DEFAULT now()
  processed_at    timestamptz
  INDEX (user_id, uploaded_at DESC)

transactions
  id               uuid PK (defaultRandom)
  document_id      uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE
  user_id          text NOT NULL
  transacted_at    timestamptz NOT NULL
  date_estimated   boolean NOT NULL DEFAULT false
  merchant_name    text
  total_amount     bigint                 -- KRW, NULL = 미인식, 0·음수 허용
  card_last4       text
  category         text NOT NULL          -- CategoryKey
  is_duplicate     boolean NOT NULL DEFAULT false
  duplicate_of     uuid REFERENCES transactions(id) ON DELETE SET NULL
  created_at       timestamptz NOT NULL DEFAULT now()
  INDEX (user_id, transacted_at)

reports
  id            uuid PK (defaultRandom)
  user_id       text NOT NULL
  month         text NOT NULL            -- 'YYYY-MM'
  status        text NOT NULL            -- 'generating' | 'completed' | 'abandoned'
  content_md    text
  model_used    text
  created_at    timestamptz NOT NULL DEFAULT now()
  completed_at  timestamptz
  INDEX (user_id, created_at DESC)

usage_log
  id            uuid PK                  -- 기본값 없음. 호출자가 준다(문서는 uploadId, 보고서는 새 uuid)
  user_id       text NOT NULL
  kind          text NOT NULL            -- 'document' | 'report'
  created_at    timestamptz NOT NULL DEFAULT now()
  document_id   uuid                     -- FK 아님. 문서가 지워져도 남는다
  INDEX (user_id, created_at)
```

```ts
// schema.ts가 내보내는 것: 표 documents, transactions, reports, usageLog 와 아래 타입
export type DocType = 'receipt' | 'statement' | 'other' | 'unknown'
export type DocumentStatus = 'processing' | 'completed' | 'failed'
export type ReportStatus = 'generating' | 'completed' | 'abandoned'
export type UsageKind = 'document' | 'report'
```

- 글자 열의 값 제한은 pg enum이 아니라 `text().$type<DocType>()` 식으로 타입만 건다. `category`는 `$type<CategoryKey>()`(`lib/categories.ts`).
- `total_amount`는 `bigint({ mode: 'number' })`.
- `timestamptz`는 `timestamp({ withTimezone: true })`.

### 2. `lib/db/client.ts`

```ts
export function getDb(): Db            // 처음 부를 때 Pool을 만든다. import만으로는 연결하지 않는다
export type Db
export type Tx                          // db.transaction 콜백의 인자 타입
```

확인된 사실(2026-09-18 조사): `import { Pool, neonConfig } from '@neondatabase/serverless'`, `drizzle({ client: pool })`는 `drizzle-orm/neon-serverless`에서 가져온다. `db.transaction(async (tx) => …)`는 콜백이 던지면 롤백한다. Node 22에는 전역 WebSocket이 있다. 먼저 `ws` 없이 아래 확인 스크립트를 돌려 보고, 트랜잭션이 되지 않을 때만 `ws`를 설치해 `neonConfig.webSocketConstructor`에 지정한다. 마이그레이션은 `drizzle-kit generate` → `drizzle-kit migrate`다. 설치된 패키지의 타입 정의와 다르면 타입 정의가 우선이다. 다르면 summary에 적어라.

### 3. 마이그레이션

- `drizzle.config.ts`: `dialect: 'postgresql'`, `schema: './lib/db/schema.ts'`, `out: './drizzle'`, `dbCredentials.url = process.env.DATABASE_URL`. 파일 맨 위에서 `.env.local`이 있으면 `process.loadEnvFile('.env.local')`로 읽는다(Node 22 내장. dotenv를 설치하지 않는다).
- `package.json` scripts: `"db:generate": "drizzle-kit generate"`, `"db:migrate": "drizzle-kit migrate"`.
- `npm run db:generate`로 만든 `drizzle/`의 SQL과 meta 파일을 커밋한다. 그다음 `npm run db:migrate`로 테스트 DB에 적용한다.

### 4. `scripts/db-smoke.ts` — 트랜잭션 확인 도구

`.env.local`을 `process.loadEnvFile`로 읽고, `getDb().transaction` 안에서 `usage_log`에 `user_id = 'smoke-test'` 행을 하나 넣은 뒤 일부러 던진다. 그 뒤 `user_id = 'smoke-test'` 행이 0개인지 확인한다. 맞으면 `ok`를 출력하고 0으로, 아니면 이유를 출력하고 0이 아닌 코드로 끝난다. Pool이 열려 있으면 스크립트가 끝나지 않으므로 마지막에 `process.exit`로 끝낸다. 실행: `npx tsx scripts/db-smoke.ts`.

### 5. 단위 테스트 `lib/db/schema.test.ts` (DB에 접속하지 않는다)

`drizzle-orm/pg-core`의 `getTableConfig`로 확인한다: 표 이름이 `documents`, `transactions`, `reports`, `usage_log`다 / `usage_log`에는 외래 키가 하나도 없다 / `transactions`에는 외래 키가 두 개다(`document_id` cascade, `duplicate_of` set null) / 위 네 인덱스가 있다. 테스트를 먼저 쓴다.

### 핵심 규칙

- 드라이버는 `Pool`이다. 이유: Claude 응답 뒤의 DB 쓰기를 한 트랜잭션으로 묶어야 한다(ADR-24).
- `lib/db/client.ts`를 import하는 것만으로는 DB에 연결하지 않는다. 이유: 뒤 step의 단위 테스트가 DB 없이 돈다.
- `usage_log.document_id`에 외래 키를 걸지 않는다. 이유: 문서를 지워도 사용량이 줄면 안 된다(PRD F9, ADR-13).
- `users` 표를 만들지 않는다. 사용자 식별자는 Clerk `userId` 문자열이다(ARCH 5.7).
- 연결 문자열을 출력하거나 로그에 남기지 않는다.

## Acceptance Criteria

```bash
set -eu
npm run lint
npm run build
npm run test
npm run db:generate
BEFORE="$(ls drizzle/*.sql | sort)"
npm run db:generate
test "$BEFORE" = "$(ls drizzle/*.sql | sort)"     # 두 번째 실행은 새 파일을 만들지 않는다
# 두 번 실행해도 성공한다
npm run db:migrate
npm run db:migrate
npx tsx scripts/db-smoke.ts | grep -q '^ok$'
if grep -rn "drizzle-kit push" package.json; then echo "AC 실패: 있으면 안 되는 것이 발견됐다(위 출력)"; exit 1; fi
if grep -rnE "from 'drizzle-orm/neon-http'|neon\(" lib/db; then echo "AC 실패: 있으면 안 되는 것이 발견됐다(위 출력)"; exit 1; fi
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 4절 디렉토리 구조를 따르는가(`lib/db/schema.ts`, `lib/db/client.ts`, `drizzle/`, `scripts/db-smoke.ts`)?
   - ADR 기술 스택을 벗어나지 않았는가(Neon `Pool` + `drizzle-orm/neon-serverless`)?
   - AGENTS.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/0-foundation/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단. 해당 조건: `.env.local`에 `DATABASE_URL`이 없거나, DB에 접속할 수 없다(인증 실패, 네트워크 차단).

summary에 담을 것: 표와 타입의 export 이름, `getDb`·`Db`·`Tx`, `ws`가 필요했는지, 마이그레이션 파일 이름, npm 스크립트 `db:generate`·`db:migrate`.

## 금지사항

- `drizzle-kit push`를 쓰지 마라. 이유: 마이그레이션 SQL이 남지 않아 시연용 DB에 같은 구조를 다시 만들 수 없다.
- HTTP 드라이버(`neon()`, `drizzle-orm/neon-http`)를 쓰지 마라. 이유: 트랜잭션이 되지 않는다(ADR-24).
- `users` 표, pg enum, 트리거, advisory lock을 만들지 마라. 이유: ARCH 5.7과 PRD 10.1.
- 모듈 최상위에서 Pool을 만들거나 질의하지 마라. 이유: 단위 테스트가 DB 없이 돌아야 한다.
- Vitest 테스트에서 DB에 접속하지 마라. 이유: 테스트는 외부 서비스를 부르지 않는다. 접속 확인은 `scripts/db-smoke.ts`가 한다.
- `.env.local`의 `DATABASE_URL`이 아닌 다른 DB 주소를 쓰지 마라. 이유: 시연용 DB(`slipscan-demo`)는 사용자가 배포 전에 직접 마이그레이션한다.
- `.env.local`의 값을 출력·커밋하지 마라. 이유: 비밀값이다.
- 조회·집계 함수를 만들지 마라. 이유: `1-documents`의 해당 step에서 만든다.
- 기존 테스트를 깨뜨리지 마라
