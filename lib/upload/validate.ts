export const MAX_FILE_BYTES = 10_000_000;

export const ALLOWED_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "application/pdf",
] as const;

export type UploadExt = "jpg" | "jpeg" | "png" | "pdf";

export type PathCheck =
  | { ok: true; uploadId: string; ext: UploadExt }
  | { ok: false };

const UUID_PATTERN =
  "([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function validateUploadPath(
  pathname: string,
  userId: string,
): PathCheck {
  let decodedPathname: string;

  try {
    decodedPathname = decodeURIComponent(pathname);
  } catch {
    return { ok: false };
  }

  const pattern = new RegExp(
    `^${escapeRegExp(userId)}/${UUID_PATTERN}\\.(jpg|jpeg|png|pdf)$`,
  );
  const match = pattern.exec(decodedPathname);

  if (!match) {
    return { ok: false };
  }

  return {
    ok: true,
    uploadId: match[1],
    ext: match[2] as UploadExt,
  };
}

export function validateBlobUrl(
  blobUrl: string,
  userId: string,
  storeHost: string,
): PathCheck {
  let parsed: URL;

  try {
    parsed = new URL(blobUrl);
  } catch {
    return { ok: false };
  }

  if (
    parsed.protocol !== "https:" ||
    parsed.host !== storeHost ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.search !== "" ||
    parsed.hash !== ""
  ) {
    return { ok: false };
  }

  return validateUploadPath(parsed.pathname.slice(1), userId);
}

export function getBlobStoreHost(): string {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  const parts = token?.split("_");

  if (
    !parts ||
    parts.length < 5 ||
    parts[0] !== "vercel" ||
    parts[1] !== "blob" ||
    parts[2] !== "rw" ||
    !/^[a-z0-9]+$/i.test(parts[3] ?? "") ||
    parts.slice(4).join("_") === ""
  ) {
    throw new Error("BLOB_READ_WRITE_TOKEN is missing or invalid");
  }

  return `${parts[3].toLowerCase()}.public.blob.vercel-storage.com`;
}

export function mimeFromExt(ext: UploadExt): string {
  switch (ext) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "pdf":
      return "application/pdf";
  }
}

export function extFromContentType(type: string): UploadExt | null {
  switch (type) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "application/pdf":
      return "pdf";
    default:
      return null;
  }
}

export function checkClientFile(file: {
  size: number;
  type: string;
}): null | "invalidType" | "tooLarge" {
  if (!(ALLOWED_CONTENT_TYPES as readonly string[]).includes(file.type)) {
    return "invalidType";
  }

  if (file.size > MAX_FILE_BYTES) {
    return "tooLarge";
  }

  return null;
}
