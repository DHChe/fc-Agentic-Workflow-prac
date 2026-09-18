import type { UploadExt } from "@/lib/upload/validate";

export function buildUploadPath(
  userId: string,
  uploadId: string,
  ext: UploadExt,
): string {
  return `${userId}/${uploadId}.${ext}`;
}

export function pickUploadError(
  used: number,
  limit: number,
): "limitReached" | "failed" {
  return used >= limit ? "limitReached" : "failed";
}
