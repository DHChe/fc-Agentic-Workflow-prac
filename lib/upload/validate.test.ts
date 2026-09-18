import { afterEach, describe, expect, it } from "vitest";

import {
  ALLOWED_CONTENT_TYPES,
  MAX_FILE_BYTES,
  checkClientFile,
  extFromContentType,
  getBlobStoreHost,
  mimeFromExt,
  validateBlobUrl,
  validateUploadPath,
} from "./validate";

const USER_ID = "user_123";
const UPLOAD_ID = "123e4567-e89b-12d3-a456-426614174000";
const STORE_HOST = "abc123.public.blob.vercel-storage.com";

describe("validateUploadPath", () => {
  it.each(["jpg", "jpeg", "png", "pdf"] as const)(
    "%s 경로를 허용한다",
    (ext) => {
      expect(validateUploadPath(`${USER_ID}/${UPLOAD_ID}.${ext}`, USER_ID)).toEqual(
        { ok: true, uploadId: UPLOAD_ID, ext },
      );
    },
  );

  it.each([
    [`other/${UPLOAD_ID}.jpg`, "남의 userId"],
    [`${USER_ID}/../${UPLOAD_ID}.jpg`, ".. 경로"],
    [`${USER_ID}/%2e%2e/${UPLOAD_ID}.jpg`, "인코딩된 .. 경로"],
    [`${USER_ID}/%252e%252e/${UPLOAD_ID}.jpg`, "이중 인코딩된 .. 경로"],
    [`${USER_ID}/%E0%A4%A`, "잘못된 인코딩"],
    [`${USER_ID}/${UPLOAD_ID}.JPG`, "대문자 확장자"],
    [`${USER_ID}/${UPLOAD_ID}.webp`, "허용 밖 확장자"],
    [`${USER_ID}/x/${UPLOAD_ID}.jpg`, "추가 경로 조각"],
    [`/${USER_ID}/${UPLOAD_ID}.jpg`, "맨 앞 슬래시"],
    [`${USER_ID}/${UPLOAD_ID.toUpperCase()}.jpg`, "대문자 UUID"],
  ])("%s (%s)를 거절한다", (pathname) => {
    expect(validateUploadPath(pathname, USER_ID)).toEqual({ ok: false });
  });

  it("정규식 메타문자가 든 userId를 문자 그대로 비교한다", () => {
    expect(validateUploadPath(`user.+/${UPLOAD_ID}.jpg`, "user.+")).toEqual({
      ok: true,
      uploadId: UPLOAD_ID,
      ext: "jpg",
    });
    expect(validateUploadPath(`userxx/${UPLOAD_ID}.jpg`, "user.+")).toEqual({
      ok: false,
    });
  });
});

describe("validateBlobUrl", () => {
  const validUrl = `https://${STORE_HOST}/${USER_ID}/${UPLOAD_ID}.jpg`;

  it("정확한 https 호스트와 업로드 경로를 허용한다", () => {
    expect(validateBlobUrl(validUrl, USER_ID, STORE_HOST)).toEqual({
      ok: true,
      uploadId: UPLOAD_ID,
      ext: "jpg",
    });
  });

  it.each([
    [`http://${STORE_HOST}/${USER_ID}/${UPLOAD_ID}.jpg`, "http"],
    [
      `https://${STORE_HOST}.evil.com/${USER_ID}/${UPLOAD_ID}.jpg`,
      "호스트 접미사",
    ],
    [
      `https://${STORE_HOST}@evil.com/${USER_ID}/${UPLOAD_ID}.jpg`,
      "userinfo",
    ],
    [
      `https://${STORE_HOST}:8443/${USER_ID}/${UPLOAD_ID}.jpg`,
      "포트",
    ],
    [
      `https://other.public.blob.vercel-storage.com/${USER_ID}/${UPLOAD_ID}.jpg`,
      "다른 storeId",
    ],
    [`${validUrl}?download=1`, "쿼리"],
    [`${validUrl}#fragment`, "해시"],
    ["not a url", "URL이 아닌 문자열"],
  ])("%s (%s)를 거절한다", (blobUrl) => {
    expect(validateBlobUrl(blobUrl, USER_ID, STORE_HOST)).toEqual({
      ok: false,
    });
  });
});

describe("파일 형식과 크기", () => {
  it("허용 MIME 타입 목록을 고정한다", () => {
    expect(ALLOWED_CONTENT_TYPES).toEqual([
      "image/jpeg",
      "image/png",
      "application/pdf",
    ]);
  });

  it("10,000,000바이트는 허용하고 그보다 크면 거절한다", () => {
    expect(
      checkClientFile({ size: MAX_FILE_BYTES, type: "image/jpeg" }),
    ).toBeNull();
    expect(
      checkClientFile({ size: MAX_FILE_BYTES + 1, type: "image/jpeg" }),
    ).toBe("tooLarge");
  });

  it.each(["image/webp", "image/heic", ""])("%s 형식을 거절한다", (type) => {
    expect(checkClientFile({ size: 1, type })).toBe("invalidType");
  });

  it("형식과 크기가 모두 틀리면 형식 오류를 먼저 돌려준다", () => {
    expect(
      checkClientFile({ size: MAX_FILE_BYTES + 1, type: "image/webp" }),
    ).toBe("invalidType");
  });

  it.each([
    ["image/jpeg", "jpg"],
    ["image/png", "png"],
    ["application/pdf", "pdf"],
    ["image/webp", null],
  ] as const)("MIME %s의 확장자는 %s다", (type, expected) => {
    expect(extFromContentType(type)).toBe(expected);
  });

  it.each([
    ["jpg", "image/jpeg"],
    ["jpeg", "image/jpeg"],
    ["png", "image/png"],
    ["pdf", "application/pdf"],
  ] as const)("확장자 %s의 MIME은 %s다", (ext, expected) => {
    expect(mimeFromExt(ext)).toBe(expected);
  });
});

describe("getBlobStoreHost", () => {
  const originalToken = process.env.BLOB_READ_WRITE_TOKEN;

  afterEach(() => {
    if (originalToken === undefined) {
      delete process.env.BLOB_READ_WRITE_TOKEN;
    } else {
      process.env.BLOB_READ_WRITE_TOKEN = originalToken;
    }
  });

  it("토큰 네 번째 조각을 소문자 storeId로 사용한다", () => {
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_AbC123_secret";

    expect(getBlobStoreHost()).toBe(
      "abc123.public.blob.vercel-storage.com",
    );
  });

  it("토큰이 없으면 예외를 던진다", () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;

    expect(() => getBlobStoreHost()).toThrow();
  });
});
