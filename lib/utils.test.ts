import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { cn } from "./utils";

const globalsCss = readFileSync(
  fileURLToPath(new URL("../app/globals.css", import.meta.url)),
  "utf8",
);
const typeScaleClasses = [...globalsCss.matchAll(/^@utility (text-[\w-]+)/gm)].map(
  (match) => match[1],
);

describe("cn", () => {
  it("globals.css에 글자 크기 유틸리티가 있다", () => {
    expect(typeScaleClasses).toContain("text-amount-lg");
  });

  it.each(typeScaleClasses)("%s를 글자색과 함께 써도 지우지 않는다", (typeScale) => {
    expect(cn(typeScale, "text-strong")).toBe(`${typeScale} text-strong`);
    expect(cn(typeScale, "text-muted-foreground")).toBe(
      `${typeScale} text-muted-foreground`,
    );
  });

  it("변형 접두어가 붙어도 지우지 않는다", () => {
    expect(cn("[&_h2]:text-h2 [&_h2]:text-strong")).toBe(
      "[&_h2]:text-h2 [&_h2]:text-strong",
    );
  });

  it("글자 크기끼리는 뒤의 것이 이긴다", () => {
    expect(cn("text-body", "text-caption")).toBe("text-caption");
  });

  it("글자색끼리는 뒤의 것이 이긴다", () => {
    expect(cn("text-strong", "text-destructive")).toBe("text-destructive");
  });
});
