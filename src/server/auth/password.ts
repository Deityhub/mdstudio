// PBKDF2-SHA256 through WebCrypto: runs unchanged on Workers and Node, no dependency. Workers
// refuses more than 100,000 iterations, so that is the ceiling; the count is stored in each hash,
// so raising ITERATIONS later re-hashes users on their next sign-in (see needsRehash).
// below the OWASP figure (600k) because of that platform cap; swap in a memory-hard hash
// if Workers ever allows one.
export const ITERATIONS = 100_000;
const PREFIX = "pbkdf2$sha256$";

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

async function derive(password: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string, iterations = ITERATIONS) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `${PREFIX}${iterations}$${b64(salt)}$${b64(await derive(password, salt, iterations))}`;
}

function parse(hash: string) {
  if (!hash.startsWith(PREFIX)) return null;
  const [iterations, salt, digest] = hash.slice(PREFIX.length).split("$");
  const n = Number(iterations);
  if (!Number.isInteger(n) || n < 1 || n > ITERATIONS || !salt || !digest) return null;
  try {
    return { iterations: n, salt: unb64(salt), digest: unb64(digest) };
  } catch {
    return null;
  }
}

/** Constant-time compare, so a wrong guess takes as long as a near miss. */
export const safeEqual = (a: Uint8Array, b: Uint8Array) => {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
};

export async function verifyPassword(password: string, hash: string) {
  const parsed = parse(hash);
  if (!parsed) return false;
  return safeEqual(await derive(password, parsed.salt, parsed.iterations), parsed.digest);
}

export const needsRehash = (hash: string) => (parse(hash)?.iterations ?? 0) < ITERATIONS;
