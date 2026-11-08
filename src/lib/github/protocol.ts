// What the browser and the server agree on for publishing to GitHub (see src/server/github).
import { slugify } from "@/lib/markdown/markdown";

/** The most image data one publish may carry (base64 text, so about 4.5 MB of files) and how many images. */
export const MAX_IMAGE_BYTES = 6_000_000;
export const MAX_IMAGES = 20;

export type PublishMode = "commit" | "pull_request";

export type FilePublish = {
  /** The draft's own id. It must be in the cloud: the published text is the cloud copy. */
  id: string;
  repo: string;
  /** The branch to commit to, or the branch a pull request is opened against. */
  branch: string;
  path: string;
  mode: PublishMode;
  message?: string;
  /** Local images by file name, as data URIs. Only the ones the text refers to are used. */
  images?: Record<string, string>;
  /** Replace a file that is already there and was not published from this draft. */
  overwrite?: boolean;
};

export type GistPublish = {
  id: string;
  public?: boolean;
  filename?: string;
  description?: string;
};

/** What is remembered about a draft's last publish of each kind, so an update edits the same place. */
export type Publication = {
  kind: "file" | "gist";
  repo: string | null;
  branch: string | null;
  path: string | null;
  gistId: string | null;
  url: string;
  /** SHA-256 (hex) of the text that was published, to tell whether the draft has moved on. */
  hash: string;
  publishedAt: number;
};

export type PublishResult = {
  kind: "file" | "gist";
  /** Where to look: the file, or the gist. */
  url: string;
  commitUrl?: string;
  pullUrl?: string;
};

export type RepoInfo = { fullName: string; private: boolean; defaultBranch: string };

const NAME = /^[A-Za-z0-9_.-]{1,100}$/;

export function validRepo(repo: string): boolean {
  const [owner, name, ...rest] = repo.split("/");
  return (
    !!owner &&
    !!name &&
    rest.length === 0 &&
    NAME.test(owner) &&
    NAME.test(name) &&
    owner !== "." &&
    owner !== ".." &&
    name !== "." &&
    name !== ".."
  );
}

export function validBranch(branch: string): boolean {
  return (
    branch.length <= 200 &&
    /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(branch) &&
    !branch.includes("..") &&
    !branch.includes("//") &&
    !branch.endsWith("/") &&
    !branch.endsWith(".") &&
    !branch.endsWith(".lock")
  );
}

/** A path inside the repository in its tidy form, or null when it could reach elsewhere or is odd. */
export function validPath(path: string): string | null {
  const trimmed = path.trim();
  const odd = [...trimmed].some((ch) => ch === "\\" || ch.charCodeAt(0) < 32);
  if (!trimmed || trimmed.length > 200 || trimmed.startsWith("/") || odd) return null;
  const parts = trimmed.split("/").filter((p, i, all) => p !== "" || i === all.length - 1);
  if (parts.some((p) => !p || p === "." || p === ".." || p.toLowerCase() === ".git")) return null;
  return parts.join("/");
}

/** A plain image file name, with no folders. */
export const imageFile = (name: string) =>
  /^[A-Za-z0-9][A-Za-z0-9._ ()-]{0,99}\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i.test(name);

/** Where an image goes: an `images` folder beside the file, which is where the text already points. */
export function imagePath(filePath: string, name: string) {
  const dir = filePath.includes("/") ? filePath.slice(0, filePath.lastIndexOf("/") + 1) : "";
  return `${dir}images/${name}`;
}

/** The branch a pull request is made from: `mdstudio/<title>-<yyyymmdd>-<hhmm>`. */
export function publishBranch(title: string, now: number) {
  const slug = slugify(title).slice(0, 40).replace(/-+$/, "");
  const d = new Date(now).toISOString();
  return `mdstudio/${slug}-${d.slice(0, 10).replaceAll("-", "")}-${d.slice(11, 16).replace(":", "")}`;
}

/** Where a draft goes by default: its title as a file name, as the ZIP export names it. */
export const defaultPath = (title: string) => `${slugify(title)}.md`;
