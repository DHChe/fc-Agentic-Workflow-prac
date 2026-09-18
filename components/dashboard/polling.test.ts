import { describe, expect, it } from "vitest";

import {
  nextTickAction,
  POLL_INTERVAL_MS,
  shouldPoll,
} from "@/components/dashboard/polling";

describe("shouldPoll", () => {
  it("returns false for an empty document list", () => {
    expect(shouldPoll([])).toBe(false);
  });

  it("returns false when every document is settled", () => {
    expect(
      shouldPoll([{ status: "completed" }, { status: "failed" }]),
    ).toBe(false);
  });

  it("returns true when any document is processing", () => {
    expect(
      shouldPoll([{ status: "completed" }, { status: "processing" }]),
    ).toBe(true);
  });
});

describe("nextTickAction", () => {
  it("stops when there are no processing documents", () => {
    expect(
      nextTickAction({ inFlight: false, hasProcessing: false }),
    ).toBe("stop");
    expect(nextTickAction({ inFlight: true, hasProcessing: false })).toBe(
      "stop",
    );
  });

  it("skips when the previous request is still in flight", () => {
    expect(nextTickAction({ inFlight: true, hasProcessing: true })).toBe(
      "skip",
    );
  });

  it("fetches when processing remains and no request is in flight", () => {
    expect(nextTickAction({ inFlight: false, hasProcessing: true })).toBe(
      "fetch",
    );
  });
});

it("polls every four seconds", () => {
  expect(POLL_INTERVAL_MS).toBe(4000);
});
