import { describe, expect, it } from "vitest";

import {
  buildUploadPath,
  pickUploadError,
} from "@/components/dashboard/upload-helpers";

describe("buildUploadPath", () => {
  it("builds the user-scoped Blob pathname", () => {
    expect(
      buildUploadPath(
        "user_abc",
        "123e4567-e89b-12d3-a456-426614174000",
        "jpg",
      ),
    ).toBe("user_abc/123e4567-e89b-12d3-a456-426614174000.jpg");
  });

  it("does not add extra slashes", () => {
    const pathname = buildUploadPath(
      "user_abc",
      "123e4567-e89b-12d3-a456-426614174000",
      "pdf",
    );

    expect(pathname.match(/\//g)).toHaveLength(1);
  });
});

describe("pickUploadError", () => {
  it.each([
    [50, 50],
    [51, 50],
  ])("returns limitReached for %i of %i uses", (used, limit) => {
    expect(pickUploadError(used, limit)).toBe("limitReached");
  });

  it.each([
    [49, 50],
    [0, 50],
  ])("returns failed for %i of %i uses", (used, limit) => {
    expect(pickUploadError(used, limit)).toBe("failed");
  });
});
