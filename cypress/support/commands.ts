import { addClerkCommands } from "@clerk/testing/cypress";

addClerkCommands({ Cypress, cy });

declare global {
  // Cypress custom commands are exposed through its global namespace.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Cypress {
    interface Chainable {
      signInAsTestUser(): Chainable<void>;
      interceptBlobUpload(): Chainable<void>;
    }
  }
}

function requiredEnv(name: string): string {
  const value = Cypress.env(name) as unknown;

  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${name} is required`);
  }

  return value;
}

function contentTypeFor(pathname: string): string {
  if (/\.png$/i.test(pathname)) {
    return "image/png";
  }

  if (/\.pdf$/i.test(pathname)) {
    return "application/pdf";
  }

  return "image/jpeg";
}

Cypress.Commands.add("signInAsTestUser", () => {
  const identifier = requiredEnv("E2E_USER_EMAIL");
  const password = requiredEnv("E2E_USER_PASSWORD");

  cy.session(
    ["clerk-test-user", identifier],
    () => {
      cy.visit("/");
      cy.clerkLoaded();
      cy.clerkSignIn({ strategy: "password", identifier, password });
      cy.window().should((window) => {
        // Clerk 대시보드 Protect → Rules의 Device Trust가 켜져 있으면 비밀번호 로그인이 2단계를 요구해 세션이 만들어지지 않는다.
        expect(window.Clerk.session).not.to.equal(null);
      });
    },
    { cacheAcrossSpecs: true },
  );
  cy.visit("/dashboard");
});

Cypress.Commands.add("interceptBlobUpload", () => {
  const storeHost = requiredEnv("BLOB_STORE_HOST");

  cy.intercept(
    "PUT",
    /^https:\/\/vercel\.com\/api\/blob\/?\?/,
    (request) => {
      const pathname = new URL(request.url).searchParams.get("pathname");

      if (!pathname) {
        throw new Error("Blob upload pathname is required");
      }

      const url = `https://${storeHost}/${pathname}`;
      const fileName = pathname.split("/").at(-1) ?? "upload";

      request.reply({
        statusCode: 200,
        body: {
          url,
          downloadUrl: `${url}?download=1`,
          pathname,
          contentType: contentTypeFor(pathname),
          contentDisposition: `inline; filename="${fileName}"`,
          etag: "cypress-blob-etag",
        },
      });
    },
  );
});

export {};
