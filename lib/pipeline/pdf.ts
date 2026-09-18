import { EncryptedPDFError, PDFDocument } from "pdf-lib";

export const MAX_PDF_PAGES = 20;

const ENCRYPTED_PDF_ERROR_MESSAGE = new EncryptedPDFError().message;

function isEncryptedPdfError(error: unknown): boolean {
  return (
    error instanceof Error && error.message === ENCRYPTED_PDF_ERROR_MESSAGE
  );
}

export async function inspectPdf(
  buf: Buffer,
): Promise<
  | { ok: true; pageCount: number }
  | { ok: false; code: "encryptedPdf" | "unreadable" }
> {
  try {
    const document = await PDFDocument.load(buf);

    return { ok: true, pageCount: document.getPageCount() };
  } catch (error) {
    return isEncryptedPdfError(error)
      ? { ok: false, code: "encryptedPdf" }
      : { ok: false, code: "unreadable" };
  }
}
