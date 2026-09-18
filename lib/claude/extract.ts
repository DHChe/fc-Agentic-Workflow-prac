import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

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
      format: zodOutputFormat(extractionSchema),
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

  const stopFailure = checkStopReason(final.stop_reason);
  if (stopFailure !== null) {
    throw new ExtractionError(stopFailure);
  }

  const parsed = extractionSchema.safeParse(final.parsed_output);
  if (!parsed.success) {
    throw new ExtractionError("unparsable");
  }

  const result: ExtractionResult = {
    ...parsed.data,
    transactions: parsed.data.transactions.map((transaction) => ({
      ...transaction,
      cardLast4: cleanCardLast4(transaction.cardLast4),
    })),
  };

  return { result, model };
}
