import type { DocumentStatus } from "@/lib/db/schema";

export const POLL_INTERVAL_MS = 4000;

export function shouldPoll(
  documents: Array<{ status: DocumentStatus }>,
): boolean {
  return documents.some((document) => document.status === "processing");
}

export function nextTickAction(state: {
  inFlight: boolean;
  hasProcessing: boolean;
}): "fetch" | "skip" | "stop" {
  if (!state.hasProcessing) {
    return "stop";
  }

  return state.inFlight ? "skip" : "fetch";
}
