// Settings and secrets: Workers puts them on the request's env, Node on process.env.
type WithEnv = Request & { runtime?: { cloudflare?: { env?: Record<string, unknown> } } };

export function getEnv(request: Request, name: string): string | undefined {
  const value = (request as WithEnv).runtime?.cloudflare?.env?.[name] ?? process.env[name];
  return typeof value === "string" && value ? value : undefined;
}
