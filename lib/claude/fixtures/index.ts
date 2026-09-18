import { throwFailApi } from "./fail-api";
import { RECEIPT_OK } from "./receipt-ok";
import { REPORT_OK_CHUNKS } from "./report-ok";

export type FixtureName = "receipt-ok" | "fail-api";

export function pickFixtureName(fileName: string): FixtureName {
  const baseName = fileName.replace(/\.[^.]*$/, "");
  return baseName === "fail-api" ? "fail-api" : "receipt-ok";
}

export { RECEIPT_OK, REPORT_OK_CHUNKS, throwFailApi };
