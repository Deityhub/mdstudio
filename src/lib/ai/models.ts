import {
  checkEndpoint,
  generateWithProvider,
  type AiConnection,
  type ProviderId,
} from "./provider";

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Google Gemini",
  ollama: "Ollama (this computer)",
  compatible: "Custom / OpenAI-compatible",
};

/**
 * A short starting list for each hosted provider, best default first. Providers rename and retire
 * models, so "Refresh" asks the provider for its real list. Ollama and custom endpoints have no
 * built-in list: their models come from the writer (or, for Ollama, from a refresh).
 */
export const MODELS = {
  openai: ["gpt-5", "gpt-5-mini", "gpt-5-nano", "gpt-4.1"],
  anthropic: ["claude-sonnet-5-5", "claude-opus-5-5", "claude-haiku-5-5"],
  gemini: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.5-flash-lite"],
} as const;

/** Models that cannot write text, which the OpenAI list is full of. */
const NOT_TEXT =
  /embed|whisper|tts|dall-e|image|moderation|audio|realtime|transcribe|davinci|babbage/i;

type Listed = Pick<AiConnection, "provider" | "baseUrl" | "apiKey">;

/** Asks the provider which models this key can use. Fails the same ways a request would (CORS, key). */
export async function listModels(connection: Listed, signal: AbortSignal): Promise<string[]> {
  const { provider, apiKey } = connection;
  const base = checkEndpoint(connection.baseUrl);
  const headers: Record<string, string> =
    provider === "anthropic"
      ? {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        }
      : provider === "gemini"
        ? { "x-goog-api-key": apiKey }
        : { Authorization: `Bearer ${apiKey.trim() || "ollama"}` };
  const url =
    provider === "gemini"
      ? `${base}/models?pageSize=1000`
      : provider === "anthropic"
        ? `${base}/models?limit=100`
        : `${base}/models`;
  let response: Response;
  try {
    response = await fetch(url, { headers, signal, credentials: "omit", redirect: "error" });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new Error(
      "Could not reach this provider. Check the API URL, network, and whether it allows browser requests (CORS).",
    );
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      body.error?.message ?? body.message ?? `Provider request failed (${response.status}).`,
    );
  const ids: string[] =
    provider === "gemini"
      ? (body.models ?? [])
          .filter((m: { supportedGenerationMethods?: string[] }) =>
            m.supportedGenerationMethods?.includes("generateContent"),
          )
          .map((m: { name: string }) => m.name.replace(/^models\//, ""))
      : (body.data ?? []).map((m: { id: string }) => m.id);
  const usable = provider === "openai" ? ids.filter((id) => !NOT_TEXT.test(id)) : ids;
  return [...new Set(usable)].sort();
}

/** Services that speak the OpenAI protocol, to fill the endpoint of a custom integration. */
export const COMPATIBLE_PRESETS = [
  { label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1" },
  { label: "Groq", baseUrl: "https://api.groq.com/openai/v1" },
  { label: "Mistral", baseUrl: "https://api.mistral.ai/v1" },
  { label: "Together", baseUrl: "https://api.together.xyz/v1" },
] as const;

/**
 * Checks that the endpoint, key and browser access work. A provider with a model list is asked for
 * it (free of charge); a custom endpoint may have none, so it gets one tiny request instead.
 */
export async function testConnection(
  connection: AiConnection,
  signal: AbortSignal,
): Promise<{ models: string[] }> {
  if (connection.provider !== "compatible") return { models: await listModels(connection, signal) };
  await generateWithProvider(
    connection,
    { mode: "edit", instruction: "Reply with the single word OK.", text: "ping" },
    signal,
    () => {},
  );
  return { models: [] };
}
