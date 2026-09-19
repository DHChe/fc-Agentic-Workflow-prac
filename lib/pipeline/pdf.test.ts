import { EncryptedPDFError, PDFDocument } from "pdf-lib";
import { describe, expect, it, vi } from "vitest";

import { decidePdfInput, inspectPdf } from "./pdf";

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

describe("decidePdfInput", () => {
  it("20페이지까지는 그대로 분석에 쓴다", () => {
    expect(decidePdfInput({ ok: true, pageCount: 20 })).toEqual({
      ok: true,
      pageCount: 20,
    });
  });

  it("21페이지부터는 페이지 수 초과로 막는다", () => {
    expect(decidePdfInput({ ok: true, pageCount: 21 })).toEqual({
      ok: false,
      code: "tooManyPages",
      pageCount: 21,
    });
  });

  it("실제 21페이지 PDF를 검사한 결과도 막는다", async () => {
    expect(decidePdfInput(await inspectPdf(await createPdf(21)))).toEqual({
      ok: false,
      code: "tooManyPages",
      pageCount: 21,
    });
  });

  it("검사 단계의 실패 코드는 그대로 넘긴다", () => {
    expect(decidePdfInput({ ok: false, code: "encryptedPdf" })).toEqual({
      ok: false,
      code: "encryptedPdf",
      pageCount: null,
    });
    expect(decidePdfInput({ ok: false, code: "unreadable" })).toEqual({
      ok: false,
      code: "unreadable",
      pageCount: null,
    });
  });
});
