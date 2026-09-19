import { existsSync } from "node:fs";

import { clerkSetup } from "@clerk/testing/cypress";
import { defineConfig } from "cypress";

import { getBlobStoreHost } from "./lib/upload/validate";
import {
  fillUsage,
  resetUser,
  seedTransaction,
} from "./scripts/e2e-prepare";

if (existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

if (!publishableKey) {
  // 빈 문자열로 넘기면 clerkSetup이 원인을 알 수 없는 오류로 실패한다.
  throw new Error("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is required");
}

process.env.CLERK_PUBLISHABLE_KEY = publishableKey;

export default defineConfig({
  e2e: {
    baseUrl: "http://localhost:3100",
    specPattern: "cypress/e2e/**/*.cy.ts",
    supportFile: "cypress/support/e2e.ts",
    async setupNodeEvents(on, config) {
      on("before:browser:launch", (browser, launchOptions) => {
        if (browser.family === "chromium" && browser.name !== "electron") {
          // Chromium의 fetch 업로드 스트리밍이 Cypress 프록시와 충돌해 Blob 업로드
          // 요청이 멈춘다. 끄면 Blob SDK가 XHR 경로를 써서 운영 동작은 그대로다.
          launchOptions.args.push(
            "--disable-features=FetchUploadStreaming",
          );
        }

        return launchOptions;
      });
      on("task", { resetUser, fillUsage, seedTransaction });
      config.env.BLOB_STORE_HOST = getBlobStoreHost();

      return clerkSetup({ config });
    },
  },
});
