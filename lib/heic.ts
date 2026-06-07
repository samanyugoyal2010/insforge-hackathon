// Convert a HEIC/HEIF file to a PNG Blob in the browser.
// Non-HEIC images are returned unchanged. heic2any is browser-only, so it is
// imported dynamically at call time.
export async function toWebImage(file: File): Promise<Blob> {
  const isHeic =
    file.type === "image/heic" ||
    file.type === "image/heif" ||
    /\.hei[cf]$/i.test(file.name);

  if (!isHeic) return file;

  const heic2any = (await import("heic2any")).default;
  const result = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
  return Array.isArray(result) ? result[0] : result;
}
