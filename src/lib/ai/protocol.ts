// What the browser and the server agree on for AI integrations kept in an account (see src/server/ai).
// An integration here is only its setup: the API key is never part of it and is never sent.
import { z } from "zod";
import { PROVIDER_URLS, checkEndpoint, type ProviderId } from "./provider";

/** The most integrations one account keeps in the cloud. */
export const MAX_CLOUD_INTEGRATIONS = 20;

const PROVIDERS = Object.keys(PROVIDER_URLS) as [ProviderId, ...ProviderId[]];

export const integrationSchema = z.object({
  id: z.string().regex(/^[a-z0-9]{6,40}$/),
  name: z.string().trim().min(1).max(60),
  provider: z.enum(PROVIDERS),
  baseUrl: z
    .string()
    .max(300)
    .refine((url) => {
      try {
        checkEndpoint(url);
        return true;
      } catch {
        return false;
      }
    }, "Use an HTTPS endpoint (or localhost for a local model)"),
  models: z.array(z.string().trim().min(1).max(100)).max(100),
  /** When it last changed, so the newer copy wins. */
  updatedAt: z.number().int().nonnegative(),
});

export type CloudIntegration = z.infer<typeof integrationSchema>;
