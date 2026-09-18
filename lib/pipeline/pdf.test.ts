import { EncryptedPDFError, PDFDocument } from "pdf-lib";
import { describe, expect, it, vi } from "vitest";

import { inspectPdf } from "./pdf";

async function createPdf(pageCount: number): Promise<Buffer> {
  const pdf = await PDFDocument.create();

  for (let index = 0; index < pageCount; index += 1) {
    pdf.addPage();
  }

  return Buffer.from(await pdf.save());
}

describe("inspectPdf", () => {
  it("returns the page count for a three-page PDF", async () => {
    await expect(inspectPdf(await createPdf(3))).resolves.toEqual({
      ok: true,
      pageCount: 3,
    });
  });

  it("returns 21 pages without applying the page limit itself", async () => {
    await expect(inspectPdf(await createPdf(21))).resolves.toEqual({
      ok: true,
      pageCount: 21,
    });
  });

  it("classifies invalid bytes as unreadable", async () => {
    await expect(inspectPdf(Buffer.from("not a pdf"))).resolves.toEqual({
      ok: false,
      code: "unreadable",
    });
  });

  it("classifies only EncryptedPDFError as an encrypted PDF", async () => {
    const load = vi
      .spyOn(PDFDocument, "load")
      .mockRejectedValueOnce(new EncryptedPDFError());

    try {
      await expect(inspectPdf(Buffer.from("stubbed"))).resolves.toEqual({
        ok: false,
        code: "encryptedPdf",
      });
    } finally {
      load.mockRestore();
    }
  });
});
