// Browser side of /api/auth/*. Accounts are optional: when the server is unreachable (offline,
// or a build without a database) the editor behaves as signed out and nothing else changes.
export type AccountUser = { id: string; email: string; displayName: string | null };
export type Account = { user: AccountUser | null; github: boolean };

const MESSAGES: Record<string, string> = {
  invalid: "Enter a valid email and a password of at least 10 characters.",
  email_taken: "That email already has an account. Sign in instead.",
  invalid_credentials: "That email and password don't match.",
  forbidden: "The request was refused. Reload the page and try again.",
  github_failed: "GitHub sign-in didn't complete. Try again.",
  github_unavailable: "GitHub sign-in isn't set up on this server.",
  no_verified_email: "Your GitHub account has no verified email address.",
  email_in_use: "That email already has a password account. Sign in with your password instead.",
};

export const authMessage = (code: string) => MESSAGES[code] ?? "Something went wrong. Try again.";

// The last user the server confirmed, so an offline reload keeps showing that account's drafts.
const REMEMBERED = "md:account";
export function rememberUser(user: AccountUser | null) {
  try {
    if (user) localStorage.setItem(REMEMBERED, JSON.stringify(user));
    else localStorage.removeItem(REMEMBERED);
  } catch {
    // storage unavailable: the account just isn't remembered offline
  }
}
function rememberedUser(): AccountUser | null {
  try {
    return JSON.parse(localStorage.getItem(REMEMBERED) ?? "null") as AccountUser | null;
  } catch {
    return null;
  }
}

export async function fetchAccount(): Promise<Account> {
  try {
    const res = await fetch("/api/auth/me");
    const body = (await res.json()) as {
      user?: AccountUser | null;
      providers?: { github?: boolean };
    };
    rememberUser(body.user ?? null);
    return { user: body.user ?? null, github: body.providers?.github === true };
  } catch {
    // Can't reach the server: assume nothing changed rather than hiding the account's drafts.
    return { user: rememberedUser(), github: false };
  }
}

export async function signIn(
  mode: "login" | "signup",
  email: string,
  password: string,
): Promise<{ user: AccountUser } | { error: string }> {
  try {
    const res = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const body = (await res.json()) as { user?: AccountUser; error?: string };
    if (body.user) rememberUser(body.user);
    return body.user ? { user: body.user } : { error: authMessage(body.error ?? "") };
  } catch {
    return { error: "Can't reach the server. Check your connection and try again." };
  }
}

export async function signOut() {
  rememberUser(null);
  await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
}
