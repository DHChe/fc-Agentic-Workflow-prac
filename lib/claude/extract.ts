import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

import { CATEGORY_KEYS } from "@/lib/categories";
import type { FailureCode } from "@/lib/messages";

import { getClaudeClient, getModel, isTestMode } from "./client";
import { pickFixtureName, RECEIPT_OK, throwFailApi } from "./fixtures";
import {
  EXTRACT_SYSTEM_PROMPT,
  buildExtractUserText,
} from "./prompts/extract";
import {
  cleanCardLast4,
  extractionSchema,
  type ExtractionResult,
} from "./schemas";

const TEST_FIXTURE_DELAY_MS = 1_500;
const CATEGORY_KEY_SET: ReadonlySet<string> = new Set(CATEGORY_KEYS);

export type ExtractInput =
  | { kind: "image"; jpeg: Buffer }
  | { kind: "pdf"; pdf: Buffer };

export class ExtractionError extends Error {
  constructor(public readonly code: FailureCode) {
    super(code);
    this.name = "ExtractionError";
  }
}

export function checkStopReason(
  stopReason: string | null,
): null | "unreadable" | "unparsable" {
  if (stopReason === "end_turn") {
    return null;
  }

  return stopReason === "refusal" ? "unreadable" : "unparsable";
}

type FinalMessage = {
  stop_reason: string | null;
  content: ReadonlyArray<{ type: string; text?: string }>;
};

// 구조화 출력의 JSON 스키마는 enum을 강제하지 못한다(13.1: SDK가 description으로 내린다).
// 목록 밖 카테고리 하나 때문에 문서 전체를 실패시키지 않고 PRD F4의 "모르면 기타"를 따라
// zod 검증 전에 바꾼다. docType은 세 값뿐이고 틀리면 분류 자체가 무의미하므로 그대로 둔다.
function fallbackUnknownCategories(payload: unknown): unknown {
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("transactions" in payload) ||
    !Array.isArray(payload.transactions)
  ) {
    return payload;
  }

  return {
    ...payload,
    transactions: payload.transactions.map((transaction: unknown) => {
      if (typeof transaction !== "object" || transaction === null) {
        return transaction;
      }

      const { category } = transaction as { category?: unknown };

      return typeof category === "string" && CATEGORY_KEY_SET.has(category)
        ? transaction
        : { ...transaction, category: "other" };
    }),
  };
}

export function readExtraction(final: FinalMessage): ExtractionResult {
  const stopFailure = checkStopReason(final.stop_reason);
  if (stopFailure !== null) {
    throw new ExtractionError(stopFailure);
  }

  const textBlock = final.content.find((block) => block.type === "text");
  if (textBlock?.text === undefined) {
    throw new ExtractionError("unparsable");
  }

  let payload: unknown;

  try {
    payload = JSON.parse(textBlock.text);
  } catch {
    throw new ExtractionError("unparsable");
  }

  const parsed = extractionSchema.safeParse(fallbackUnknownCategories(payload));
  if (!parsed.success) {
    throw new ExtractionError("unparsable");
  }

  return {
    ...parsed.data,
    transactions: parsed.data.transactions.map((transaction) => ({
      ...transaction,
      cardLast4: cleanCardLast4(transaction.cardLast4),
    })),
  };
}

async function waitForTestFixture(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, TEST_FIXTURE_DELAY_MS));
}

export async function extractDocument(
  input: ExtractInput | null,
  opts: { fileName: string; today: string; jobId: string },
): Promise<{ result: ExtractionResult; model: string }> {
  if (isTestMode()) {
    await waitForTestFixture();

    if (pickFixtureName(opts.fileName) === "fail-api") {
      throwFailApi();
    }

    return { result: RECEIPT_OK, model: "test-fixture" };
  }

  if (input === null) {
    throw new ExtractionError("unknown");
  }

  const model = getModel();
  const documentBlock =
    input.kind === "image"
      ? {
          type: "image" as const,
          source: {
            type: "base64" as const,
            media_type: "image/jpeg" as const,
            data: input.jpeg.toString("base64"),
          },
        }
      : {
          type: "document" as const,
          source: {
            type: "base64" as const,
            media_type: "application/pdf" as const,
            data: input.pdf.toString("base64"),
          },
        };
  const { schema } = zodOutputFormat(extractionSchema);
  const stream = getClaudeClient().messages.stream({
    model,
    max_tokens: 32_000,
    system: EXTRACT_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          documentBlock,
          { type: "text", text: buildExtractUserText(opts.today) },
        ],
      },
    ],
    output_config: {
      format: { type: "json_schema", schema },
      effort: "low",
    },
  });
  const final = await stream.finalMessage();

  console.log(
    JSON.stringify({
      jobId: opts.jobId,
      step: "extract",
      stop_reason: final.stop_reason,
      usage: final.usage,
    }),
  );

  return { result: readExtraction(final), model };
}
