import { renderMail } from "../mail/template";
import type { Mail } from "../mail";

const oneLine = (text: string) => text.replace(/\s+/g, " ").trim().slice(0, 120);
const pageUrl = (origin: string, slug: string) => `${origin}/s/${slug}`;

const day = (ms: number) => new Date(ms).toUTCString().slice(5, 16);

/**
 * Sent to an address added to a private link: who shared what, until when, and where to go. It says
 * nothing about whether the address has an account. `by` is the writer's display name, never an address.
 */
export const inviteMail = (
  origin: string,
  slug: string,
  title: string,
  to: string,
  by: string,
  expiresAt: number,
): Mail => {
  const name = oneLine(title) || "a document";
  const who = oneLine(by) || "Someone";
  return renderMail({
    to,
    subject: `${who} invited you to read “${name}”`.replace(/[<>]/g, ""),
    preheader: `${who} shared “${name}” with you on mdstudio.`,
    heading: "You're invited to read a document",
    intro: [
      `${who} shared “${name}” with you on mdstudio.`,
      "Sign in with this email address, or create an account with it, to open it. You may be able to leave comments too.",
    ],
    action: { label: "Open the document", url: pageUrl(origin, slug) },
    outro: [
      `Only people the writer named can open it, and the link stops working on ${day(expiresAt)}. If you weren't expecting this, you can ignore this message.`,
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
