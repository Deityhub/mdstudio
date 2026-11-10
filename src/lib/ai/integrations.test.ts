import { beforeEach, describe, expect, it, vi } from "vitest";
import { MODELS } from "./models";

const load = async () => {
  vi.resetModules();
  return import("./integrations");
};
beforeEach(() => localStorage.clear());

describe("saved AI integrations", () => {
  it("starts with none and nothing selected", async () => {
    const { ai } = await load();
    expect(ai.get().items).toEqual([]);
    expect(ai.connection()).toBeNull();
  });

  it("adds an integration, selects it with its first model and keeps the key in memory only", async () => {
    const { ai, modelsFor } = await load();
    const id = ai.add({ provider: "gemini", apiKey: "secret-key" });
    const item = ai.get().items[0]!;
    expect(item).toMatchObject({ id, provider: "gemini", name: "Google Gemini" });
    expect(item.baseUrl).toBe("https://generativelanguage.googleapis.com/v1beta");
    expect(ai.get().selected).toEqual({ id, model: modelsFor(item)[0] });
    expect(ai.connection()).toMatchObject({ provider: "gemini", apiKey: "secret-key" });
    expect(JSON.stringify(localStorage)).not.toContain("secret-key");
  });

  it("remembers integrations and the selection after a reload, but asks for the key again", async () => {
    const first = await load();
    const id = first.ai.add({ provider: "anthropic", name: "Work", apiKey: "k" });
    const model = first.modelsFor(first.ai.get().items[0]!)[1]!;
    first.ai.select(id, model);
    const second = await load();
    expect(second.ai.get().items[0]).toMatchObject({ id, name: "Work" });
    expect(second.ai.get().selected).toEqual({ id, model });
    expect(second.needsKey(second.ai.get(), id)).toBe(true);
    expect(second.ai.connection()).toBeNull();
    second.ai.update(id, { apiKey: "again" });
    expect(second.ai.connection()).toMatchObject({ apiKey: "again", model });
  });

  it("lists the built-in models for a provider, or what the provider returned after a refresh", async () => {
    const { ai, modelsFor } = await load();
    const id = ai.add({ provider: "openai", apiKey: "k" });
    expect(modelsFor(ai.get().items[0]!)).toEqual(MODELS.openai);
    ai.update(id, { models: ["fresh-1", "fresh-2"] });
    expect(modelsFor(ai.get().items[0]!)).toEqual(["fresh-1", "fresh-2"]);
  });

  it("gives a custom integration only the models the writer typed", async () => {
    const { ai, modelsFor } = await load();
    const id = ai.add({
      provider: "compatible",
      baseUrl: "https://ai.example/v1",
      apiKey: "k",
      models: ["house-model", " second ", "house-model", ""],
    });
    expect(modelsFor(ai.get().items[0]!)).toEqual(["house-model", "second"]);
    expect(ai.get().selected).toEqual({ id, model: "house-model" });
  });

  it("needs no key for Ollama, and allows two integrations of one provider", async () => {
    const { ai, needsKey } = await load();
    const a = ai.add({ provider: "ollama", models: ["llama3.2"] });
    expect(ai.get().items[0]!.baseUrl).toBe("http://localhost:11434/v1");
    expect(needsKey(ai.get(), a)).toBe(false);
    expect(ai.connection()).toMatchObject({ provider: "ollama", model: "llama3.2" });
    ai.add({ provider: "ollama", name: "Second", models: ["x"] });
    expect(ai.get().items).toHaveLength(2);
  });

  it("selects another integration and falls back when the selected one is removed", async () => {
    const { ai } = await load();
    const a = ai.add({ provider: "openai", apiKey: "k" });
    const b = ai.add({ provider: "gemini", apiKey: "k" });
    expect(ai.get().selected?.id).toBe(b);
    ai.select(a);
    expect(ai.get().selected?.id).toBe(a);
    ai.remove(a);
    expect(ai.get().items.map((i) => i.id)).toEqual([b]);
    expect(ai.get().selected?.id).toBe(b);
    ai.remove(b);
    expect(ai.get().selected).toBeNull();
  });

  it("tells listeners about every change", async () => {
    const { ai } = await load();
    const seen = vi.fn();
    const off = ai.subscribe(seen);
    const id = ai.add({ provider: "openai", apiKey: "k" });
    ai.update(id, { name: "Renamed" });
    expect(seen).toHaveBeenCalledTimes(2);
    off();
    ai.remove(id);
    expect(seen).toHaveBeenCalledTimes(2);
  });
});
