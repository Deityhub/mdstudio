// Shared by the /api/auth/* route files so each stays a one-liner.
import { getDb } from "../db";
import { getEnv } from "../env";
import { getMailer } from "../mail";
import { canonicalEmail } from "./email";
import { findForReset, issueReset, resetMail, resetPassword } from "./reset";
import { authorizeUrl, githubSignIn, pkcePair, randomState } from "./github";
import {
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
import {
  confirmVerification,
  hasLiveVerification,
  issueVerification,
  verificationMail,
} from "./verify";
import { withUser } from "./guard";

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

const STATUS = { invalid: 400, email_taken: 409, invalid_credentials: 401 } as const;

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

/** Public address for links in emails: PUBLIC_URL when a proxy hides it. */
const siteOrigin = (request: Request) =>
  getEnv(request, "PUBLIC_URL")?.replace(/\/$/, "") ?? new URL(request.url).origin;

export async function signupHandler(request: Request) {
  if (!sameOrigin(request)) return json({ error: "forbidden" }, 403);
  const db = await getDb(request);
  const ip = ipOf(request);
  if (ip !== "unknown") {
    const t = await hit(db, `signup:${ip}`, limit(request, "SIGNUP_LIMIT", 5), HOUR);
    if (!t.allowed) return tooMany(t.retryAfter);
  }
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
      const token = await issueVerification(db, user);
      await mailer(verificationMail(siteOrigin(request), token, user.email));
    } catch (error) {
      console.error("Couldn't send the verification email", error);
      return json({ error: "email_failed" }, 502);
    }
    return json({ ok: true, sent: true });
  });

export async function logoutHandler(request: Request) {
  if (!sameOrigin(request)) return json({ error: "forbidden" }, 403);
  const token = readToken(request);
  if (token) await logout(await getDb(request), token);
  return json({ ok: true }, 200, { "set-cookie": clearCookie(protocol(request)) });
}

export async function meHandler(request: Request) {
  const token = readToken(request);
  const session = token ? await userForToken(await getDb(request), token) : null;
  const providers = {
    github: githubConfig(request) !== null,
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
  return json({ user: session.user, providers }, 200, {
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
const redirectUri = (request: Request) =>
  `${getEnv(request, "PUBLIC_URL")?.replace(/\/$/, "") ?? new URL(request.url).origin}/api/auth/github/callback`;

const redirect = (to: string, ...cookies: string[]) => {
  const headers = new Headers({ location: to, "cache-control": "no-store" });
  for (const cookie of cookies) headers.append("set-cookie", cookie);
  return new Response(null, { status: 302, headers });
};

export async function githubStartHandler(request: Request) {
  const cfg = githubConfig(request);
  if (!cfg) return redirect("/editor?auth_error=github_unavailable");
  const { verifier, challenge } = await pkcePair();
  const state = randomState();
  return redirect(
    authorizeUrl(cfg, redirectUri(request), state, challenge),
    oauthCookie(`${state}.${verifier}`, protocol(request), 10 * 60 * 1000),
  );
}

export async function githubCallbackHandler(request: Request) {
  const cfg = githubConfig(request);
  const clear = oauthCookie("", protocol(request), 0);
  const fail = (code: string) => redirect(`/editor?auth_error=${code}`, clear);
  const params = new URL(request.url).searchParams;
  const [state, verifier] = readCookie(request, OAUTH_COOKIE)?.split(".") ?? [];
  const code = params.get("code");
  // The state in the URL must be the one this browser was given, or the callback was forged.
  if (!cfg || !state || !verifier || !code || params.get("state") !== state)
    return fail("github_failed");
  const result = await githubSignIn(await getDb(request), cfg, {
    code,
    verifier,
    redirectUri: redirectUri(request),
  });
  if ("error" in result) return fail(result.error);
  return redirect("/editor", sessionCookie(result.token, protocol(request), SESSION_MS), clear);
}
