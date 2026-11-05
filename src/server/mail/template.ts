// The look of mdstudio's emails: the warm paper palette of src/styles.css (hex, because mail clients
// don't read CSS variables or OKLCH), the Fraunces / IBM Plex Sans pairing with the fallbacks mail
// clients have, and a dark version for clients that follow the reader's setting. Table layout and
// inline styles, because that's what mail clients render everywhere. Nothing is loaded from the
// network: no images, fonts or trackers, so the message shows at once and leaks nothing.
import type { Mail } from "./types";

export type MailContent = {
  to: string;
  subject: string;
  /** The grey line next to the subject in an inbox list; hidden in the message itself. */
  preheader: string;
  heading: string;
  intro: string[];
  action: { label: string; url: string };
  outro: string[];
};

// Light: background, card, text, muted text, border, primary, text on primary.
const L = {
  bg: "#faf6ee",
  card: "#fefbf6",
  fg: "#221811",
  muted: "#6c6158",
  border: "#ded6c9",
  primary: "#ad411c",
  onPrimary: "#fdfaf3",
};
const D = {
  bg: "#18130e",
  card: "#211c17",
  fg: "#ece7df",
  muted: "#9e978f",
  border: "#38322d",
  primary: "#e57f4f",
  onPrimary: "#190f0a",
};

const DISPLAY = "Fraunces, Georgia, 'Times New Roman', serif";
const SANS = "'IBM Plex Sans', -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";

const esc = (s: string) =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

export function renderMail(c: MailContent): Mail {
  const paragraph = (t: string, color = L.fg, cls = "fg") =>
    `<p class="${cls}" style="margin:0 0 16px;font:400 16px/1.6 ${SANS};color:${color};">${esc(t)}</p>`;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${esc(c.subject)}</title>
<style>
@media (prefers-color-scheme: dark) {
  .bg { background-color: ${D.bg} !important; }
  .card { background-color: ${D.card} !important; border-color: ${D.border} !important; }
  .fg { color: ${D.fg} !important; }
  .muted { color: ${D.muted} !important; }
  .rule { border-color: ${D.border} !important; }
  .accent { color: ${D.primary} !important; }
  .button { background-color: ${D.primary} !important; }
  .button a { color: ${D.onPrimary} !important; }
}
</style>
</head>
<body class="bg" style="margin:0;padding:0;background-color:${L.bg};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${L.bg};">${esc(c.preheader)}</div>
<table role="presentation" class="bg" width="100%" cellpadding="0" cellspacing="0" style="background-color:${L.bg};">
<tr><td align="center" style="padding:32px 16px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
    <tr><td style="padding:0 4px 16px;font:600 22px/1 ${DISPLAY};color:${L.fg};" class="fg"><span class="accent" style="color:${L.primary};">md</span>studio</td></tr>
    <tr><td class="card" style="background-color:${L.card};border:1px solid ${L.border};border-radius:12px;padding:32px 28px;">
      <h1 class="fg" style="margin:0 0 16px;font:600 26px/1.25 ${DISPLAY};color:${L.fg};">${esc(c.heading)}</h1>
      ${c.intro.map((t) => paragraph(t)).join("\n      ")}
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr>
        <td class="button" style="background-color:${L.primary};border-radius:8px;"><a href="${esc(c.action.url)}" style="display:inline-block;padding:12px 22px;font:600 16px/1 ${SANS};color:${L.onPrimary};text-decoration:none;">${esc(c.action.label)}</a></td>
      </tr></table>
      <p class="muted" style="margin:0 0 4px;font:400 13px/1.5 ${SANS};color:${L.muted};">Or paste this link into your browser:</p>
      <p class="muted" style="margin:0 0 24px;font:400 13px/1.5 ${SANS};color:${L.muted};word-break:break-all;">${esc(c.action.url)}</p>
      <div class="rule" style="border-top:1px solid ${L.border};padding-top:20px;">
      ${c.outro.map((t) => paragraph(t, L.muted, "muted").replace("16px/1.6", "14px/1.6")).join("\n      ")}
      </div>
    </td></tr>
    <tr><td class="muted" style="padding:16px 4px 0;font:400 12px/1.5 ${SANS};color:${L.muted};">mdstudio, a Markdown editor that checks your writing is portable.</td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;

  const text = [
    c.heading,
    "",
    ...c.intro.flatMap((t) => [t, ""]),
    c.action.url,
    "",
    ...c.outro,
  ].join("\n");
  return { to: c.to, subject: c.subject, text, html };
}
