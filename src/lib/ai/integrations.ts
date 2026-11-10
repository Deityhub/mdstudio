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
};
export type AiState = {
  items: Integration[];
  /** Keys by integration id, in memory only. */
  keys: Record<string, string>;
  /** What the AI features use: an integration and one of its models. */
  selected: { id: string; model: string } | null;
};

const KEY = "mdstudio-ai-integrations";
const EMPTY: AiState = { items: [], keys: {}, selected: null };

function stored(): Pick<AiState, "items" | "selected"> {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (!raw || !Array.isArray(raw.items)) return { items: [], selected: null };
    const items = (raw.items as Integration[]).filter(
      (i) => i && typeof i.id === "string" && i.provider in PROVIDER_URLS,
    );
    const sel = raw.selected;
    const selected =
      sel && items.some((i) => i.id === sel.id) && typeof sel.model === "string" ? sel : null;
    return { items, selected };
  } catch {
    return { items: [], selected: null };
  }
}

let state: AiState = { ...EMPTY, ...stored() };
const listeners = new Set<() => void>();
function change(next: AiState) {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify({ items: next.items, selected: next.selected }));
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
    };
    change({
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
    const items = state.items.map((i) =>
      i.id === id ? { ...i, ...rest, ...(models && { models: tidy(models) }) } : i,
    );
    const keys = apiKey === undefined ? state.keys : { ...state.keys, [id]: apiKey };
    // keep the chosen model if it is still on offer, otherwise take the first
    const item = items.find((i) => i.id === id);
    let selected = state.selected;
    if (item && selected?.id === id) {
      const list = modelsFor(item);
      if (!list.includes(selected.model)) selected = { id, model: list[0] ?? "" };
    }
    change({ items, keys, selected });
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
    change({ items, keys, selected });
  },
  /** Uses this integration, with `model` or else its first one. */
  select(id: string, model?: string) {
    const item = state.items.find((i) => i.id === id);
    if (!item) return;
    change({ ...state, selected: { id, model: model ?? modelsFor(item)[0] ?? "" } });
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
