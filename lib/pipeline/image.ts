import sharp from "sharp";

export async function toAnalysisJpeg(buf: Buffer): Promise<Buffer> {
  return sharp(buf)
    .rotate()
    .resize(2576, 2576, { fit: "inside", withoutEnlargement: true })
    .jpeg()
    .toBuffer();
}
