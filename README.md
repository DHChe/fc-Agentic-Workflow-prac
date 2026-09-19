# SlipScan

영수증 사진과 카드 명세서 PDF를 올리면 **Claude가 거래 내역을 읽어 표로 정리하고, 월별 지출 통계와 보고서를 만드는** 웹 앱.

### 👉 시연: **https://slipscan-demo.vercel.app**

가입할 필요 없습니다. 랜딩의 **"시연 계정으로 들어가기"** 를 누르면 미리 채워진 대시보드로 바로 들어갑니다.

> **포트폴리오·데모용 MVP입니다.** 실제 회계 업무에 쓰기 위한 것이 아닙니다. 의도적으로 뺀 기능과 알고 감수한 한계는 [`docs/PRD.md`](docs/PRD.md) 10절에 전부 적어 두었습니다.
>
> 시연 계정은 방문자가 함께 씁니다. 다른 사람이 올린 문서가 섞여 보일 수 있고, 관리자가 가끔 초기 상태로 되돌립니다.

---

## 5분 시연 흐름

1. **"시연 계정으로 들어가기"** — 아이디·비밀번호 없이 입장 (서버가 일회용 로그인 표를 발급)
2. **대시보드** — 문서 10건, 거래 14행, 지난달 보고서 1건이 미리 들어 있음
3. **"샘플로 해보기"** — 준비된 영수증 1장이 업로드되고 처리가 시작됨
4. **결과 확인** — 가맹점·금액·날짜·카테고리가 표로. 그 달 통계에 방금 건이 더해짐
5. **"이 달 보고서 만들기"** — 글이 실시간으로 써지는 것을 봄

초 단위 여정과 화면 문구는 [`docs/USER_FLOWS.md`](docs/USER_FLOWS.md)에 있습니다.

---

## 설계에서 신경 쓴 것

| | |
|---|---|
| **브라우저 → 저장소 직접 업로드** | 서버 요청 본문 한도(4.5MB)가 10MB 사진을 막습니다. 파일 본문은 서버를 거치지 않고 Vercel Blob으로 바로 올라갑니다 |
| **숫자는 SQL, 서술만 Claude** | 통계 금액·건수는 전부 SQL이 계산합니다. Claude는 그 숫자를 받아 문장만 씁니다. 계산 오류가 원천적으로 없습니다 |
| **구조화 출력 + zod 이중 검증** | 추출은 JSON 스키마로 받고 zod로 한 번 더 검사합니다. 형식이 깨진 응답이 DB로 흘러가지 않습니다 |
| **사용량은 토큰 발급 시점에 기록** | 업로드 허가를 내주는 순간 1회로 셉니다. 토큰만 받아 가는 방식으로 저장소 월 한도를 우회하는 길을 막습니다 |
| **보고서는 스트리밍, 문서는 비동기** | 보고서는 글이 써지는 것이 보여야 해서 동기 스트리밍, 문서 처리는 `after()` 후처리로 |
| **중복 감지** | 같은 결제가 영수증과 명세서에 함께 들어오면 배지를 붙이고 집계에서 뺍니다 |
| **모든 조회에 `user_id` 조건** | 남의 id로 요청하면 404. 예외 없습니다 |

결정의 이유와 검토한 대안은 [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) 12절에 ADR 29개로 정리돼 있습니다.

---

## 기술 스택

- **Next.js 16** (App Router, 루트 `app/`, 라우트 가드는 `proxy.ts`) · TypeScript strict
- **Tailwind CSS + shadcn/ui** — 라이트 전용
- **Clerk** — 초대 전용(Restricted) 모드, 이메일+비밀번호
- **Neon Postgres + Drizzle ORM**
- **Vercel Blob** — 브라우저 직접 업로드
- **Claude API** (`@anthropic-ai/sdk`) — `claude-opus-5`
- **Vitest** (단위 278개) · **Cypress** (화면 3개 시나리오)
- Vercel Hobby 배포, 전 구성요소 싱가포르 `sin1`

---

## 문서

설계 기준(SOT)은 앞의 셋입니다. 어긋나면 PRD가 기준입니다.

| 문서 | 무엇이 들어 있나 |
|---|---|
| [`docs/PRD.md`](docs/PRD.md) | **무엇을** 만드는가. 범위, 기능, 제외 목록, 감수한 한계 |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | **어떻게** 만드는가. 구조, 스키마, API, 배포·운영, ADR 29개 |
| [`docs/USER_FLOWS.md`](docs/USER_FLOWS.md) | **흐름과 문구**. 여정, 유스케이스, 화면 문장, 리허설 체크리스트 |
| [`docs/design.md`](docs/design.md) | 색·글꼴·부품·배치 |
| [`docs/setup.md`](docs/setup.md) | 처음부터 직접 띄우는 순서 |

---

## 로컬에서 돌려보기

외부 서비스 계정 4개(Vercel·Neon·Clerk·Anthropic)가 필요합니다. 순서는 [`docs/setup.md`](docs/setup.md)에 있습니다.

```bash
npm install
cp .env.example .env.local   # 값을 채운다 (setup.md 참고)
npm run db:migrate           # 테이블 생성
npm run dev
```

### 명령어

| | |
|---|---|
| `npm run dev` | 개발 서버 |
| `npm run build` | 프로덕션 빌드 (타입 검사 포함) |
| `npm run lint` | ESLint |
| `npm run test` | Vitest 단일 실행 |
| `npm run e2e` | Cypress (테스트 모드 fixture 사용) |
| `npm run db:migrate` | 마이그레이션 적용 |
| `npm run seed:demo` | 시연 데이터 넣기 (`--verify`로 확인) |

테스트는 실제 Claude·Blob·Clerk를 호출하지 않습니다. `SLIPSCAN_TEST_MODE=1`의 fixture를 씁니다.
