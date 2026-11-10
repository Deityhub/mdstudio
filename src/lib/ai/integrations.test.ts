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

type Item = import("./integrations").Integration;
const cloudItem = (over: Partial<Item> = {}): Item => ({
  id: "cloud1abc",
  name: "From the cloud",
  provider: "openai",
  baseUrl: "https://api.openai.com/v1",
  models: [],
  updatedAt: 500,
  ...over,
});
const fakeRemote = (initial: Item[] = []) => {
  const stored = new Map(initial.map((i) => [i.id, i]));
  return {
    stored,
    list: vi.fn(async () => [...stored.values()]),
    put: vi.fn(async (i: Item) => void stored.set(i.id, i)),
    remove: vi.fn(async (id: string) => void stored.delete(id)),
  };
};
const localItems = () => JSON.parse(localStorage.getItem("mdstudio-ai-integrations") ?? "{}").items;

describe("integrations kept in the account", () => {
  it("shows the cloud ones and moves this browser's own up, keeping their keys in memory", async () => {
    const { ai, needsKey } = await load();
    const mine = ai.add({ provider: "gemini", apiKey: "local-key" });
    const remote = fakeRemote([cloudItem()]);
    await ai.joinCloud(remote, vi.fn());
    expect(ai.get().cloud).toBe("on");
    expect(
      ai
        .get()
        .items.map((i) => i.id)
        .sort(),
    ).toEqual([mine, "cloud1abc"].sort());
    expect(remote.put).toHaveBeenCalledTimes(1);
    expect(remote.stored.has(mine)).toBe(true);
    // the key never goes up, and the moved one still works here
    expect(JSON.stringify(remote.put.mock.calls)).not.toContain("local-key");
    expect(needsKey(ai.get(), mine)).toBe(false);
    // a cloud integration from another device needs its key here
    expect(needsKey(ai.get(), "cloud1abc")).toBe(true);
  });
  it("keeps the browser's list out of storage while signed in, and saves changes to the cloud", async () => {
    const { ai } = await load();
    const remote = fakeRemote();
    await ai.joinCloud(remote, vi.fn());
    expect(localItems()).toEqual([]);
    const id = ai.add({ provider: "openai", apiKey: "k" });
    expect(remote.put).toHaveBeenLastCalledWith(expect.objectContaining({ id, name: "OpenAI" }));
    expect(localItems()).toEqual([]);
    ai.update(id, { name: "Renamed" });
    expect(remote.put).toHaveBeenLastCalledWith(expect.objectContaining({ id, name: "Renamed" }));
    ai.remove(id);
    expect(remote.remove).toHaveBeenCalledWith(id);
  });
  it("lets the newer copy of the same integration win", async () => {
    const { ai } = await load();
    const id = ai.add({ provider: "openai", apiKey: "k" });
    const remote = fakeRemote([cloudItem({ id, name: "Stale", updatedAt: 1 })]);
    await ai.joinCloud(remote, vi.fn());
    expect(ai.get().items.find((i) => i.id === id)!.name).toBe("OpenAI");
    expect(remote.stored.get(id)!.name).toBe("OpenAI");
  });
  it("stays on this browser when the cloud cannot be reached", async () => {
    const { ai } = await load();
    const id = ai.add({ provider: "openai", apiKey: "k" });
    const remote = fakeRemote();
    remote.list.mockRejectedValueOnce(new Error("offline"));
    await expect(ai.joinCloud(remote, vi.fn())).rejects.toThrow("offline");
    expect(ai.get().cloud).toBe("off");
    expect(ai.get().items.map((i) => i.id)).toEqual([id]);
    expect(localItems()).toHaveLength(1);
  });
  it("forgets the account's integrations and keys on sign-out, and goes back to this browser", async () => {
    const { ai } = await load();
    const remote = fakeRemote([cloudItem()]);
    await ai.joinCloud(remote, vi.fn());
    ai.update("cloud1abc", { apiKey: "k" });
    ai.leaveCloud();
    expect(ai.get()).toMatchObject({ items: [], keys: {}, selected: null, cloud: "off" });
    const local = ai.add({ provider: "ollama", models: ["x"] });
    expect(remote.put).not.toHaveBeenCalledWith(expect.objectContaining({ id: local }));
    expect(localItems()).toHaveLength(1);
  });
  it("ignores an account that answers after the writer has already signed out", async () => {
    const { ai } = await load();
    let release!: (items: Item[]) => void;
    const remote = fakeRemote();
    remote.list.mockImplementationOnce(() => new Promise<Item[]>((r) => (release = r)));
    const joining = ai.joinCloud(remote, vi.fn());
    ai.leaveCloud();
    release([cloudItem()]);
    await joining;
    expect(ai.get().cloud).toBe("off");
    expect(ai.get().items).toEqual([]);
  });
  it("reports a failed save without losing the change on screen", async () => {
    const { ai } = await load();
    const remote = fakeRemote();
    const onError = vi.fn();
    await ai.joinCloud(remote, onError);
    remote.put.mockRejectedValueOnce(new Error("nope"));
    ai.add({ provider: "openai", apiKey: "k" });
    await Promise.resolve();
    await Promise.resolve();
    expect(onError).toHaveBeenCalled();
    expect(ai.get().items).toHaveLength(1);
  });
  it("restores the chosen integration once the cloud list has arrived", async () => {
    const first = await load();
    first.ai.add({ provider: "ollama", models: ["m"] });
    const remote = fakeRemote();
    await first.ai.joinCloud(remote, vi.fn());
    const id = first.ai.get().items[0]!.id;
    first.ai.select(id, "m");
    const second = await load();
    expect(second.ai.get().items).toEqual([]);
    await second.ai.joinCloud(remote, vi.fn());
    expect(second.ai.get().selected).toEqual({ id, model: "m" });
  });
  it("uses the first of the account's integrations when none was chosen here", async () => {
    const { ai } = await load();
    await ai.joinCloud(fakeRemote([cloudItem({ models: ["m1", "m2"] })]), vi.fn());
    expect(ai.get().selected).toEqual({ id: "cloud1abc", model: "m1" });
  });
});
