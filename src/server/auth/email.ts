// One inbox, one account: `test@gmail.com`, `test+shop@gmail.com` and `t.e.s.t@gmail.com` all
// deliver to the same mailbox, so they all map to the same key.
export function canonicalEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  if (/\s/.test(email)) return null;
  const at = email.lastIndexOf("@");
  if (at < 1) return null;
  let local = email.slice(0, at).split("+")[0]!;
  let domain = email.slice(at + 1);
  if (!domain.includes(".")) return null;
  if (domain === "googlemail.com") domain = "gmail.com";
  if (domain === "gmail.com") local = local.replaceAll(".", "");
  return local ? `${local}@${domain}` : null;
}
