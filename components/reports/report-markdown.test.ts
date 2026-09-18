import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  DISALLOWED_ELEMENTS,
  UNWRAP_DISALLOWED,
} from "@/components/reports/report-markdown";

describe("ReportMarkdown security contract", () => {
  it("removes links and images while preserving disallowed element text", () => {
    expect(DISALLOWED_ELEMENTS).toEqual(["a", "img"]);
    expect(UNWRAP_DISALLOWED).toBe(true);
  });

  it("does not enable raw HTML rendering", () => {
    const source = readFileSync(
      new URL("./report-markdown.tsx", import.meta.url),
      "utf8",
    );

    expect(source).not.toContain("rehype-raw");
    expect(source).not.toContain("dangerouslySetInnerHTML");
  });
});
