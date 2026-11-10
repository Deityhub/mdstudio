import { afterEach, describe, expect, it, vi } from "vitest";
import { COMPATIBLE_PRESETS, listModels, MODELS, testConnection } from "./models";
import { checkEndpoint } from "./provider";

const reply = (body: unknown, status = 200) =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status })),
  );
afterEach(() => vi.unstubAllGlobals());
const signal = new AbortController().signal;

describe("built-in models", () => {
  it("has a short list for each hosted provider", () => {
    for (const p of ["openai", "anthropic", "gemini"] as const)
      expect(MODELS[p].length).toBeGreaterThan(1);
  });
});

describe("asking a provider for its models", () => {
  it("reads OpenAI-style lists and leaves out models that cannot write text", async () => {
    reply({
      data: [
        { id: "gpt-b" },
        { id: "text-embedding-3-small" },
        { id: "gpt-a" },
        { id: "whisper-1" },
      ],
    });
    const models = await listModels(
      { provider: "openai", baseUrl: "https://api.openai.com/v1", apiKey: "k" },
      signal,
    );
    expect(models).toEqual(["gpt-a", "gpt-b"]);
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe("https://api.openai.com/v1/models");
    expect((init!.headers as Record<string, string>)["Authorization"]).toBe("Bearer k");
  });
  it("reads Anthropic lists with its own headers", async () => {
    reply({ data: [{ id: "claude-x" }] });
    const models = await listModels(
      { provider: "anthropic", baseUrl: "https://api.anthropic.com/v1", apiKey: "k" },
      signal,
    );
    expect(models).toEqual(["claude-x"]);
    const headers = vi.mocked(fetch).mock.calls[0]![1]!.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("k");
    expect(headers["anthropic-dangerous-direct-browser-access"]).toBe("true");
  });
  it("keeps only Gemini models that can generate text, without the models/ prefix", async () => {
    reply({
      models: [
        { name: "models/gemini-a", supportedGenerationMethods: ["generateContent"] },
        { name: "models/embed-1", supportedGenerationMethods: ["embedContent"] },
      ],
    });
    const models = await listModels(
      {
        provider: "gemini",
        baseUrl: "https://generativelanguage.googleapis.com/v1beta",
        apiKey: "k",
      },
      signal,
    );
    expect(models).toEqual(["gemini-a"]);
  });
  it("lists what a local Ollama has installed, without a key", async () => {
    reply({ data: [{ id: "llama3.2" }] });
    expect(
      await listModels(
        { provider: "ollama", baseUrl: "http://localhost:11434/v1", apiKey: "" },
        signal,
      ),
    ).toEqual(["llama3.2"]);
  });
  it("explains a refused key or an unreachable provider", async () => {
    reply({ error: { message: "Bad key" } }, 401);
    await expect(
      listModels({ provider: "openai", baseUrl: "https://api.openai.com/v1", apiKey: "k" }, signal),
    ).rejects.toThrow("Bad key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new TypeError("offline"))),
    );
    await expect(
      listModels({ provider: "openai", baseUrl: "https://api.openai.com/v1", apiKey: "k" }, signal),
    ).rejects.toThrow(/Could not reach/);
  });
  it("refuses an insecure remote endpoint", async () => {
    await expect(
      listModels({ provider: "openai", baseUrl: "http://ai.example/v1", apiKey: "k" }, signal),
    ).rejects.toThrow("HTTPS");
  });
});

describe("compatible service presets", () => {
  it("are secure endpoints the app accepts", () => {
    expect(COMPATIBLE_PRESETS.length).toBeGreaterThan(2);
    for (const p of COMPATIBLE_PRESETS) expect(() => checkEndpoint(p.baseUrl)).not.toThrow();
  });
});

describe("testing a connection", () => {
  it("asks a hosted provider for its models and says how many it found", async () => {
    reply({ data: [{ id: "gpt-a" }, { id: "gpt-b" }] });
    const result = await testConnection(
      { provider: "openai", baseUrl: "https://api.openai.com/v1", apiKey: "k", model: "" },
      signal,
    );
    expect(result).toEqual({ models: ["gpt-a", "gpt-b"] });
  });
  it("sends one tiny request to a custom endpoint, which may have no model list", async () => {
    const sse = 'data: {"choices":[{"delta":{"content":"OK"},"finish_reason":"stop"}]}\n\n';
    const fetchMock = vi.fn(async (..._args: unknown[]) => new Response(sse));
    vi.stubGlobal("fetch", fetchMock);
    const result = await testConnection(
      { provider: "compatible", baseUrl: "https://ai.example/v1", apiKey: "k", model: "m" },
      signal,
    );
    expect(result).toEqual({ models: [] });
    expect(fetchMock.mock.calls[0]![0]).toBe("https://ai.example/v1/chat/completions");
  });
  it("reports a refused key", async () => {
    reply({ error: { message: "Bad key" } }, 401);
    await expect(
      testConnection(
        { provider: "openai", baseUrl: "https://api.openai.com/v1", apiKey: "k", model: "" },
        signal,
      ),
    ).rejects.toThrow("Bad key");
  });
});
