import { describe, expect, it } from "vitest";

import { MESSAGES } from "@/lib/messages";

import { createDocumentBodySchema, decideUploadToken } from "./rules";

const VALID_PATH = {
  ok: true as const,
  uploadId: "123e4567-e89b-12d3-a456-426614174000",
  ext: "jpg" as const,
};

describe("decideUploadToken", () => {
  it("로그인하지 않은 요청을 먼저 거절한다", () => {
    expect(
      decideUploadToken({
        userId: null,
        pathCheck: null,
        used: null,
        recorded: null,
      }),
    ).toEqual({
      ok: false,
      status: 401,
      error: MESSAGES.api.unauthorized,
    });
  });

  it("잘못된 경로를 400으로 거절한다", () => {
    expect(
      decideUploadToken({
        userId: "user_123",
        pathCheck: { ok: false },
        used: null,
        recorded: null,
      }),
    ).toEqual({
      ok: false,
      status: 400,
      error: MESSAGES.api.badRequest,
    });
  });

  it.each([
    [49, true],
    [50, false],
    [51, false],
  ])("오늘 사용량이 %i이면 허가 여부는 %s다", (used, allowed) => {
    const decision = decideUploadToken({
      userId: "user_123",
      pathCheck: VALID_PATH,
      used,
      recorded: null,
    });

    if (allowed) {
      expect(decision).toEqual({ ok: true });
    } else {
      expect(decision).toEqual({
        ok: false,
        status: 429,
        error: MESSAGES.api.limitReached,
      });
    }
  });

  it("이미 기록된 uploadId를 400으로 거절한다", () => {
    expect(
      decideUploadToken({
        userId: "user_123",
        pathCheck: VALID_PATH,
        used: 0,
        recorded: false,
      }),
    ).toEqual({
      ok: false,
      status: 400,
      error: MESSAGES.api.badRequest,
    });
  });

  it("아직 확인하지 않은 단계는 통과로 본다", () => {
    expect(
      decideUploadToken({
        userId: "user_123",
        pathCheck: null,
        used: null,
        recorded: null,
      }),
    ).toEqual({ ok: true });
  });

  it.each([
    [null, { ok: false } as const, 50, false, 401],
    ["user_123", { ok: false } as const, 50, false, 400],
    ["user_123", VALID_PATH, 50, false, 429],
    ["user_123", VALID_PATH, 49, false, 400],
  ])(
    "여러 단계가 실패하면 앞 단계의 %i 응답을 돌려준다",
    (userId, pathCheck, used, recorded, status) => {
      expect(
        decideUploadToken({ userId, pathCheck, used, recorded }),
      ).toMatchObject({ ok: false, status });
    },
  );
});

describe("createDocumentBodySchema", () => {
  const validBody = {
    blobUrl:
      "https://store.public.blob.vercel-storage.com/user_123/file.jpg",
    fileName: "receipt.jpg",
  };

  it("정상 본문을 통과시킨다", () => {
    expect(createDocumentBodySchema.parse(validBody)).toEqual(validBody);
  });

  it.each(["", "a".repeat(256)])("fileName %j을 거절한다", (fileName) => {
    expect(
      createDocumentBodySchema.safeParse({ ...validBody, fileName }).success,
    ).toBe(false);
  });

  it("blobUrl이 없으면 거절한다", () => {
    expect(
      createDocumentBodySchema.safeParse({ fileName: "receipt.jpg" }).success,
    ).toBe(false);
  });

  it("모르는 필드는 무시한다", () => {
    expect(
      createDocumentBodySchema.parse({ ...validBody, ignored: "value" }),
    ).toEqual(validBody);
  });
});
