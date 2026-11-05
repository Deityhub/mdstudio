// Revision text is stored gzipped (as base64, so the column stays plain text and the same SQL runs
// on D1 and SQLite) when that makes it smaller. Prose shrinks to roughly a third, which matters
// because every cloud draft keeps several versions. CompressionStream is built into Workers and Node.
export type Encoding = "plain" | "gzip-b64";

/** Below this, gzip's header and base64's overhead cost more than they save. */
const MIN_LENGTH = 512;

async function through(stream: CompressionStream | DecompressionStream, bytes: Uint8Array) {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

function toBase64(bytes: Uint8Array) {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export async function pack(text: string): Promise<{ encoding: Encoding; content: string }> {
  if (text.length >= MIN_LENGTH) {
    const gz = toBase64(
      await through(new CompressionStream("gzip"), new TextEncoder().encode(text)),
    );
    if (gz.length < text.length) return { encoding: "gzip-b64", content: gz };
  }
  return { encoding: "plain", content: text };
}

export async function unpack(encoding: string, content: string): Promise<string> {
  if (encoding === "plain") return content;
  if (encoding !== "gzip-b64") throw new Error(`Unknown revision encoding: ${encoding}`);
  const bytes = Uint8Array.from(atob(content), (c) => c.charCodeAt(0));
  return new TextDecoder().decode(await through(new DecompressionStream("gzip"), bytes));
}
