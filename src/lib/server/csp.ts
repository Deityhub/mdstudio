/** Per-request nonce: 16 random bytes, base64. Uses Web Crypto only so it runs on Workers and Node. */
export function createNonce(): string {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
}

/**
 * Content-Security-Policy for HTML responses (SYSTEM_SPEC §8).
 * - Scripts: same-origin plus the SSR inline scripts that carry the request nonce.
 * - Styles keep 'unsafe-inline': CodeMirror and Radix inject style elements at runtime.
 * - connect-src is open to https and localhost because BYOK AI calls go straight from the
 *   browser to the writer's chosen provider (including local runners such as Ollama).
 */
export function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self'",
    "connect-src 'self' https: http://localhost:* http://127.0.0.1:*",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

/** Hosted images (`/a/...`) are plain files: nothing in them may load or run anything. */
export const IMAGE_CSP = "default-src 'none'; sandbox";
export const isImagePath = (pathname: string) => pathname.startsWith("/a/");

export function securityHeaders(nonce: string, image = false): Record<string, string> {
  return {
    "Content-Security-Policy": image ? IMAGE_CSP : buildCsp(nonce),
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  };
}

/** Pull request previews are public URLs for reviewers, not pages to index. */
export const previewHeaders = (preview: boolean): Record<string, string> =>
  preview ? { "X-Robots-Tag": "noindex, nofollow" } : {};

const nonces = new WeakMap<Request, string>();
export const setRequestNonce = (request: Request, nonce: string) => nonces.set(request, nonce);
export const getRequestNonce = (request: Request) => nonces.get(request);
