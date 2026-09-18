import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["**/*.test.{ts,tsx}"],
    exclude: [
      "node_modules/**",
      ".next/**",
      "cypress/**",
      "cypress.config.ts",
      "graft/**",
      "phases/**",
      "scripts/__pycache__/**",
      ".agents/**",
      ".claude/**",
      ".codex/**",
      ".grok/**",
      ".omc/**",
      "drizzle/**",
    ],
  },
});
