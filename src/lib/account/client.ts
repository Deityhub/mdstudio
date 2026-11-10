// Browser side of /api/auth/*. Accounts are optional: when the server is unreachable (offline,
// or a build without a database) the editor behaves as signed out and nothing else changes.
export type AccountUser = {
  id: string;
  email: string;
  displayName: string | null;
  /** False until the address is confirmed by the link in an email (always true without email). */
  emailVerified: boolean;
  /** May use the admin dashboard. */
  isAdmin?: boolean;
};
export type Account = {
  user: AccountUser | null;
  github: boolean;
  /** True when this server can publish to GitHub (it has the OAuth app and the key for tokens). */
  githubPublish: boolean;
  /** True when this server can host images (R2 or a disk volume). */
  images: boolean;
  /** True when this server confirms addresses by email, so the cloud needs a confirmed one. */
  email: boolean;
  /** Public key of the sign-up CAPTCHA, when the server has one. */
  turnstile: string | null;
  /** A site-wide notice an admin set, shown above every page. */
  notice?: string | null;
  /** False when an admin has closed sign-ups. */
  signupsOpen?: boolean;
};

const MESSAGES: Record<string, string> = {
  invalid: "Enter a valid email and a password of at least 10 characters.",
  email_taken: "That email already has an account. Sign in instead.",
  invalid_credentials: "That email and password don't match.",
  forbidden: "The request was refused. Reload the page and try again.",
  github_failed: "GitHub sign-in didn't complete. Try again.",
  invalid_token: "That reset link is invalid or has expired. Ask for a new one.",
  rate_limited: "Too many attempts. Wait a little and try again.",
  captcha_failed: "The security check didn't pass. Try again.",
  verify_failed: "That confirmation link is invalid or has expired. Ask for a new one.",
  email_unavailable: "This server can't send email.",
  email_failed: "The email couldn't be sent. Try again in a moment.",
  github_unavailable: "GitHub sign-in isn't set up on this server.",
  no_verified_email: "Your GitHub account has no verified email address.",
  email_in_use: "That email already has a password account. Sign in with your password instead.",
  suspended: "This account has been suspended.",
  signups_closed: "New accounts aren't being created right now.",
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
      providers?: {
        github?: boolean;
        githubPublish?: boolean;
        images?: boolean;
        email?: boolean;
        turnstile?: string | null;
        notice?: string | null;
        signupsOpen?: boolean;
      };
    };
    rememberUser(body.user ?? null);
    return {
      user: body.user ?? null,
      github: body.providers?.github === true,
      githubPublish: body.providers?.githubPublish === true,
      images: body.providers?.images === true,
      email: body.providers?.email === true,
      turnstile: body.providers?.turnstile ?? null,
      notice: body.providers?.notice ?? null,
      signupsOpen: body.providers?.signupsOpen !== false,
    };
  } catch {
    // Can't reach the server: assume nothing changed rather than hiding the account's drafts.
    return {
      user: rememberedUser(),
      github: false,
      githubPublish: false,
      images: false,
      email: false,
      turnstile: null,
      notice: null,
      signupsOpen: true,
    };
  }
}

export async function signIn(
  mode: "login" | "signup",
  email: string,
  password: string,
  turnstileToken?: string,
): Promise<{ user: AccountUser } | { error: string }> {
  try {
    const res = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password, ...(turnstileToken && { turnstileToken }) }),
    });
    const body = (await res.json()) as { user?: AccountUser; error?: string; retryAfter?: number };
    if (body.user) rememberUser(body.user);
    if (body.user) return { user: body.user };
    const wait = body.retryAfter ? ` Try again in ${Math.ceil(body.retryAfter / 60)} min.` : "";
    return { error: authMessage(body.error ?? "") + (body.error === "rate_limited" ? wait : "") };
  } catch {
    return { error: "Can't reach the server. Check your connection and try again." };
  }
}

export async function signOut() {
  rememberUser(null);
  await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
}

/**
 * Asks for the confirmation email. Without `force` it only sends when none is on its way (the first
 * time the account tries the cloud); with it, it sends another. `sent` says whether one went out.
 */
export async function requestVerification(
  force = false,
): Promise<{ sent: boolean; alreadyVerified?: boolean } | { error: string }> {
  try {
    const res = await fetch("/api/auth/verify/resend", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ force }),
    });
    const body = (await res.json()) as {
      error?: string;
      sent?: boolean;
      alreadyVerified?: boolean;
      retryAfter?: number;
    };
    if (!res.ok) return { error: authMessage(body.error ?? "") };
    return { sent: body.sent === true, ...(body.alreadyVerified && { alreadyVerified: true }) };
  } catch {
    return { error: "Can't reach the server. Check your connection and try again." };
  }
}

/** Emails a reset link when the address has an account; the answer is the same either way. */
export async function requestPasswordReset(
  email: string,
  turnstileToken?: string,
): Promise<{ ok: true } | { error: string }> {
  try {
    const res = await fetch("/api/auth/forgot", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, ...(turnstileToken && { turnstileToken }) }),
    });
    const body = (await res.json()) as { error?: string; retryAfter?: number };
    if (res.ok) return { ok: true };
    const wait = body.retryAfter ? ` Try again in ${Math.ceil(body.retryAfter / 60)} min.` : "";
    return { error: authMessage(body.error ?? "") + (body.error === "rate_limited" ? wait : "") };
  } catch {
    return { error: "Can't reach the server. Check your connection and try again." };
  }
}

/** Sets the new password with the link's token. Every session of the account is signed out. */
export async function submitPasswordReset(
  token: string,
  password: string,
): Promise<{ ok: true } | { error: string }> {
  try {
    const res = await fetch("/api/auth/reset", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    const body = (await res.json()) as { error?: string; retryAfter?: number };
    if (res.ok) return { ok: true };
    const wait = body.retryAfter ? ` Try again in ${Math.ceil(body.retryAfter / 60)} min.` : "";
    return { error: authMessage(body.error ?? "") + (body.error === "rate_limited" ? wait : "") };
  } catch {
    return { error: "Can't reach the server. Check your connection and try again." };
  }
}
