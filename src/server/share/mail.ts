import { renderMail } from "../mail/template";
import type { Mail } from "../mail";

const oneLine = (text: string) => text.replace(/\s+/g, " ").trim().slice(0, 120);
const pageUrl = (origin: string, slug: string) => `${origin}/s/${slug}`;

/** Sent to an address added to a private link. It says nothing about whether it has an account. */
export const inviteMail = (origin: string, slug: string, title: string, to: string): Mail => {
  const name = oneLine(title) || "a document";
  return renderMail({
    to,
    subject: "You've been invited to read a document on mdstudio",
    preheader: `Someone shared “${name}” with you.`,
    heading: "You're invited to read a document",
    intro: [
      `Someone shared “${name}” with you on mdstudio.`,
      "Sign in with this email address, or create an account with it, to open it.",
    ],
    action: { label: "Open the document", url: pageUrl(origin, slug) },
    outro: [
      "Only people the writer named can open it, and it stops working when the link expires. If you weren't expecting this, you can ignore this message.",
    ],
  });
};

/** Sent to the writer when someone comments. It carries no comment text, only where to look. */
export const commentMail = (
  origin: string,
  slug: string,
  title: string,
  author: string,
  to: string,
): Mail => {
  const name = oneLine(title) || "your document";
  return renderMail({
    to,
    subject: `New comment on “${name}”`,
    preheader: `${oneLine(author)} commented on your shared document.`,
    heading: "New comment",
    intro: [`${oneLine(author)} commented on “${name}”.`],
    action: { label: "Read the comment", url: pageUrl(origin, slug) },
    outro: ["You get at most one of these an hour for each shared document."],
  });
};
