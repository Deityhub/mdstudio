// A draft's title for the server's copy, without the Markdown pipeline (which the Worker keeps
// out): the front matter's title, else the first heading, else what it had.
const FRONT = /^---\r?\n([\s\S]*?)\r?\n---/;
const clean = (s: string) =>
  s
    .trim()
    .replace(/^(['"])(.*)\1$/, "$2")
    .trim()
    .slice(0, 120);

export function quickTitle(content: string, current: string) {
  const front = FRONT.exec(content)?.[1];
  const fromFront = front?.match(/^title:\s*(.+)$/m)?.[1];
  const body = front ? content.slice(content.indexOf("---", 3) + 3) : content;
  const heading = body.match(/^#{1,6}[ \t]+(\S.*)$/m)?.[1];
  return clean(fromFront ?? heading ?? "") || current;
}
