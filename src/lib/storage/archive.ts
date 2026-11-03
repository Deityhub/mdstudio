import { safeImageName } from "../editor/images";
import { deriveTitle, slugify } from "../markdown/markdown";
import { normalizeFolder } from "./library";
import type { ZipEntry } from "./zip";

/** What an archive holds for one draft. Library folders map to directories. */
export type ArchiveDoc = {
  title: string;
  content: string;
  /** Embedded images by file name, as data URIs. */
  images: Record<string, string>;
  folder?: string | undefined;
};

const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  avif: "image/avif",
  bmp: "image/bmp",
};
const IMAGE_RE = /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i;
const TEXT_RE = /\.(md|markdown|mdown|txt)$/i;

const extOf = (name: string) => name.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase() ?? "";
const basename = (p: string) => p.slice(p.lastIndexOf("/") + 1);

/* ---------------- images ---------------- */

const MD_IMAGE = /(!\[[^\]]*\]\(\s*)(<[^>]+>|[^)\s]+)((?:\s+"[^"]*")?\s*\))/g;
const HTML_IMAGE = /(<img\b[^>]*?\bsrc\s*=\s*)(["'])(.*?)\2/gi;

/**
 * Rewrites the source of every Markdown image and `<img>` tag. Return undefined to keep a source.
 * ponytail: also matches inside code samples; a text-level scan, not a parse.
 */
export function mapImageSrc(content: string, fn: (src: string) => string | undefined): string {
  return content
    .replace(MD_IMAGE, (m, open: string, src: string, close: string) => {
      const angled = src.startsWith("<");
      const next = fn(angled ? src.slice(1, -1) : src);
      if (next === undefined) return m;
      return `${open}${angled ? `<${next}>` : next}${close}`;
    })
    .replace(HTML_IMAGE, (m, open: string, q: string, src: string) => {
      const next = fn(src);
      return next === undefined ? m : `${open}${q}${next}${q}`;
    });
}

/** Image bytes and type from a base64 data URI, or null for anything else. */
export function dataUriToBytes(uri: string): { mime: string; bytes: Uint8Array } | null {
  const m = uri.match(/^data:([\w.+-]+\/[\w.+-]+);base64,([A-Za-z0-9+/=\s]+)$/);
  if (!m) return null;
  const bin = atob(m[2]!.replace(/\s+/g, ""));
  return { mime: m[1]!, bytes: Uint8Array.from(bin, (c) => c.charCodeAt(0)) };
}

function bytesToDataUri(bytes: Uint8Array, name: string): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${MIME_BY_EXT[extOf(name)] ?? "application/octet-stream"};base64,${btoa(bin)}`;
}

const pathOfSrc = (src: string) => {
  const bare = src.split(/[?#]/)[0] ?? "";
  try {
    return decodeURIComponent(bare);
  } catch {
    return bare;
  }
};
const isLocal = (src: string) => !!src && !/^([a-z][a-z0-9+.-]*:|\/\/|\/)/i.test(src);

/* ---------------- export ---------------- */

const safeSegment = (s: string) =>
  s
    .replace(/[\\/:*?"<>|\p{Cc}]+/gu, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[.\s-]+|[.\s-]+$/g, "")
    .slice(0, 60) || "folder";

/** The files for an archive of drafts: `Folder/title.md`, with images in `images/` beside them. */
export function buildArchive(docs: ArchiveDoc[]): ZipEntry[] {
  const enc = new TextEncoder();
  const entries: ZipEntry[] = [];
  const usedNames = new Map<string, Set<string>>();
  const dirImages = new Map<string, Map<string, string>>();

  for (const d of docs) {
    const dir = d.folder ? `${safeSegment(d.folder)}/` : "";
    const names = usedNames.get(dir) ?? usedNames.set(dir, new Set()).get(dir)!;
    const base = slugify(d.title);
    let file = base;
    for (let n = 2; names.has(file); n++) file = `${base}-${n}`;
    names.add(file);

    const placed = dirImages.get(dir) ?? dirImages.set(dir, new Map()).get(dir)!;
    const images: ZipEntry[] = [];
    const mapped = new Map<string, string>(); // this draft's image name -> name in the folder
    const content = mapImageSrc(d.content, (src) => {
      if (!isLocal(src)) return undefined;
      const name = basename(pathOfSrc(src));
      const uri = d.images[name];
      if (!uri) return undefined;
      let target = mapped.get(name);
      if (!target) {
        const decoded = dataUriToBytes(uri);
        if (!decoded) return undefined;
        const stem = name.replace(/(\.[a-z0-9]+)?$/i, "");
        const ext = name.slice(stem.length);
        target = name;
        for (let n = 2; placed.has(target) && placed.get(target) !== uri; n++)
          target = `${stem}-${n}${ext}`;
        mapped.set(name, target);
        if (!placed.has(target)) {
          placed.set(target, uri);
          images.push({ path: `${dir}images/${target}`, data: decoded.bytes });
        }
      }
      const here = pathOfSrc(src);
      return here === `images/${target}` || here === `./images/${target}`
        ? undefined
        : `./images/${target}`;
    });
    entries.push({ path: `${dir}${file}.md`, data: enc.encode(content) }, ...images);
  }
  return entries;
}

/* ---------------- import ---------------- */

export type ImportedDoc = ArchiveDoc;

/** Turns the files of an archive or a picked folder into drafts. Hidden files and `..` paths are ignored. */
export function parseArchive(files: ZipEntry[]): { docs: ImportedDoc[]; skipped: number } {
  const dec = new TextDecoder();
  const clean = files.flatMap((f) => {
    const segs = f.path
      .replace(/\\/g, "/")
      .split("/")
      .filter((s) => s && s !== ".");
    if (segs.some((s) => s === ".." || s.startsWith(".") || s === "__MACOSX")) return [];
    return [{ segs, data: f.data }];
  });
  const images = new Map<string, Uint8Array>();
  for (const f of clean)
    if (IMAGE_RE.test(f.segs.at(-1)!)) images.set(f.segs.join("/").toLowerCase(), f.data);

  const docs: ImportedDoc[] = [];
  let skipped = 0;
  for (const f of clean) {
    const file = f.segs.at(-1)!;
    if (!TEXT_RE.test(file)) {
      if (!IMAGE_RE.test(file)) skipped++;
      continue;
    }
    const dir = f.segs.slice(0, -1);
    const found: Record<string, string> = {};
    const nameOf = new Map<string, string>();
    const content = mapImageSrc(dec.decode(f.data), (src) => {
      if (!isLocal(src)) return undefined;
      const rel = pathOfSrc(src);
      const stack = [...dir];
      for (const s of rel.split("/").filter((x) => x && x !== ".")) {
        if (s === "..") stack.pop();
        else stack.push(s);
      }
      const key = stack.join("/").toLowerCase();
      const bytes = images.get(key);
      if (!bytes) return undefined;
      let name = nameOf.get(key);
      if (!name) {
        name = safeImageName(stack.at(-1)!, found);
        nameOf.set(key, name);
        found[name] = bytesToDataUri(bytes, name);
      }
      return rel === `images/${name}` || rel === `./images/${name}`
        ? undefined
        : `./images/${name}`;
    });
    const heading = deriveTitle(content);
    docs.push({
      title: heading === "Untitled" ? file.replace(/\.[^.]+$/, "") : heading,
      content,
      images: found,
      folder: normalizeFolder(dir.join(" / ")),
    });
  }
  return { docs, skipped };
}
