import { describe, expect, it } from "vitest";

import nextConfig from "./next.config";

describe("Next.js response headers", () => {
  it("sets the four security headers on every route", async () => {
    const rules = await nextConfig.headers?.();

    expect(rules).toEqual([
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'none'",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
        ],
      },
    ]);
  });
});
