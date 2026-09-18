const LIMIT_MESSAGE =
  "오늘 한도(50회)를 모두 사용했습니다. 한국 시간 자정에 초기화됩니다.";

describe("하루 사용량 한도", () => {
  const userId = Cypress.env("E2E_USER_ID") as string;

  after(() => {
    cy.task("resetUser", userId);
  });

  it("50회를 사용하면 문서와 보고서 생성을 비활성화한다", () => {
    cy.task("resetUser", userId);
    cy.task("fillUsage", userId);
    cy.signInAsTestUser();

    cy.get('[data-testid="usage-counter"]').should("contain.text", "50/50");
    cy.get('[data-testid="upload-submit"]').should("be.disabled");
    cy.get('[data-testid="upload-sample"]').should("be.disabled");
    cy.get('[data-testid="report-create"]').should("be.disabled");
    cy.get('[data-testid="limit-notice"]').should(
      "contain.text",
      LIMIT_MESSAGE,
    );
  });
});
