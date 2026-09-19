import { EncryptedPDFError, PDFDocument } from "pdf-lib";

export const MAX_PDF_PAGES = 20;

const ENCRYPTED_PDF_ERROR_MESSAGE = new EncryptedPDFError().message;

function isEncryptedPdfError(error: unknown): boolean {
  return (
    error instanceof Error && error.message === ENCRYPTED_PDF_ERROR_MESSAGE
  );
}

export type PdfInspection =
  | { ok: true; pageCount: number }
  | { ok: false; code: "encryptedPdf" | "unreadable" };

export type PdfFailureCode = "encryptedPdf" | "unreadable" | "tooManyPages";

export type PdfDecision =
  | { ok: true; pageCount: number }
  | { ok: false; code: PdfFailureCode; pageCount: number | null };

export async function inspectPdf(buf: Buffer): Promise<PdfInspection> {
  try {
    const document = await PDFDocument.load(buf);

    return { ok: true, pageCount: document.getPageCount() };
  } catch (error) {
    return isEncryptedPdfError(error)
      ? { ok: false, code: "encryptedPdf" }
      : { ok: false, code: "unreadable" };
  }
}

// 페이지 수 한도는 여기 한 곳에서 판정한다.
export function decidePdfInput(inspection: PdfInspection): PdfDecision {
  if (!inspection.ok) {
    return { ok: false, code: inspection.code, pageCount: null };
  }

  return inspection.pageCount > MAX_PDF_PAGES
    ? { ok: false, code: "tooManyPages", pageCount: inspection.pageCount }
    : inspection;
}
