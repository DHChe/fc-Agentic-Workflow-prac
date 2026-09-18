import { existsSync } from "node:fs";

import { clerkSetup } from "@clerk/testing/cypress";
import { defineConfig } from "cypress";

import { getBlobStoreHost } from "./lib/upload/validate";
import { fillUsage, resetUser } from "./scripts/e2e-prepare";

if (existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

process.env.CLERK_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";

export default defineConfig({
  e2e: {
    baseUrl: "http://localhost:3100",
    specPattern: "cypress/e2e/**/*.cy.ts",
    supportFile: "cypress/support/e2e.ts",
    async setupNodeEvents(on, config) {
      on("task", { resetUser, fillUsage });
      config.env.BLOB_STORE_HOST = getBlobStoreHost();

      return clerkSetup({ config });
    },
  },
});
