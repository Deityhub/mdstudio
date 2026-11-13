// Images that a draft edited together points at (`![alt](./images/name.png)`) but that live only in
// one browser's copy of it. Such an image is stored as a data address in the draft's own images, not
// in the shared text, so the other people see a broken picture. This finds them, to warn about them.
// No Yjs here: the studio uses it without downloading it.

/** Markdown image references to a local file, not inside a code block, by the name they are stored under. */
function localNames(content: string): string[] {
  const names = new Set<string>();
  let fenced = false;
  for (const line of content.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    if (fenced) continue;
    for (const m of line.matchAll(/!\[(?:[^\]\\]|\\.)*\]\(\s*<?(?:\.\/)?images\/([^)\s>"]+)/g)) {
      try {
        names.add(decodeURIComponent(m[1]!));
      } catch {
        names.add(m[1]!);
      }
    }
  }
  return [...names];
}

/** The local images the text points at: those this browser holds, and those it does not. */
export function sortLocalImages(content: string, held: Record<string, string>) {
  const mine: string[] = [];
  const missing: string[] = [];
  for (const name of localNames(content)) (name in held ? mine : missing).push(name);
  return { mine, missing };
}

export type ImageNote = { label: string; advice: string; canHost: boolean };

const count = (n: number) => `${n} image${n === 1 ? "" : "s"}`;

/** What to tell the person: about images only they have, and about images they were never given. */
export function warnLocalImages(
  found: { mine: string[]; missing: string[] },
  hostingAvailable: boolean,
): { mine: ImageNote | null; missing: ImageNote | null } {
  return {
    mine: found.mine.length
      ? {
          label: `${count(found.mine.length)} only you can see`,
          advice: hostingAvailable
            ? "These images are stored in this browser only, so the other people in this draft see a broken picture. Host them, or use an image address (a link to the picture on a website), and everyone sees them."
            : "These images are stored in this browser only, so the other people in this draft see a broken picture. Use an image address (a link to the picture on a website) instead, and everyone sees it.",
          canHost: hostingAvailable,
        }
      : null,
    missing: found.missing.length
      ? {
          label: `${count(found.missing.length)} ${found.missing.length === 1 ? "isn't" : "aren't"} shared with you`,
          advice:
            "Someone added these images from their own computer, and only they have them. Ask them to host the images or use image addresses, and they will show here.",
          canHost: false,
        }
      : null,
  };
}
