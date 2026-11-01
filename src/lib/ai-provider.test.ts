import { afterEach, describe, expect, it, vi } from "vitest";
import { buildProviderRequest, generateWithProvider, type AiConnection } from "./ai-provider";

const connection: AiConnection = { provider: "compatible", baseUrl: "https://ai.example/v1", model: "writer-model", apiKey: "test-only-key" };
afterEach(() => vi.unstubAllGlobals());
describe("independent AI providers", () => {
  it("uses the writer's chosen endpoint, model and key", () => {
    const request = buildProviderRequest(connection, { mode: "write", topic: "Markdown", notes: "" });
    expect(request.url).toBe("https://ai.example/v1/chat/completions");
    expect(request.headers.Authorization).toBe("Bearer test-only-key");
    expect(request.body.model).toBe("writer-model");
  });
  it("uses native Anthropic and Gemini request shapes", () => {
    const input = { mode: "metadata" as const, draft: "# Markdown" };
    const anthropic = buildProviderRequest({ ...connection, provider: "anthropic", baseUrl: "https://api.anthropic.com/v1" }, input);
    expect(anthropic.url).toBe("https://api.anthropic.com/v1/messages");
    expect(anthropic.headers["x-api-key"]).toBe("test-only-key");
    const gemini = buildProviderRequest({ ...connection, provider: "gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta" }, input);
    expect(gemini.url).toBe("https://generativelanguage.googleapis.com/v1beta/models/writer-model:streamGenerateContent?alt=sse");
    expect(gemini.headers["x-goog-api-key"]).toBe("test-only-key");
  });
  it("rejects nonsecure remote endpoints", () => {
    expect(() => buildProviderRequest({ ...connection, baseUrl: "http://ai.example/v1" }, { mode: "write", topic: "Test", notes: "" })).toThrow("HTTPS");
  });
  it("parses streamed metadata into title, description and tags", async () => {
    const text = JSON.stringify({ title: "Clear title", description: "A useful description", tags: ["markdown", "writing"] });
    const frame = `data: ${JSON.stringify({ choices: [{ delta: { content: text }, finish_reason: null }] })}\n\ndata: [DONE]\n\n`;
    const fetch = vi.fn().mockResolvedValue(new Response(frame)); vi.stubGlobal("fetch", fetch);
    const events: unknown[] = [];
    await generateWithProvider(connection, { mode: "metadata", draft: "# Markdown" }, new AbortController().signal, (event) => events.push(event));
    expect(events).toEqual([{ type: "metadata", data: { title: "Clear title", description: "A useful description", tags: ["markdown", "writing"] } }, { type: "done" }]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("never retries a provider denial", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ error: { message: "Denied" } }, { status: 403 })); vi.stubGlobal("fetch", fetch);
    await expect(generateWithProvider(connection, { mode: "write", topic: "Test", notes: "" }, new AbortController().signal, () => {})).rejects.toThrow("Denied");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("forwards Stop signal to the provider", async () => {
    const controller = new AbortController();
    const fetch = vi.fn().mockImplementation((_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(new DOMException("Stopped", "AbortError")))));
    vi.stubGlobal("fetch", fetch);
    const result = generateWithProvider(connection, { mode: "write", topic: "Test", notes: "" }, controller.signal, () => {});
    controller.abort();
    await expect(result).rejects.toThrow("Stopped");
    expect(fetch.mock.calls[0]?.[1]?.signal).toBe(controller.signal);
  });
});