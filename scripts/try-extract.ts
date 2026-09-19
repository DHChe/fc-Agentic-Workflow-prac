import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";

import Anthropic from "@anthropic-ai/sdk";

import { extractDocument, type ExtractInput } from "../lib/claude/extract";
import { toAnalysisJpeg } from "../lib/pipeline/image";
import { inspectPdf, MAX_PDF_PAGES } from "../lib/pipeline/pdf";
import { seoulDateKey } from "../lib/stats/aggregate";

if (existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

type Expectations = {
  amount?: number;
  count?: number;
};

function usage(): never {
  throw new Error(
    "사용법: npx tsx scripts/try-extract.ts <file> [--expect-amount N] [--expect-count N]",
  );
}

function parseInteger(raw: string | undefined, flag: string): number {
  if (raw === undefined || !/^-?\d+$/.test(raw)) {
    throw new Error(`${flag}에는 정수를 입력해야 합니다.`);
  }

  return Number(raw);
}

function parseArgs(args: string[]): { file: string; expected: Expectations } {
  const [file, ...options] = args;
  if (!file || file.startsWith("--")) {
    return usage();
  }

  const expected: Expectations = {};
  for (let index = 0; index < options.length; index += 2) {
    const flag = options[index];
    const raw = options[index + 1];

    if (flag === "--expect-amount") {
      expected.amount = parseInteger(raw, flag);
    } else if (flag === "--expect-count") {
      expected.count = parseInteger(raw, flag);
      if (expected.count < 0) {
        throw new Error("--expect-count에는 0 이상의 정수를 입력해야 합니다.");
      }
    } else {
      return usage();
    }
  }

  return { file, expected };
}

async function prepareInput(file: string): Promise<ExtractInput> {
  const bytes = await readFile(file);
  const extension = extname(file).toLowerCase();

  if ([".jpg", ".jpeg", ".png"].includes(extension)) {
    return { kind: "image", jpeg: await toAnalysisJpeg(bytes) };
  }

  if (extension === ".pdf") {
    const inspection = await inspectPdf(bytes);
    if (!inspection.ok) {
      throw new Error(`PDF를 준비하지 못했습니다: ${inspection.code}`);
    }
    if (inspection.pageCount > MAX_PDF_PAGES) {
      throw new Error(`PDF 페이지가 ${MAX_PDF_PAGES}장을 초과합니다.`);
    }

    return { kind: "pdf", pdf: bytes };
  }

  throw new Error("JPG, PNG, PDF 파일만 확인할 수 있습니다.");
}

function assertExpectations(
  result: Awaited<ReturnType<typeof extractDocument>>["result"],
  expected: Expectations,
): void {
  if (
    expected.count !== undefined &&
    result.transactions.length !== expected.count
  ) {
    throw new Error(
      `거래 건수 불일치: expected=${expected.count}, actual=${result.transactions.length}`,
    );
  }

  if (
    expected.amount !== undefined &&
    result.transactions[0]?.totalAmount !== expected.amount
  ) {
    throw new Error(
      `첫 거래 금액 불일치: expected=${expected.amount}, actual=${String(result.transactions[0]?.totalAmount)}`,
    );
  }
}

async function main(): Promise<void> {
  if (process.env.SLIPSCAN_TEST_MODE === "1") {
    throw new Error(
      "SLIPSCAN_TEST_MODE=1에서는 실제 Claude 호출 확인을 실행할 수 없습니다.",
    );
  }

  const { file, expected } = parseArgs(process.argv.slice(2));
  const input = await prepareInput(file);
  const startedAt = performance.now();
  const extraction = await extractDocument(input, {
    fileName: file,
    today: seoulDateKey(new Date()),
    jobId: randomUUID(),
  });
  const elapsedSeconds = (performance.now() - startedAt) / 1_000;

  console.log(JSON.stringify(extraction, null, 2));
  console.log(JSON.stringify({ elapsedSeconds: Number(elapsedSeconds.toFixed(3)) }));

  assertExpectations(extraction.result, expected);
}

main().catch((error: unknown) => {
  if (error instanceof Anthropic.APIError) {
    console.error(JSON.stringify({ error: error.name, status: error.status }));
  } else {
    console.error(error instanceof Error ? error.message : "추출 확인 실패");
  }
  process.exitCode = 1;
});
