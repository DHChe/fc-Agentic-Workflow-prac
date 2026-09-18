import { describe, expect, it } from "vitest";
import sharp from "sharp";

import { toAnalysisJpeg } from "./image";

function createImage(width: number, height: number) {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: "#ffffff",
    },
  });
}

describe("toAnalysisJpeg", () => {
  it("re-encodes a large PNG as JPEG with its longest side at 2576px", async () => {
    const input = await createImage(4000, 3000).png().toBuffer();

    const output = await toAnalysisJpeg(input);
    const metadata = await sharp(output).metadata();

    expect(metadata.format).toBe("jpeg");
    expect(metadata.width).toBe(2576);
    expect(metadata.height).toBe(1932);
  });

  it("does not enlarge an image smaller than the analysis bounds", async () => {
    const input = await createImage(800, 600).png().toBuffer();

    const output = await toAnalysisJpeg(input);
    const metadata = await sharp(output).metadata();

    expect(metadata.width).toBe(800);
    expect(metadata.height).toBe(600);
  });

  it("applies EXIF orientation before resizing", async () => {
    const input = await createImage(300, 200)
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();

    const output = await toAnalysisJpeg(input);
    const metadata = await sharp(output).metadata();

    expect(metadata.width).toBe(200);
    expect(metadata.height).toBe(300);
  });

  it("throws when sharp cannot open the input", async () => {
    await expect(toAnalysisJpeg(Buffer.from("not an image"))).rejects.toThrow();
  });
});
