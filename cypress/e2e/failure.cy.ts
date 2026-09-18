const UPSTREAM_FAILURE_MESSAGE =
  "분석 서비스가 일시적으로 응답하지 않습니다.";

describe("문서 분석 실패", () => {
  const userId = Cypress.env("E2E_USER_ID") as string;

  after(() => {
    cy.task("resetUser", userId);
  });

  it("분석 서비스 실패 사유와 사용량을 표시한다", () => {
    cy.task("resetUser", userId);
    cy.signInAsTestUser();
    cy.interceptBlobUpload();

    cy.get('[data-testid="upload-input"]').selectFile(
      "cypress/fixtures/fail-api.jpg",
      { force: true },
    );
    cy.get('[data-testid="upload-submit"]').click();

    cy.get('[data-testid="document-row"]', { timeout: 20_000 }).should(
      "have.attr",
      "data-status",
      "failed",
    );
    cy.get('[data-testid="document-failure-reason"]').should(
      "contain.text",
      UPSTREAM_FAILURE_MESSAGE,
    );
    cy.get('[data-testid="usage-counter"]').should("contain.text", "1/50");
  });
});
