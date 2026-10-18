import sharp from "sharp";
export const PHOTO_LIMIT = 3 * 1024 * 1024;
export async function prepareProfilePhoto(bytes: Uint8Array, mime: string) {
  if (!bytes.length || bytes.length > PHOTO_LIMIT)
    throw new Error("Foto maksimal 3 MB.");
  if (!["image/jpeg", "image/png", "image/webp"].includes(mime))
    throw new Error("Gunakan foto JPG, PNG atau WebP.");
  try {
    const image = sharp(bytes, {
      limitInputPixels: 16_000_000,
      animated: false,
      failOn: "error",
    });
    const metadata = await image.metadata();
    if (
      !["jpeg", "png", "webp"].includes(metadata.format ?? "") ||
      (metadata.pages ?? 1) > 1
    )
      throw new Error("format");
    return await image
      .rotate()
      .resize(640, 640, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer();
  } catch {
    throw new Error(
      "Foto tidak dapat dibaca. Gunakan gambar statis maksimal 16 megapiksel.",
    );
  }
}
