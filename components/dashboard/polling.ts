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

export type RefreshQueue<T> = {
  request: () => Promise<T>;
  isBusy: () => boolean;
};

// 쓰기 직후에 부른 조회가 그 쓰기 이전에 출발한 요청에 올라타면 낡은 답을 받는다.
// 진행 중인 요청이 있으면 올라타지 말고, 그 뒤에 한 번만 더 요청한다.
export function createRefreshQueue<T>(run: () => Promise<T>): RefreshQueue<T> {
  let inFlight: Promise<T> | null = null;
  let queued: Promise<T> | null = null;

  function start(): Promise<T> {
    const request = run();
    const settle = (): void => {
      if (inFlight === request) {
        inFlight = null;
      }
    };

    inFlight = request;
    request.then(settle, settle);

    return request;
  }

  return {
    request(): Promise<T> {
      if (!inFlight) {
        return start();
      }

      if (!queued) {
        queued = inFlight.catch(() => undefined).then(() => {
          queued = null;
          return start();
        });
      }

      return queued;
    },
    isBusy(): boolean {
      return inFlight !== null || queued !== null;
    },
  };
}
