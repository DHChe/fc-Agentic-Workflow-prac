import { z } from "zod";

import { MESSAGES } from "@/lib/messages";
import type { PathCheck } from "@/lib/upload/validate";
import { DAILY_LIMIT } from "@/lib/usage/limit";

export type UploadTokenDecision =
  | { ok: true }
  | {
      ok: false;
      status: 400 | 401 | 429;
      error: string;
    };

export function decideUploadToken(input: {
  userId: string | null;
  pathCheck: PathCheck | null;
  used: number | null;
  recorded: boolean | null;
}): UploadTokenDecision {
  if (input.userId === null) {
    return {
      ok: false,
      status: 401,
      error: MESSAGES.api.unauthorized,
    };
  }

  if (input.pathCheck !== null && !input.pathCheck.ok) {
    return {
      ok: false,
      status: 400,
      error: MESSAGES.api.badRequest,
    };
  }

  if (input.used !== null && input.used >= DAILY_LIMIT) {
    return {
      ok: false,
      status: 429,
      error: MESSAGES.api.limitReached,
    };
  }

  if (input.recorded === false) {
    return {
      ok: false,
      status: 400,
      error: MESSAGES.api.badRequest,
    };
  }

  return { ok: true };
}

export const createDocumentBodySchema = z.object({
  blobUrl: z.string(),
  fileName: z.string().min(1).max(255),
});
