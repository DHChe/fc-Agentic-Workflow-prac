import { describe, expect, it } from "vitest";

import { reportButtonState } from "@/components/dashboard/report-generator";
import { MESSAGES } from "@/lib/messages";

describe("reportButtonState", () => {
  it("enables report creation when transactions are available", () => {
    expect(
      reportButtonState({ count: 1, limitReached: false, generating: false }),
    ).toEqual({ disabled: false, reason: null });
  });

  it("disables report creation when there are no transactions", () => {
    expect(
      reportButtonState({ count: 0, limitReached: false, generating: false }),
    ).toEqual({ disabled: true, reason: MESSAGES.report.noTransactions });
  });

  it("disables report creation when the daily limit is reached", () => {
    expect(
      reportButtonState({ count: 1, limitReached: true, generating: false }),
    ).toEqual({ disabled: true, reason: MESSAGES.api.limitReached });
  });

  it("disables report creation without a reason while generating", () => {
    expect(
      reportButtonState({ count: 1, limitReached: false, generating: true }),
    ).toEqual({ disabled: true, reason: null });
  });

  it("prioritizes the limit message over the empty-month message", () => {
    expect(
      reportButtonState({ count: 0, limitReached: true, generating: false }),
    ).toEqual({ disabled: true, reason: MESSAGES.api.limitReached });
  });
});
