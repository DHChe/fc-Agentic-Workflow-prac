import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { describe, expect, it } from "vitest";

import { ReportMarkdown } from "@/components/reports/report-markdown";

const UNTRUSTED_MARKDOWN = [
  "[링크 글자](https://example.com/phish)",
  "",
  "![이미지 대체 글자](https://example.com/tracker.png)",
  "",
  "<script>alert(1)</script>",
  "",
  '<img src="x" onerror="alert(1)">',
].join("\n");

describe("ReportMarkdown security contract", () => {
  it("링크·이미지·raw HTML을 렌더 결과에 남기지 않는다", () => {
    const html = renderToStaticMarkup(
      createElement(ReportMarkdown, { markdown: UNTRUSTED_MARKDOWN }),
    );

    expect(html).not.toContain("<a");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script");
    expect(html).toContain("링크 글자");
  });
});
