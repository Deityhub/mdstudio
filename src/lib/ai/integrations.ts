import { useSyncExternalStore } from "react";
import { MODELS, PROVIDER_LABELS } from "./models";
import { PROVIDER_URLS, type AiConnection, type ProviderId } from "./provider";

/** One AI service the writer set up. The key is not part of it: keys live in memory only. */
export type Integration = {
  id: string;
  name: string;
  provider: ProviderId;
  baseUrl: string;
  /** What the writer typed (custom, Ollama) or the provider returned on a refresh. */
  models: string[];
  /** When it last changed, so the newer copy wins when this browser and the account both have it. */
  updatedAt: number;
};
export type AiState = {
  items: Integration[];
  /** Keys by integration id, in memory only. */
  keys: Record<string, string>;
  /** What the AI features use: an integration and one of its models. */
  selected: { id: string; model: string } | null;
  /**
   * Where the list lives: in this browser ("off"), being read from the account ("loading"), or in the
   * account ("on"). Signed in, the account's list is shown and changes are saved to it.
   */
  cloud: "off" | "loading" | "on";
  /** How many the account may keep, once its list has been read. */
  cloudLimit: number | null;
};

/** How the account's list is read and saved (see src/lib/ai/cloud.ts). It never carries a key. */
export type Remote = {
  list: () => Promise<{ items: Integration[]; limit: number }>;
  put: (item: Integration) => Promise<unknown>;
  remove: (id: string) => Promise<unknown>;
};

const KEY = "mdstudio-ai-integrations";
const EMPTY: AiState = { items: [], keys: {}, selected: null, cloud: "off", cloudLimit: null };

function stored(): Pick<AiState, "items" | "selected"> {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (!raw || !Array.isArray(raw.items)) return { items: [], selected: null };
    const items = (raw.items as Integration[])
      .filter((i) => i && typeof i.id === "string" && i.provider in PROVIDER_URLS)
      .map((i) => ({ ...i, updatedAt: typeof i.updatedAt === "number" ? i.updatedAt : 0 }));
    // the choice is kept even when its integration is not here (yet): it may come from the account
    const sel = raw.selected;
    const selected =
      sel && typeof sel.id === "string" && typeof sel.model === "string" ? sel : null;
    return { items, selected };
  } catch {
    return { items: [], selected: null };
  }
}

let state: AiState = { ...EMPTY, ...stored() };
const listeners = new Set<() => void>();
// What reads and saves the account's list while signed in, and who to tell when a save fails.
let remote: Remote | null = null;
let onRemoteError: (error: unknown) => void = () => {};
// Bumped on sign-out, so an answer that arrives after it is ignored.
let epoch = 0;

/** Saves a change to the account, when there is one. A failure is reported, not thrown. */
const toCloud = (send: (r: Remote) => Promise<unknown>) => {
  if (remote) send(remote).catch((e) => onRemoteError(e));
};

function change(next: AiState) {
  state = next;
  try {
    // the account's list is not kept in this browser; only this browser's own list is
    const items = next.cloud === "on" ? [] : next.items;
    localStorage.setItem(KEY, JSON.stringify({ items, selected: next.selected }));
  } catch {
    /* private mode: integrations are simply not remembered */
  }
  for (const l of listeners) l();
}

/** The models to offer: the provider's built-in list (or its refreshed one), or only the writer's own. */
export function modelsFor(i: Integration): string[] {
  if (i.provider === "compatible" || i.provider === "ollama") return i.models;
  return i.models.length ? i.models : [...MODELS[i.provider]];
}

/** Whether the integration is waiting for its key, as it is after a reload. Ollama never needs one. */
export const needsKey = (s: AiState, id: string) => {
  const i = s.items.find((x) => x.id === id);
  return !!i && i.provider !== "ollama" && !s.keys[id]?.trim();
};

const tidy = (models: string[]) => [...new Set(models.map((m) => m.trim()).filter(Boolean))];

export const ai = {
  get: () => state,
  subscribe: (l: () => void) => {
    listeners.add(l);
    return () => void listeners.delete(l);
  },
  /** Saves an integration and makes it the one in use. Returns its id. */
  add(input: {
    provider: ProviderId;
    name?: string;
    baseUrl?: string;
    apiKey?: string;
    models?: string[];
  }) {
    const id = Math.random().toString(36).slice(2) + Date.now().toString(36);
    const item: Integration = {
      id,
      name: input.name?.trim() || PROVIDER_LABELS[input.provider],
      provider: input.provider,
      baseUrl: input.baseUrl?.trim() || PROVIDER_URLS[input.provider],
      models: tidy(input.models ?? []),
      updatedAt: Date.now(),
    };
    toCloud((r) => r.put(item));
    change({
      ...state,
      items: [...state.items, item],
      keys: input.apiKey ? { ...state.keys, [id]: input.apiKey } : state.keys,
      selected: { id, model: modelsFor(item)[0] ?? "" },
    });
    return id;
  },
  update(
    id: string,
    patch: { name?: string; baseUrl?: string; apiKey?: string; models?: string[] },
  ) {
    const { apiKey, models, ...rest } = patch;
    // a key alone is not a change to the integration, so it is not saved or re-dated
    const changed = Object.keys(patch).some((k) => k !== "apiKey");
    const items = state.items.map((i) =>
      i.id === id
        ? {
            ...i,
            ...rest,
            ...(models && { models: tidy(models) }),
            ...(changed && { updatedAt: Date.now() }),
          }
        : i,
    );
    const keys = apiKey === undefined ? state.keys : { ...state.keys, [id]: apiKey };
    // keep the chosen model if it is still on offer, otherwise take the first
    const item = items.find((i) => i.id === id);
    let selected = state.selected;
    if (item && selected?.id === id) {
      const list = modelsFor(item);
      if (!list.includes(selected.model)) selected = { id, model: list[0] ?? "" };
    }
    change({ ...state, items, keys, selected });
    const saved = items.find((i) => i.id === id);
    if (saved && changed) toCloud((r) => r.put(saved));
  },
  remove(id: string) {
    const items = state.items.filter((i) => i.id !== id);
    const { [id]: _gone, ...keys } = state.keys;
    const first = items[0];
    const selected =
      state.selected?.id !== id
        ? state.selected
        : first
          ? { id: first.id, model: modelsFor(first)[0] ?? "" }
          : null;
    change({ ...state, items, keys, selected });
    toCloud((r) => r.remove(id));
  },
  /** Uses this integration, with `model` or else its first one. */
  select(id: string, model?: string) {
    const item = state.items.find((i) => i.id === id);
    if (!item) return;
    change({ ...state, selected: { id, model: model ?? modelsFor(item)[0] ?? "" } });
  },
  /**
   * Switches to the account's list: reads it, moves this browser's own integrations up (the newer
   * copy of one that is in both wins), and from then on shows and saves to the account. If it
   * cannot be reached the list stays in this browser and the error is thrown.
   */
  async joinCloud(r: Remote, onError: (error: unknown) => void) {
    if (state.cloud !== "off") return;
    const mine = epoch;
    change({ ...state, cloud: "loading" });
    try {
      const { items: theirs, limit } = await r.list();
      if (mine !== epoch) return void change({ ...state, cloud: "off" });
      const merged = new Map(theirs.map((i) => [i.id, i]));
      const upload = state.items.filter((i) => (merged.get(i.id)?.updatedAt ?? -1) < i.updatedAt);
      for (const i of upload) {
        await r.put(i);
        merged.set(i.id, i);
      }
      if (mine !== epoch) return void change({ ...state, cloud: "off" });
      const items = [...merged.values()].sort(
        (a, b) => a.updatedAt - b.updatedAt || a.id.localeCompare(b.id),
      );
      const sel = state.selected;
      const first = items[0];
      remote = r;
      onRemoteError = onError;
      change({
        ...state,
        items,
        // keep the earlier choice if it is still there, otherwise use the first one
        selected:
          sel && items.some((i) => i.id === sel.id)
            ? sel
            : first
              ? { id: first.id, model: modelsFor(first)[0] ?? "" }
              : null,
        cloud: "on",
        cloudLimit: limit,
      });
    } catch (error) {
      change({ ...state, cloud: "off" });
      throw error;
    }
  },
  /** Signing out: the account's integrations and every key are forgotten here. */
  leaveCloud() {
    epoch++;
    remote = null;
    if (state.cloud === "off") return;
    change({ items: [], keys: {}, selected: null, cloud: "off", cloudLimit: null });
  },
  /** What a request needs, or null while there is no selection, no model, or the key is missing. */
  connection(): AiConnection | null {
    const sel = state.selected;
    const item = state.items.find((i) => i.id === sel?.id);
    if (!sel || !item || !sel.model.trim() || needsKey(state, item.id)) return null;
    return {
      provider: item.provider,
      baseUrl: item.baseUrl,
      model: sel.model,
      apiKey: state.keys[item.id] ?? "",
    };
  },
};

/** The writer's integrations and which one is in use. */
export const useAi = () => useSyncExternalStore(ai.subscribe, ai.get, () => EMPTY);
