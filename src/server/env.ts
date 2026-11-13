// Settings and secrets: Workers puts them on the request's env, Node on process.env.
type WithEnv = Request & {
  runtime?: {
    cloudflare?: {
      env?: Record<string, unknown>;
      context?: { waitUntil?: (work: Promise<unknown>) => void };
    };
  };
};

export function getEnv(request: Request, name: string): string | undefined {
  const value = (request as WithEnv).runtime?.cloudflare?.env?.[name] ?? process.env[name];
  return typeof value === "string" && value ? value : undefined;
}

/** The public address of this site: PUBLIC_URL when a proxy hides it, else the request's own. */
export const siteOrigin = (request: Request) =>
  getEnv(request, "PUBLIC_URL")?.replace(/\/$/, "") ?? new URL(request.url).origin;

/** A Workers binding (a Durable Object namespace, for one), or undefined on Node. */
export const getBinding = (request: Request, name: string): unknown =>
  (request as WithEnv).runtime?.cloudflare?.env?.[name];

/** Whether this request is being served by Workers rather than the Node server. */
export const onWorkers = (request: Request) => !!(request as WithEnv).runtime?.cloudflare;

/** Workers' `waitUntil`, to let work finish after the response is sent; undefined on Node. */
export const getWaitUntil = (request: Request) => {
  const context = (request as WithEnv).runtime?.cloudflare?.context;
  return context?.waitUntil?.bind(context);
};
