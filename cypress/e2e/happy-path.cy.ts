import { REPORT_SECTION_TITLES } from "@/lib/claude/report-sections";
import { MESSAGES } from "@/lib/messages";

describe("영수증 업로드와 월간 보고서", () => {
  const userId = Cypress.env("E2E_USER_ID") as string;

  after(() => {
    cy.task("resetUser", userId);
  });

  it("샘플 거래를 집계하고 보고서를 저장한다", () => {
    cy.task("resetUser", userId);
    cy.signInAsTestUser();
    cy.interceptBlobUpload();

    cy.get('[data-testid="document-row"]').should("not.exist");
    cy.get('[data-testid="upload-sample"]').click();

    cy.get('[data-testid="document-row"]', { timeout: 20_000 })
      .should("have.length", 1)
      .and(($row) => {
        expect(["processing", "completed"]).to.include(
          $row.attr("data-status"),
        );
      });
    cy.get('[data-testid="document-row"]', { timeout: 20_000 }).should(
      "have.attr",
      "data-status",
      "completed",
    );

    cy.get('[data-testid="stats-month-label"]').should(
      "contain.text",
      "2026년 9월",
    );
    cy.get('[data-testid="stats-total"]').should(
      "contain.text",
      "17,300원",
    );
    cy.get('[data-testid="stats-count"]').should("contain.text", "1건");
    cy.get('[data-testid="usage-counter"]').should("contain.text", "1/50");

    cy.get('[data-testid="report-create"]').click();
    cy.get('[data-testid="report-stream"]', { timeout: 20_000 }).should(
      "contain.text",
      REPORT_SECTION_TITLES[0],
    );
    cy.get('[data-testid="report-status"]', { timeout: 20_000 }).should(
      "contain.text",
      MESSAGES.report.saved,
    );
    cy.get('[data-testid="report-stream"]').should(
      "not.contain.text",
      MESSAGES.ui.reportGenerating,
    );
    cy.get('[data-testid="report-row"]', { timeout: 20_000 }).should(
      "have.length",
      1,
    );
    cy.get('[data-testid="usage-counter"]').should("contain.text", "2/50");

    cy.get('[data-testid="report-row"]').click();
    cy.get('[data-testid="report-copy"]', { timeout: 20_000 })
      .should("be.visible")
      .parent()
      .parent()
      .parent()
      .should(($detail) => {
        const detailText = $detail.text();

        for (const title of REPORT_SECTION_TITLES) {
          expect(detailText).to.include(title);
        }
      });
  });
});
