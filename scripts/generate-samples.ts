import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { PDFDocument } from "pdf-lib";
import sharp from "sharp";

import {
  SAMPLE_RECEIPT,
  SEED_DOCUMENTS,
  type SeedDocument,
  type SeedTransaction,
} from "./seed-data";

const RECEIPT_WIDTH = 1200;
const RECEIPT_HEIGHT = 1600;
const STATEMENT_WIDTH = 1600;
const STATEMENT_HEIGHT = 1200;
const JPEG_QUALITY = 85;
const FONT_FAMILY =
  "Apple SD Gothic Neo, AppleGothic, Noto Sans CJK KR, sans-serif";

function escapeSvg(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function formatAmount(amount: number): string {
  return amount.toLocaleString("ko-KR");
}

function formatDateTime(value: string): string {
  const [date, time] = value.slice(0, 16).split("T");
  return `${date.replaceAll("-", ".")} ${time}`;
}

function formatShortDate(value: string): string {
  return value.slice(5, 10).replace("-", ".");
}

function formatDate(value: string): string {
  return value.slice(0, 10).replaceAll("-", ".");
}

function splitReceiptTotal(total: number): number[] {
  const first = Math.floor((total * 0.45) / 100) * 100;
  const second = Math.floor((total * 0.3) / 100) * 100;
  return [first, second, total - first - second];
}

function renderReceipt(transaction: Omit<SeedTransaction, "id">): string {
  const items = splitReceiptTotal(transaction.totalAmount);
  const merchant = escapeSvg(transaction.merchantName);
  const date = escapeSvg(formatDateTime(transaction.transactedAt));
  const card = escapeSvg(transaction.cardLast4);
  const dateLine = transaction.dateEstimated
    ? `<g clip-path="url(#dateClip)" filter="url(#dateBlur)" opacity="0.3">
        <text x="382" y="469" class="value">${date}</text>
      </g>
      <rect x="614" y="426" width="190" height="58" fill="#ffffff" opacity="0.96" />`
    : `<text x="382" y="469" class="value">${date}</text>`;

  const itemRows = items
    .map(
      (amount, index) => `<text x="250" y="${650 + index * 74}" class="item">상품·서비스 ${index + 1}</text>
      <text x="936" y="${650 + index * 74}" class="item amount" text-anchor="end">${formatAmount(amount)}</text>`,
    )
    .join("\n");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${RECEIPT_WIDTH}" height="${RECEIPT_HEIGHT}" viewBox="0 0 ${RECEIPT_WIDTH} ${RECEIPT_HEIGHT}">
    <defs>
      <filter id="paperShadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="18" stdDeviation="24" flood-color="#23302f" flood-opacity="0.12" />
      </filter>
      <filter id="dateBlur" x="-20%" y="-70%" width="140%" height="240%">
        <feGaussianBlur stdDeviation="12" />
      </filter>
      <clipPath id="dateClip">
        <rect x="370" y="420" width="355" height="70" />
      </clipPath>
      <style>
        text { font-family: ${FONT_FAMILY}; fill: #172321; }
        .merchant { font-size: 60px; font-weight: 700; letter-spacing: -1px; }
        .sample { font-size: 22px; font-weight: 600; fill: #72807e; letter-spacing: 4px; }
        .label { font-size: 28px; fill: #71807e; }
        .value { font-size: 30px; font-weight: 600; }
        .item { font-size: 31px; }
        .amount { font-variant-numeric: tabular-nums; }
        .total-label { font-size: 36px; font-weight: 700; }
        .total { font-size: 54px; font-weight: 700; font-variant-numeric: tabular-nums; }
        .approval { font-size: 27px; font-weight: 600; fill: #285f5c; }
        .foot { font-size: 23px; fill: #72807e; }
      </style>
    </defs>
    <rect width="1200" height="1600" fill="#eef1f0" />
    <rect x="150" y="68" width="900" height="1464" rx="8" fill="#ffffff" filter="url(#paperShadow)" />
    <text x="600" y="190" text-anchor="middle" class="sample">SLIPSCAN SAMPLE</text>
    <text x="600" y="304" text-anchor="middle" class="merchant">${merchant}</text>
    <line x1="230" y1="364" x2="970" y2="364" stroke="#d9dfde" stroke-width="3" />
    <text x="250" y="469" class="label">거래일시</text>
    ${dateLine}
    <text x="250" y="539" class="label">결제카드</text>
    <text x="382" y="539" class="value">카드 ****-****-****-${card}</text>
    <line x1="230" y1="584" x2="970" y2="584" stroke="#d9dfde" stroke-width="3" stroke-dasharray="10 10" />
    ${itemRows}
    <line x1="230" y1="894" x2="970" y2="894" stroke="#172321" stroke-width="3" />
    <text x="250" y="990" class="total-label">합계</text>
    <text x="950" y="990" text-anchor="end" class="total">${formatAmount(transaction.totalAmount)}원</text>
    <rect x="230" y="1080" width="740" height="108" rx="8" fill="#f1f7f6" />
    <text x="600" y="1147" text-anchor="middle" class="approval">카드 결제가 정상 승인되었습니다</text>
    <text x="600" y="1300" text-anchor="middle" class="foot">본 이미지는 SlipScan 시연을 위해 만든 가상 영수증입니다.</text>
    <text x="600" y="1350" text-anchor="middle" class="foot">실제 사업자·개인정보와 관련이 없습니다.</text>
  </svg>`;
}

function renderStatement(document: SeedDocument): string {
  const transactions = document.transactions;
  const cardLast4 = escapeSvg(transactions[0].cardLast4);
  const periodStart = formatDate(transactions[0].transactedAt);
  const periodEnd = formatDate(
    transactions[transactions.length - 1].transactedAt,
  );
  const rows = transactions
    .map((transaction, index) => {
      const y = 510 + index * 112;
      const amountClass = transaction.totalAmount < 0 ? "negative" : "";
      return `<line x1="140" y1="${y - 55}" x2="1460" y2="${y - 55}" class="row-line" />
      <text x="180" y="${y}" class="cell date">${escapeSvg(formatShortDate(transaction.transactedAt))}</text>
      <text x="420" y="${y}" class="cell merchant">${escapeSvg(transaction.merchantName)}</text>
      <text x="1395" y="${y}" text-anchor="end" class="cell amount ${amountClass}">${formatAmount(transaction.totalAmount)}</text>`;
    })
    .join("\n");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${STATEMENT_WIDTH}" height="${STATEMENT_HEIGHT}" viewBox="0 0 ${STATEMENT_WIDTH} ${STATEMENT_HEIGHT}">
    <defs>
      <style>
        text { font-family: ${FONT_FAMILY}; fill: #172321; }
        .eyebrow { font-size: 22px; font-weight: 600; letter-spacing: 4px; fill: #64716f; }
        .title { font-size: 54px; font-weight: 700; }
        .meta-label { font-size: 24px; fill: #71807e; }
        .meta-value { font-size: 29px; font-weight: 600; }
        .head { font-size: 24px; font-weight: 600; fill: #53615f; }
        .cell { font-size: 31px; }
        .merchant { font-weight: 600; }
        .amount { font-weight: 600; font-variant-numeric: tabular-nums; }
        .negative { fill: #a8342f; }
        .row-line { stroke: #e1e6e5; stroke-width: 2; }
        .foot { font-size: 22px; fill: #71807e; }
      </style>
    </defs>
    <rect width="1600" height="1200" fill="#eef1f0" />
    <rect x="70" y="54" width="1460" height="1092" rx="12" fill="#ffffff" />
    <text x="140" y="138" class="eyebrow">SLIPSCAN SAMPLE CARD</text>
    <text x="140" y="225" class="title">카드 이용 명세서</text>
    <text x="140" y="298" class="meta-label">이용 카드</text>
    <text x="285" y="298" class="meta-value">카드 ****-****-****-${cardLast4}</text>
    <text x="835" y="298" class="meta-label">이용 기간</text>
    <text x="960" y="298" class="meta-value">${periodStart} – ${periodEnd}</text>
    <rect x="120" y="350" width="1360" height="82" rx="6" fill="#f1f4f3" />
    <text x="180" y="402" class="head">이용일</text>
    <text x="420" y="402" class="head">가맹점</text>
    <text x="1395" y="402" text-anchor="end" class="head">이용금액(원)</text>
    ${rows}
    <line x1="140" y1="1015" x2="1460" y2="1015" class="row-line" />
    <text x="800" y="1083" text-anchor="middle" class="foot">본 이미지는 SlipScan 시연을 위해 만든 가상 명세서이며 실제 개인정보를 포함하지 않습니다.</text>
  </svg>`;
}

async function writeJpeg(svg: string, outputPath: string): Promise<void> {
  await mkdir(dirname(outputPath), { recursive: true });
  await sharp(Buffer.from(svg))
    .jpeg({ quality: JPEG_QUALITY })
    .toFile(outputPath);
}

async function writeStatementPdf(statementPath: string): Promise<void> {
  const bytes = await readFile(statementPath);
  const metadata = await sharp(bytes).metadata();

  if (!metadata.width || !metadata.height) {
    throw new Error("명세서 이미지 크기를 확인할 수 없습니다.");
  }

  const pdf = await PDFDocument.create();
  const image = await pdf.embedJpg(bytes);
  const page = pdf.addPage([metadata.width, metadata.height]);
  page.drawImage(image, {
    x: 0,
    y: 0,
    width: metadata.width,
    height: metadata.height,
  });

  const outputPath = resolve(
    process.cwd(),
    "scripts/seed-assets/statement-check.pdf",
  );
  await writeFile(outputPath, await pdf.save());
}

async function main(): Promise<void> {
  let statementPath: string | undefined;

  for (const document of SEED_DOCUMENTS) {
    const outputPath = resolve(process.cwd(), document.assetFile);

    if (document.docType === "statement") {
      await writeJpeg(renderStatement(document), outputPath);
      statementPath = outputPath;
      continue;
    }

    const [transaction] = document.transactions;
    if (!transaction || document.transactions.length !== 1) {
      throw new Error(`영수증 시드 거래 수가 올바르지 않습니다: ${document.id}`);
    }
    await writeJpeg(renderReceipt(transaction), outputPath);
  }

  if (!statementPath) {
    throw new Error("명세서 시드가 없습니다.");
  }

  const samplePath = resolve(process.cwd(), SAMPLE_RECEIPT.assetFile);
  await writeJpeg(renderReceipt(SAMPLE_RECEIPT.transaction), samplePath);
  await writeStatementPdf(statementPath);

  console.log(
    "가짜 영수증·명세서 JPG 11장과 확인용 PDF 1개를 생성했습니다.",
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
