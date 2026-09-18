# Step 4: sample-images

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/design.md` 12.2(시연 시드 구성)
- `/docs/PRD.md` F11(시연 계정과 샘플 데이터), F3("샘플로 해보기")
- `/docs/ARCHITECTURE.md` 4절(`scripts/`, `public/samples/`), 11절(시연 데이터 규칙), 13.1(sharp, pdf-lib)
- phase `0-foundation`이 만든 파일: `/scripts/db-smoke.ts`(스크립트 작성 방식의 본보기)
- 이 phase의 이전 step: `/scripts/seed-data.ts`, `/scripts/seed-data.test.ts`(step 3. 그릴 내용의 단일 출처. `SEED_DOCUMENTS`, `SAMPLE_RECEIPT`, 타입 `SeedDocument`·`SeedTransaction`)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 작업

`scripts/seed-data.ts`를 읽어 가짜 영수증·명세서 이미지를 그려내는 생성기를 만들고, 한 번 실행해 산출물을 저장소에 넣는다. 이미지는 이 기기에서 한 번 만들어 커밋한다. 앱 실행 중이나 Vercel에서 이미지를 만드는 코드는 없다.

`sharp`와 `pdf-lib`를 설치한다. pdf-lib는 2021년 이후 새 판이 없으므로 **정확한 버전으로 고정**한다(`"pdf-lib": "1.17.1"`처럼 `^` 없이). sharp는 `^메이저`.

### 만들 파일

- `scripts/generate-samples.ts` — 이미지 생성기
- 산출물(커밋한다): `scripts/seed-assets/01.jpg` … `10.jpg`(`SEED_DOCUMENTS`의 `assetFile`과 같은 경로), `scripts/seed-assets/statement-check.pdf`, `public/samples/receipt-sample.jpg`

### 이미지 생성기 (`scripts/generate-samples.ts`)

- `npx tsx scripts/generate-samples.ts`로 실행한다. `SEED_DOCUMENTS`와 `SAMPLE_RECEIPT`를 읽어 SVG를 만들고 sharp로 JPEG(품질 85 안팎, 장당 1MB 미만)로 굽는다.
- 영수증: 옅은 회색 바닥 위의 흰 종이, 가로 1080px 이상, 크고 진한 글자. 들어갈 것: 가맹점명, 거래일시, 품목 2~3줄(합이 합계와 맞게), 합계, `카드 ****-****-****-1234`, 승인 문구. 10번 영수증은 거래일시 줄을 번지거나 잘린 모양으로 그려 읽을 수 없게 한다.
- 명세서(07.jpg): 머리에 카드 끝4와 이용 기간, 아래에 5줄짜리 표(이용일, 가맹점, 금액). 취소 줄은 `-8,900`으로 음수임이 분명해야 한다.
- `statement-check.pdf`: 07.jpg를 pdf-lib의 `embedJpg`로 한 쪽짜리 PDF에 넣은 것이다. step 6의 실제 호출 확인에만 쓴다(시드에는 쓰지 않는다).
- `receipt-sample.jpg`는 실제 Claude가 읽는다. 금액·날짜·가맹점·카드 끝4가 또렷해야 한다.
- 한글 글리프는 시스템 글꼴에 달려 있다. **만든 JPG를 직접 열어 한글이 네모(□)로 깨지지 않았는지 확인하라.** 깨졌으면 SVG의 `font-family`를 이 기기에 설치된 한글 글꼴(macOS는 `Apple SD Gothic Neo`)로 지정하거나 fontconfig가 그 글꼴을 찾게 한다. 무엇을 했는지 summary에 적는다.
- 영수증 10장은 모양이 같은 틀 하나에 값만 바꿔 그린다(틀을 여러 개 만들지 않는다). 명세서 틀 하나를 더한다.
- 금액·날짜·가맹점명은 `scripts/seed-data.ts`에서만 읽는다. 생성기 안에 다시 적지 않는다. `scripts/seed-data.ts`의 값은 고치지 않는다.

### 확인된 라이브러리 사실 (2026-09-18 조사)

설치된 패키지의 타입 정의와 다르면 타입 정의가 우선이다. 다르면 summary에 적어라.

- sharp는 SVG 버퍼를 입력으로 받는다: `sharp(Buffer.from(svg)).jpeg({ quality: 85 }).toFile(path)`. 메타데이터는 `await sharp(path).metadata()`.
- pdf-lib: `const pdf = await PDFDocument.create(); const img = await pdf.embedJpg(bytes); const page = pdf.addPage([w, h]); page.drawImage(img, { x: 0, y: 0, width: w, height: h }); await pdf.save()`.

## Acceptance Criteria

```bash
set -eu
npm run lint
npm run build
npm run test
npx tsx scripts/generate-samples.ts
test "$(ls scripts/seed-assets/*.jpg | wc -l)" -eq 10
test -f scripts/seed-assets/statement-check.pdf
test -f public/samples/receipt-sample.jpg
node -e "
const sharp=require('sharp'),fs=require('fs');
(async()=>{const files=[...fs.readdirSync('scripts/seed-assets').filter(f=>f.endsWith('.jpg')).map(f=>'scripts/seed-assets/'+f),'public/samples/receipt-sample.jpg'];
for(const f of files){const m=await sharp(f).metadata();const s=fs.statSync(f).size;
if(m.format!=='jpeg'||m.width<1000||s>=1000000){console.error('BAD',f,m.format,m.width,s);process.exit(1)}}
console.log('images ok',files.length)})()"
```

AC와 별개로, 만든 JPG 가운데 `receipt-sample.jpg`, `07.jpg`, `10.jpg`를 직접 열어 한글과 숫자가 읽히는지 눈으로 확인한다.

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가?
   - ADR 기술 스택을 벗어나지 않았는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/1-documents/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 (API 키, 외부 인증, 수동 설정 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

summary에 담을 것: 만든 파일 목록, 한글 글꼴을 어떻게 해결했는지, 생성기를 다시 돌리는 명령.

## 금지사항

- 실제 영수증이나 실존 개인정보를 쓰지 마라. 이유: PRD F11. 시연 계정은 공개 계정이다.
- `scripts/seed-data.ts`의 값을 바꾸거나 시드 값(금액·날짜·가맹점명)을 다른 파일에 다시 적지 마라. 이유: 이미지와 DB 데이터가 어긋난다.
- DB나 Blob에 쓰지 마라. 이유: 이 step은 이미지뿐이다. 시드 실행은 phase `2-reports-demo`의 범위다.
- 헤드리스 브라우저·canvas 등 새 렌더링 의존성을 설치하지 마라. 이유: sharp의 SVG 렌더로 충분하다. 막히면 error로 보고한다.
- 앱 실행 중이나 빌드 때 이미지를 만드는 코드를 넣지 마라. 이유: 이미지는 한 번 만들어 커밋한다. Vercel에는 한글 글꼴이 없다.
- 기존 테스트를 깨뜨리지 마라
