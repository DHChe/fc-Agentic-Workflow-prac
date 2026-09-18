import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // next dev가 AGENTS.md·CLAUDE.md에 안내 블록을 덧붙이지 않게 한다(하네스 파일 보호).
  agentRules: false,
  serverExternalPackages: ["sharp"],
  async headers() {
    return [
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
    ];
  },
};

export default nextConfig;
