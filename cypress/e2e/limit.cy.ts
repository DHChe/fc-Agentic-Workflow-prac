import { MESSAGES } from "@/lib/messages";

describe("하루 사용량 한도", () => {
  const userId = Cypress.env("E2E_USER_ID") as string;

  after(() => {
    cy.task("resetUser", userId);
  });

  it("50회를 사용하면 문서와 보고서 생성을 비활성화한다", () => {
    let seededMonth = "";

    cy.task("resetUser", userId);
    cy.task("seedTransaction", userId).then((month) => {
      seededMonth = month as string;
    });
    cy.task("fillUsage", userId);
    cy.signInAsTestUser();

    cy.get('[data-testid="usage-counter"]').should("contain.text", "50/50");
    cy.get('[data-testid="upload-submit"]').should("be.disabled");
    cy.get('[data-testid="upload-sample"]').should("be.disabled");
    cy.get('[data-testid="report-create"]').should("be.disabled");
    cy.get('[data-testid="limit-notice"]').should(
      "contain.text",
      MESSAGES.api.limitReached,
    );

    // 화면이 막아도 서버가 직접 요청을 429로 거절하는지 확인한다.
    cy.then(() => {
      cy.request({
        method: "POST",
        url: "/api/reports",
        body: { month: seededMonth },
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.equal(429);
        expect(response.body.error).to.equal(MESSAGES.api.limitReached);
      });
    });
  });
});
