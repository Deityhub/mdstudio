// Gets an image small enough to host. Phone photos are megabytes; a picture in a document is
// nearly always fine at a few hundred kilobytes, so the browser does the shrinking before upload
// and the free storage allowance goes a long way.
export const TARGET_BYTES = 300_000;
/** What the server accepts for one hosted image. */
export const MAX_HOSTED_BYTES = 1_000_000;
const MAX_EDGE = 1600;
const MIN_EDGE = 320;
const QUALITIES = [0.85, 0.7, 0.55, 0.4];

export type Encode = (width: number, height: number, quality: number) => Promise<Blob>;

/**
 * Tries smaller sizes and lower qualities until the result is under `budget`. When nothing gets
 * there it settles for the smallest result under the hard limit, and gives up (null) if even that
 * is too big.
 */
export async function fitBudget(
  size: { width: number; height: number },
  encode: Encode,
  budget = TARGET_BYTES,
  hard = MAX_HOSTED_BYTES,
): Promise<Blob | null> {
  let scale = Math.min(1, MAX_EDGE / Math.max(size.width, size.height));
  let best: Blob | null = null;
  while (Math.max(size.width, size.height) * scale >= MIN_EDGE) {
    const w = Math.max(1, Math.round(size.width * scale));
    const h = Math.max(1, Math.round(size.height * scale));
    for (const quality of QUALITIES) {
      const blob = await encode(w, h, quality);
      if (blob.size <= budget) return blob;
      if (!best || blob.size < best.size) best = blob;
    }
    scale *= 0.75;
  }
  return best && best.size <= hard ? best : null;
}

const KEPT = ["image/png", "image/jpeg", "image/webp", "image/gif"];

/**
 * A file ready to upload: small files go as they are (so GIFs keep moving), anything larger is
 * drawn onto a canvas and re-encoded as WebP, falling back to JPEG where WebP can't be written.
 * Null when the picture can't be brought under the limit.
 */
export async function shrinkImage(file: File): Promise<File | null> {
  if (KEPT.includes(file.type) && file.size <= TARGET_BYTES) return file;
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  const encode: Encode = (width, height, quality) => {
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, width, height);
    return new Promise((resolve, reject) =>
      canvas.toBlob(
        (webp) =>
          webp?.type === "image/webp"
            ? resolve(webp)
            : canvas.toBlob(
                (jpeg) => (jpeg ? resolve(jpeg) : reject(new Error("Couldn't encode the image"))),
                "image/jpeg",
                quality,
              ),
        "image/webp",
        quality,
      ),
    );
  };
  const blob = await fitBudget(bitmap, encode);
  bitmap.close();
  if (!blob) return null;
  const ext = blob.type === "image/webp" ? "webp" : "jpg";
  return new File([blob], `${file.name.replace(/\.[a-z0-9]+$/i, "") || "image"}.${ext}`, {
    type: blob.type,
  });
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Replaces draft-local image paths (`images/pic.png`, `./images/pic.png`) with hosted URLs, in
 * Markdown and HTML image references. Only what the writer asked to host is touched.
 */
export function rewriteImageRefs(content: string, hosted: Record<string, string>) {
  let out = content;
  for (const [name, url] of Object.entries(hosted)) {
    const path = new RegExp(
      `(\\]\\(\\s*<?|src=["'])(?:\\./)?images/${escape(name)}(?=[>)\\s"'])`,
      "g",
    );
    out = out.replace(path, (_m, before: string) => `${before}${url}`);
  }
  return out;
}
