/** Compress an image file in the browser so embedded (base64) copies stay small. */
export async function compressImage(file: File, maxSize = 1600, quality = 0.85): Promise<string> {
  const dataUrl = await new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = rej;
    r.readAsDataURL(file);
  });
  if (file.type === "image/svg+xml" || file.type === "image/gif") return dataUrl;
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = dataUrl;
  });
  const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  const type = file.type === "image/png" ? "image/png" : "image/jpeg";
  const out = canvas.toDataURL(type, quality);
  return out.length < dataUrl.length ? out : dataUrl;
}

export function safeImageName(name: string, existing: Record<string, string>) {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9.]+/g, "-")
      .replace(/^-|-$/g, "") || "image.png";
  let n = base;
  let i = 1;
  while (existing[n]) n = base.replace(/(\.[a-z0-9]+)?$/, `-${i++}$1`);
  return n;
}

export const kb = (s: string) => Math.round((s.length * 3) / 4 / 1024);
