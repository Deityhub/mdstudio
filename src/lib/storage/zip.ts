/**
 * A small ZIP reader and writer, so drafts can be exported and imported as one archive without a
 * dependency. Deflate goes through the platform's CompressionStream. Limits: no encryption, no
 * ZIP64 (archives over 4 GB or 65,535 files).
 */

export type ZipEntry = { path: string; data: Uint8Array };

export const ZIP_LIMITS = {
  /** Files in one archive. */
  entries: 5000,
  /** Bytes of file content once unpacked, so a tiny archive can't expand without bound. */
  totalBytes: 256 * 1024 * 1024,
};

const enc = new TextEncoder();
const dec = new TextDecoder("utf-8");

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of data) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

async function collect(stream: ReadableStream<Uint8Array>, max = Infinity): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];
  let size = 0;
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) {
      await reader.cancel();
      throw new Error("A file in the ZIP is too large to unpack");
    }
    parts.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

const through = (
  data: Uint8Array,
  transform: ReadableWritablePair<Uint8Array, Uint8Array>,
  max?: number,
) =>
  collect(
    new Blob([data as BlobPart])
      .stream()
      .pipeThrough(transform as never) as ReadableStream<Uint8Array>,
    max,
  );

async function deflate(data: Uint8Array): Promise<Uint8Array | null> {
  if (typeof CompressionStream === "undefined" || data.length === 0) return null;
  const packed = await through(data, new CompressionStream("deflate-raw") as never);
  return packed.length < data.length ? packed : null;
}

const inflate = (data: Uint8Array, max: number) =>
  through(data, new DecompressionStream("deflate-raw") as never, max);

/** MS-DOS date and time, which is what ZIP stores. */
function dosDateTime(d: Date) {
  const date =
    ((Math.max(d.getFullYear(), 1980) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  return { date, time };
}

export async function createZip(entries: ZipEntry[], now = new Date()): Promise<Uint8Array> {
  const { date, time } = dosDateTime(now);
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const { path, data } of entries) {
    const name = enc.encode(path);
    const packed = await deflate(data);
    const body = packed ?? data;
    const method = packed ? 8 : 0;
    const crc = crc32(data);

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // UTF-8 names
    local.setUint16(8, method, true);
    local.setUint16(10, time, true);
    local.setUint16(12, date, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, body.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, name.length, true);
    chunks.push(new Uint8Array(local.buffer), name, body);

    const head = new DataView(new ArrayBuffer(46));
    head.setUint32(0, 0x02014b50, true);
    head.setUint16(4, 20, true);
    head.setUint16(6, 20, true);
    head.setUint16(8, 0x0800, true);
    head.setUint16(10, method, true);
    head.setUint16(12, time, true);
    head.setUint16(14, date, true);
    head.setUint32(16, crc, true);
    head.setUint32(20, body.length, true);
    head.setUint32(24, data.length, true);
    head.setUint16(28, name.length, true);
    head.setUint32(42, offset, true);
    central.push(new Uint8Array(head.buffer), name);

    offset += 30 + name.length + body.length;
  }
  const centralSize = central.reduce((n, c) => n + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);

  const all = [...chunks, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of all) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

/** The files in an archive; directories are left out. Throws a readable error for anything else. */
export async function readZip(
  buf: Uint8Array,
  limits: Partial<typeof ZIP_LIMITS> = {},
): Promise<ZipEntry[]> {
  const max = { ...ZIP_LIMITS, ...limits };
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--)
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  if (eocd < 0) throw new Error("This doesn't look like a ZIP file");

  const count = view.getUint16(eocd + 10, true);
  if (count > max.entries) throw new Error(`The ZIP has too many files (more than ${max.entries})`);
  let at = view.getUint32(eocd + 16, true);
  const out: ZipEntry[] = [];
  let total = 0;
  for (let n = 0; n < count; n++) {
    if (at + 46 > buf.length || view.getUint32(at, true) !== 0x02014b50)
      throw new Error("The ZIP file is damaged");
    const flags = view.getUint16(at + 8, true);
    const method = view.getUint16(at + 10, true);
    const csize = view.getUint32(at + 20, true);
    const usize = view.getUint32(at + 24, true);
    const nameLen = view.getUint16(at + 28, true);
    const extraLen = view.getUint16(at + 30, true);
    const commentLen = view.getUint16(at + 32, true);
    const local = view.getUint32(at + 42, true);
    const path = dec.decode(buf.subarray(at + 46, at + 46 + nameLen));
    at += 46 + nameLen + extraLen + commentLen;

    if (path.endsWith("/")) continue;
    if (flags & 1) throw new Error("Encrypted ZIP files are not supported");
    if (csize === 0xffffffff || usize === 0xffffffff || local === 0xffffffff)
      throw new Error("ZIP64 archives are not supported");
    total += usize;
    if (total > max.totalBytes) throw new Error("The ZIP is too large to unpack");

    if (view.getUint32(local, true) !== 0x04034b50) throw new Error("The ZIP file is damaged");
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const raw = buf.subarray(start, start + csize);
    let data: Uint8Array;
    if (method === 0) data = raw.slice();
    else if (method === 8) data = await inflate(raw, max.totalBytes);
    else throw new Error("This ZIP uses a compression method that isn't supported");
    out.push({ path, data });
  }
  return out;
}
