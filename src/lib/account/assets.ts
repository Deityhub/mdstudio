// Browser side of /api/assets: hosted images for the signed-in account.
export type HostedImage = {
  id: string;
  file: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
  createdAt: number;
  /** The public link that goes into the Markdown. */
  url: string;
};
export type ImageUsage = {
  count: number;
  bytes: number;
  maxAssets: number;
  maxBytes: number;
  maxEach: number;
};

const MESSAGES: Record<string, string> = {
  invalid_type: "Only PNG, JPEG, WebP and GIF images can be hosted.",
  too_large: "That image is too large to host, even after shrinking.",
  limit_count: "Your account is full of images. Delete one to make room.",
  limit_bytes: "Your account has no room for another image. Delete one to make room.",
  unavailable: "Image hosting isn't switched on for this server.",
  forbidden: "The request was refused. Reload the page and try again.",
};
export const imageMessage = (code: string) =>
  MESSAGES[code] ?? "Couldn't upload the image. Try again.";

export async function uploadImage(file: File): Promise<{ image: HostedImage } | { error: string }> {
  try {
    const body = new FormData();
    body.set("file", file, file.name);
    const res = await fetch("/api/assets", { method: "POST", body });
    const data = (await res.json()) as { asset?: HostedImage; error?: string };
    return data.asset ? { image: data.asset } : { error: data.error ?? "" };
  } catch {
    return { error: "offline" };
  }
}

export async function listImages(): Promise<{ assets: HostedImage[]; usage: ImageUsage } | null> {
  try {
    const res = await fetch("/api/assets");
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

export async function deleteImage(id: string) {
  try {
    return (await fetch(`/api/assets/${id}`, { method: "DELETE" })).ok;
  } catch {
    return false;
  }
}
