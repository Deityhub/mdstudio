// Shared by the /api/auth/* route files so each stays a one-liner.
import { getDb } from "../db";
import { getEnv, siteOrigin } from "../env";
import { getMailer } from "../mail";
import { endSessions } from "../realtime/publish";
import { getPublicSettings } from "../settings/service";
import { canonicalEmail } from "./email";
import { findForReset, issueReset, resetMail, resetPassword } from "./reset";
import { authorizeUrl, githubLink, githubSignIn, pkcePair, randomState } from "./github";
import { googleAuthorizeUrl, googleLink, googleSignIn } from "./google";
import { linkedProviders, unlinkSocial } from "./links";
import {
  CONNECT_COOKIE,
  OAUTH_COOKIE,
  clearCookie,
  oauthCookie,
  readCookie,
  readToken,
  sameOrigin,
  sessionCookie,
} from "./http";
import { clearLimit, clientIp, hit, lockedOut } from "./limits";
import { SESSION_MS, login, logout, signup, userForToken } from "./service";
import { verifyTurnstile } from "./turnstile";
import { confirmVerification, hasLiveVerification, sendVerification } from "./verify";
import { withUser } from "./guard";
import {
  confirmEmailChange,
  emailChangeMail,
  emailChangedNotice,
  requestEmailChange,
} from "./email-change";
import { changePassword, updateProfile } from "./profile";

const json = (body: unknown, status = 200, headers?: HeadersInit) =>
  Response.json(body, { status, headers: { "cache-control": "no-store", ...headers } });

const protocol = (request: Request) => new URL(request.url).protocol;

async function body(request: Request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

const STATUS = {
  invalid: 400,
  email_taken: 409,
  invalid_credentials: 401,
  suspended: 403,
} as const;

// ---- Limits -------------------------------------------------------------------------------
// Defaults are the ones in docs/SYSTEM_SPEC.md; the environment can raise or lower them.

const HOUR = 60 * 60 * 1000;
const FAIL_WINDOW = 15 * 60 * 1000;
const limit = (request: Request, name: string, fallback: number) => {
  const n = Number(getEnv(request, name));
  return getEnv(request, name) !== undefined && Number.isInteger(n) && n >= 0 ? n : fallback;
};
const ipOf = (request: Request) =>
  clientIp(request, ["1", "true"].includes(getEnv(request, "TRUST_PROXY") ?? ""));
const tooMany = (retryAfter: number) =>
  Response.json(
    { error: "rate_limited", retryAfter },
    { status: 429, headers: { "retry-after": String(retryAfter), "cache-control": "no-store" } },
  );

export async function signupHandler(request: Request) {
  if (!sameOrigin(request)) return json({ error: "forbidden" }, 403);
  const db = await getDb(request);
  const ip = ipOf(request);
  if (ip !== "unknown") {
    const t = await hit(db, `signup:${ip}`, limit(request, "SIGNUP_LIMIT", 5), HOUR);
    if (!t.allowed) return tooMany(t.retryAfter);
  }
  // an admin can close sign-ups in the dashboard
  if (!(await getPublicSettings(db)).signupsOpen) return json({ error: "signups_closed" }, 403);
  const input = await body(request);
  const secret = getEnv(request, "TURNSTILE_SECRET");
  if (
    secret &&
    !(await verifyTurnstile(secret, (input as { turnstileToken?: unknown })?.turnstileToken, ip))
  )
    return json({ error: "captcha_failed" }, 400);

  // No email yet: one is sent the first time this account tries to use the cloud (see resendHandler),
  // so people who only write locally never cost a message.
  const mailer = await getMailer(request);
  const result = await signup(db, input, Date.now(), { verifyByEmail: mailer !== null });
  if ("error" in result) return json({ error: result.error }, STATUS[result.error]);
  return json({ user: result.user }, 200, {
    "set-cookie": sessionCookie(result.token, protocol(request), SESSION_MS),
  });
}

export async function loginHandler(request: Request) {
  if (!sameOrigin(request)) return json({ error: "forbidden" }, 403);
  const db = await getDb(request);
  const input = await body(request);
  const typed = (input as { email?: unknown })?.email;
  const who =
    typeof typed === "string" ? (canonicalEmail(typed) ?? typed.trim().toLowerCase()) : "";
  const emailKey = `login:email:${who}`;
  const ipKey = `login:ip:${ipOf(request)}`;
  const max = limit(request, "LOGIN_FAIL_LIMIT", 10);
  // Looked at before any password work, so a locked-out guesser costs us nothing.
  const wait =
    (await lockedOut(db, emailKey, max)) ??
    (ipOf(request) === "unknown" ? null : await lockedOut(db, ipKey, max));
  if (wait !== null) return tooMany(wait);

  const result = await login(db, input);
  if ("error" in result) {
    await hit(db, emailKey, max, FAIL_WINDOW);
    if (ipOf(request) !== "unknown") await hit(db, ipKey, max, FAIL_WINDOW);
    return json({ error: result.error }, STATUS[result.error]);
  }
  await clearLimit(db, emailKey);
  return json({ user: result.user }, 200, {
    "set-cookie": sessionCookie(result.token, protocol(request), SESSION_MS),
  });
}

/** The link in the email: confirms the address, then goes back to the editor. */
export async function verifyHandler(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const done = await confirmVerification(await getDb(request), token);
  return new Response(null, {
    status: 302,
    headers: {
      location: done.ok ? "/editor?verified=1" : "/editor?auth_error=verify_failed",
      "cache-control": "no-store",
    },
  });
}

/** Lets the response go out before slow work (sending mail) finishes, where the platform allows. */
async function afterResponse(request: Request, work: Promise<unknown>) {
  const safe = work.catch((error) => console.error("Background work failed", error));
  const waitUntil = (request as { waitUntil?: (p: Promise<unknown>) => void }).waitUntil;
  if (waitUntil) waitUntil.call(request, safe);
  else await safe;
}

/**
 * "I forgot my password": emails a reset link when the address has an account, and says the same
 * thing either way, so it cannot be used to find out who has one. Limited per address (5 an hour)
 * and, for each inbox, 3 an hour (silently, for the same reason); the CAPTCHA applies when set.
 */
export async function forgotHandler(request: Request) {
  if (!sameOrigin(request)) return json({ error: "forbidden" }, 403);
  const mailer = await getMailer(request);
  if (!mailer) return json({ error: "email_unavailable" }, 503);
  const db = await getDb(request);
  const ip = ipOf(request);
  if (ip !== "unknown") {
    const t = await hit(db, `forgot:ip:${ip}`, limit(request, "FORGOT_LIMIT", 5), HOUR);
    if (!t.allowed) return tooMany(t.retryAfter);
  }
  const input = (await body(request)) as { email?: unknown; turnstileToken?: unknown } | null;
  const secret = getEnv(request, "TURNSTILE_SECRET");
  if (secret && !(await verifyTurnstile(secret, input?.turnstileToken, ip)))
    return json({ error: "captcha_failed" }, 400);
  if (typeof input?.email !== "string") return json({ error: "invalid" }, 400);

  const key = canonicalEmail(input.email);
  const same = { ok: true };
  if (!key) return json(same);
  const room = await hit(db, `forgot:email:${key}`, limit(request, "FORGOT_EMAIL_LIMIT", 3), HOUR);
  if (!room.allowed) return json(same); // enough links already sent to that inbox
  const user = await findForReset(db, input.email);
  if (user)
    await afterResponse(
      request,
      issueReset(db, user).then((token) =>
        mailer(resetMail(siteOrigin(request), token, user.email)),
      ),
    );
  return json(same);
}

/** The reset page's form: a valid link plus a new password. Signs every session out. */
export async function resetHandler(request: Request) {
  if (!sameOrigin(request)) return json({ error: "forbidden" }, 403);
  const db = await getDb(request);
  const ip = ipOf(request);
  if (ip !== "unknown") {
    const t = await hit(db, `reset:ip:${ip}`, limit(request, "RESET_LIMIT", 10), HOUR);
    if (!t.allowed) return tooMany(t.retryAfter);
  }
  const input = (await body(request)) as { token?: unknown; password?: unknown } | null;
  if (typeof input?.token !== "string" || typeof input.password !== "string")
    return json({ error: "invalid" }, 400);
  const result = await resetPassword(db, input.token, input.password);
  if (!result.ok) return json({ error: result.error }, 400);
  // a reset ends every session of the account, so its sockets close too
  await endSessions(request, result.userId, "signed_out");
  // Someone locked out by failed attempts can get back in with the new password.
  const key = canonicalEmail(result.email);
  if (key) await clearLimit(db, `login:email:${key}`);
  return json({ ok: true });
}

/**
 * Sends the confirmation email. The first request (the person's first try at the cloud) sends one;
 * later requests do nothing while that link is still good, unless `force` is set ("send it
 * again"). Actual sends are limited to three an hour per account.
 */
export const resendHandler = (request: Request) =>
  withUser(request, async (user, db) => {
    if (!sameOrigin(request)) return json({ error: "forbidden" }, 403);
    if (user.emailVerified) return json({ ok: true, alreadyVerified: true });
    const mailer = await getMailer(request);
    if (!mailer) return json({ error: "email_unavailable" }, 503);
    const force = ((await body(request)) as { force?: unknown } | null)?.force === true;
    if (!force && (await hasLiveVerification(db, user.id))) return json({ ok: true, sent: false });
    const t = await hit(db, `verify:${user.id}`, limit(request, "VERIFY_EMAIL_LIMIT", 3), HOUR);
    if (!t.allowed) return tooMany(t.retryAfter);
    try {
      await sendVerification(db, mailer, siteOrigin(request), user);
    } catch (error) {
      console.error("Couldn't send the verification email", error);
      return json({ error: "email_failed" }, 502);
    }
    return json({ ok: true, sent: true });
  });

/** `PATCH { displayName }`: the name other people see (cursors, comments, who shared a draft). */
export const profileHandler = (request: Request) =>
  withUser(request, async (user, db) => {
    if (!sameOrigin(request)) return json({ error: "forbidden" }, 403);
    const result = await updateProfile(db, user.id, await body(request));
    return result.ok ? json({ user: result.user }) : json({ error: result.error }, 400);
  });

/**
 * `POST { current?, next }`: changes the password, or sets one for an account that signs in only
 * with GitHub or Google. Wrong guesses of the current one are limited per account (a stolen
 * session cannot be used to try passwords). Other devices are signed out; this one stays.
 */
export const passwordHandler = (request: Request) =>
  withUser(request, async (user, db) => {
    if (!sameOrigin(request)) return json({ error: "forbidden" }, 403);
    const token = readToken(request);
    const input = (await body(request)) as { current?: unknown; next?: unknown } | null;
    if (!token || typeof input?.next !== "string") return json({ error: "invalid" }, 400);
    const key = `password:${user.id}`;
    const max = limit(request, "LOGIN_FAIL_LIMIT", 10);
    const wait = await lockedOut(db, key, max);
    if (wait !== null) return tooMany(wait);
    const result = await changePassword(db, user.id, token, {
      next: input.next,
      ...(typeof input.current === "string" && { current: input.current }),
    });
    if (!result.ok) {
      if (result.error === "wrong_password") await hit(db, key, max, FAIL_WINDOW);
      return json({ error: result.error }, result.error === "wrong_password" ? 401 : 400);
    }
    await clearLimit(db, key);
    // the other devices' sockets close with their sessions; this browser's reconnects at once
    await endSessions(request, user.id, "signed_out");
    return json({ ok: true });
  });

/**
 * `POST { email, current }`: emails a link to the NEW address; nothing changes until it is opened.
 * Needs the current password (wrong guesses share the password limit) and a server that sends mail,
 * since the new address must be proven. Three links an hour per account.
 */
export const emailChangeHandler = (request: Request) =>
  withUser(request, async (user, db) => {
    if (!sameOrigin(request)) return json({ error: "forbidden" }, 403);
    const mailer = await getMailer(request);
    if (!mailer) return json({ error: "email_unavailable" }, 503);
    const input = (await body(request)) as { email?: unknown; current?: unknown } | null;
    if (typeof input?.email !== "string") return json({ error: "invalid" }, 400);
    const guesses = `password:${user.id}`;
    const max = limit(request, "LOGIN_FAIL_LIMIT", 10);
    const wait = await lockedOut(db, guesses, max);
    if (wait !== null) return tooMany(wait);
    const result = await requestEmailChange(db, user.id, {
      email: input.email,
      ...(typeof input.current === "string" && { current: input.current }),
    });
    if (!result.ok) {
      if (result.error === "wrong_password") await hit(db, guesses, max, FAIL_WINDOW);
      const status = { wrong_password: 401, email_taken: 409 }[result.error as string] ?? 400;
      return json({ error: result.error }, status);
    }
    await clearLimit(db, guesses);
    const sends = await hit(
      db,
      `email-change:${user.id}`,
      limit(request, "VERIFY_EMAIL_LIMIT", 3),
      HOUR,
    );
    if (!sends.allowed) return tooMany(sends.retryAfter);
    try {
      await mailer(emailChangeMail(siteOrigin(request), result.token, result.to));
    } catch (error) {
      console.error("Couldn't send the email-change link", error);
      return json({ error: "email_failed" }, 502);
    }
    return json({ ok: true, to: result.to });
  });

/** The link in that email: makes the new address the account's, then goes to the settings. */
export async function emailConfirmHandler(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const db = await getDb(request);
  const done = await confirmEmailChange(db, token, Date.now(), readToken(request) ?? undefined);
  if (!done.ok)
    return redirect(
      `/settings?tab=account&auth_error=${done.error === "email_taken" ? "email_taken" : "email_change_failed"}`,
    );
  await endSessions(request, done.userId, "signed_out");
  const mailer = await getMailer(request);
  if (mailer)
    await afterResponse(
      request,
      mailer(emailChangedNotice(siteOrigin(request), done.oldEmail, done.newEmail)),
    );
  return redirect("/settings?tab=account&email_changed=1");
}

/** `DELETE /api/auth/links/github|google`: unlinks a provider, never the last way to sign in. */
export const unlinkHandler = (request: Request, provider: string) =>
  withUser(request, async (user, db) => {
    if (!sameOrigin(request)) return json({ error: "forbidden" }, 403);
    if (provider !== "github" && provider !== "google") return json({ error: "invalid" }, 400);
    const result = await unlinkSocial(db, provider, user.id);
    if (result.ok) return json({ ok: true });
    return json({ error: result.error }, result.error === "not_linked" ? 404 : 409);
  });

export async function logoutHandler(request: Request) {
  if (!sameOrigin(request)) return json({ error: "forbidden" }, 403);
  const token = readToken(request);
  const db = await getDb(request);
  const session = token ? await userForToken(db, token) : null;
  if (token) await logout(db, token);
  // other tabs on this browser share the cookie that just ended: their sockets close with it
  if (session) await endSessions(request, session.user.id, "signed_out");
  return json({ ok: true }, 200, { "set-cookie": clearCookie(protocol(request)) });
}

export async function meHandler(request: Request) {
  const token = readToken(request);
  const session = token ? await userForToken(await getDb(request), token) : null;
  const site = await getPublicSettings(await getDb(request));
  const providers = {
    // the notice an admin set and whether new accounts may be made (shown before anyone signs in)
    notice: site.notice,
    signupsOpen: site.signupsOpen,
    github: githubConfig(request) !== null,
    google: googleConfig(request) !== null,
    // whether this server can publish to GitHub (needs the OAuth app and a key for the tokens)
    githubPublish: await (await import("../github/routes")).publishingAvailable(request),
    images: await (await import("../assets/routes")).imagesAvailable(request),
    // whether this server confirms addresses by email, and the public key of the sign-up CAPTCHA
    email: (await getMailer(request)) !== null,
    turnstile:
      getEnv(request, "TURNSTILE_SECRET") && getEnv(request, "TURNSTILE_SITE_KEY")
        ? getEnv(request, "TURNSTILE_SITE_KEY")
        : null,
  };
  if (!session || !token) return json({ user: null, providers });
  // Re-issue the cookie so the browser keeps it exactly as long as the (sliding) session lives.
  const linked = await linkedProviders(await getDb(request), session.user.id);
  return json({ user: { ...session.user, linked }, providers }, 200, {
    "set-cookie": sessionCookie(token, protocol(request), session.expiresAt - Date.now()),
  });
}

// ---- GitHub OAuth -------------------------------------------------------------------------

const githubConfig = (request: Request) => {
  const clientId = getEnv(request, "GITHUB_CLIENT_ID");
  const clientSecret = getEnv(request, "GITHUB_CLIENT_SECRET");
  return clientId && clientSecret ? { clientId, clientSecret } : null;
};

/** PUBLIC_URL overrides the origin for self-hosting behind a proxy that rewrites it. */
export const redirectUri = (request: Request) =>
  `${getEnv(request, "PUBLIC_URL")?.replace(/\/$/, "") ?? new URL(request.url).origin}/api/auth/github/callback`;

const redirect = (to: string, ...cookies: string[]) => {
  const headers = new Headers({ location: to, "cache-control": "no-store" });
  for (const cookie of cookies) headers.append("set-cookie", cookie);
  return new Response(null, { status: 302, headers });
};

/** Where a social flow ends: the editor to sign in, the account settings to link (`.link` mode). */
const LINK_BACK = "/settings?tab=account";

/** A link flow starts only from a signed-in session; this answers who, or null. */
async function linkingUser(request: Request) {
  const token = readToken(request);
  const session = token ? await userForToken(await getDb(request), token) : null;
  return session?.user ?? null;
}

export async function githubStartHandler(request: Request) {
  const link = new URL(request.url).searchParams.get("link") === "1";
  const cfg = githubConfig(request);
  if (!cfg)
    return redirect(
      link ? `${LINK_BACK}&auth_error=github_unavailable` : "/editor?auth_error=github_unavailable",
    );
  if (link && !(await linkingUser(request)))
    return redirect(`${LINK_BACK}&auth_error=unauthorized`);
  const { verifier, challenge } = await pkcePair();
  const state = randomState();
  return redirect(
    authorizeUrl(cfg, redirectUri(request), state, challenge),
    oauthCookie(`${state}.${verifier}${link ? ".link" : ""}`, protocol(request), 10 * 60 * 1000),
  );
}

export async function githubCallbackHandler(request: Request) {
  const cfg = githubConfig(request);
  const clear = oauthCookie("", protocol(request), 0);
  const fail = (code: string) => redirect(`/editor?auth_error=${code}`, clear);
  const params = new URL(request.url).searchParams;
  // a callback for connecting GitHub to publish shares this address with signing in; the cookie
  // that holds this browser's state says which one it is
  const connecting = readCookie(request, CONNECT_COOKIE);
  if (connecting && connecting.split(".")[0] === params.get("state"))
    return (await import("../github/routes")).connectCallbackHandler(request);
  const [state, verifier, mode] = readCookie(request, OAUTH_COOKIE)?.split(".") ?? [];
  const code = params.get("code");
  // The state in the URL must be the one this browser was given, or the callback was forged.
  if (!cfg || !state || !verifier || !code || params.get("state") !== state)
    return mode === "link"
      ? redirect(`${LINK_BACK}&auth_error=github_failed`, clear)
      : fail("github_failed");
  if (mode === "link") {
    const user = await linkingUser(request);
    if (!user) return redirect(`${LINK_BACK}&auth_error=unauthorized`, clear);
    const linked = await githubLink(
      await getDb(request),
      cfg,
      { code, verifier, redirectUri: redirectUri(request) },
      user.id,
    );
    return redirect(
      linked.ok ? `${LINK_BACK}&linked=github` : `${LINK_BACK}&auth_error=${linked.error}`,
      clear,
    );
  }
  const result = await githubSignIn(await getDb(request), cfg, {
    code,
    verifier,
    redirectUri: redirectUri(request),
  });
  if ("error" in result) return fail(result.error);
  return redirect("/editor", sessionCookie(result.token, protocol(request), SESSION_MS), clear);
}

// ---- Google sign-in -----------------------------------------------------------------------

const googleConfig = (request: Request) => {
  const clientId = getEnv(request, "GOOGLE_CLIENT_ID");
  const clientSecret = getEnv(request, "GOOGLE_CLIENT_SECRET");
  return clientId && clientSecret ? { clientId, clientSecret } : null;
};

const googleRedirectUri = (request: Request) =>
  `${getEnv(request, "PUBLIC_URL")?.replace(/\/$/, "") ?? new URL(request.url).origin}/api/auth/google/callback`;

export async function googleStartHandler(request: Request) {
  const link = new URL(request.url).searchParams.get("link") === "1";
  const cfg = googleConfig(request);
  if (!cfg)
    return redirect(
      link ? `${LINK_BACK}&auth_error=google_unavailable` : "/editor?auth_error=google_unavailable",
    );
  if (link && !(await linkingUser(request)))
    return redirect(`${LINK_BACK}&auth_error=unauthorized`);
  const { verifier, challenge } = await pkcePair();
  const state = randomState();
  return redirect(
    googleAuthorizeUrl(
      cfg,
      googleRedirectUri(request),
      state,
      challenge,
      getEnv(request, "GOOGLE_URL"),
    ),
    oauthCookie(
      `${state}.${verifier}${link ? ".link" : ""}`,
      protocol(request),
      10 * 60 * 1000,
      "google",
    ),
  );
}

export async function googleCallbackHandler(request: Request) {
  const cfg = googleConfig(request);
  const clear = oauthCookie("", protocol(request), 0, "google");
  const params = new URL(request.url).searchParams;
  const [state, verifier, mode] = readCookie(request, OAUTH_COOKIE)?.split(".") ?? [];
  const fail = (code: string) =>
    redirect(
      mode === "link" ? `${LINK_BACK}&auth_error=${code}` : `/editor?auth_error=${code}`,
      clear,
    );
  // The state in the URL must be the one this browser was given, or the callback was forged.
  if (!cfg || !state || !verifier || params.get("state") !== state) return fail("google_failed");
  const code = params.get("code");
  if (params.get("error") === "access_denied") return fail("google_denied");
  if (!code) return fail("google_failed");
  if (mode === "link") {
    const user = await linkingUser(request);
    if (!user) return fail("unauthorized");
    const linked = await googleLink(
      await getDb(request),
      cfg,
      { code, verifier, redirectUri: googleRedirectUri(request) },
      user.id,
      fetch,
      Date.now(),
      getEnv(request, "GOOGLE_URL"),
    );
    return linked.ok ? redirect(`${LINK_BACK}&linked=google`, clear) : fail(linked.error);
  }
  const result = await googleSignIn(
    await getDb(request),
    cfg,
    { code, verifier, redirectUri: googleRedirectUri(request) },
    fetch,
    Date.now(),
    getEnv(request, "GOOGLE_URL"),
  );
  if ("error" in result) return fail(result.error);
  return redirect("/editor", sessionCookie(result.token, protocol(request), SESSION_MS), clear);
}
