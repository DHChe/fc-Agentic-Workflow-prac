import Anthropic from "@anthropic-ai/sdk";

const DEFAULT_MODEL = "claude-opus-5";
const CLAUDE_TIMEOUT_MS = 240_000;

let client: Anthropic | undefined;
let warnedAboutProductionTestMode = false;

export function isTestMode(): boolean {
  const requested = process.env.SLIPSCAN_TEST_MODE === "1";
  const isProduction = process.env.VERCEL_ENV === "production";

  if (requested && isProduction && !warnedAboutProductionTestMode) {
    console.warn(
      "SLIPSCAN_TEST_MODE is ignored when VERCEL_ENV is production.",
    );
    warnedAboutProductionTestMode = true;
  }

  return requested && !isProduction;
}

export function getModel(): string {
  return process.env.CLAUDE_MODEL || DEFAULT_MODEL;
}

export function getClaudeClient(): Anthropic {
  client ??= new Anthropic({
    maxRetries: 0,
    timeout: CLAUDE_TIMEOUT_MS,
  });

  return client;
}
