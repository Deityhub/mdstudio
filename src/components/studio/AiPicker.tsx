import { useRef, useState } from "react";
import { RefreshCw, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ai, modelsFor, needsKey, useAi } from "@/lib/ai/integrations";
import { listModels } from "@/lib/ai/models";
import { useAiCloud } from "@/lib/ai/cloud";
import { AiIntegrationsDialog } from "./AiIntegrationsDialog";

/**
 * Which integration and model an AI task uses. With none set up it offers to set one up in a
 * second dialog, and comes back here with the new one selected.
 */
export function AiPicker({ disabled }: { disabled?: boolean }) {
  const state = useAi();
  useAiCloud();
  const [setup, setSetup] = useState<{ open: boolean; editId: string | null }>({
    open: false,
    editId: null,
  });
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const abort = useRef<AbortController | null>(null);
  const item = state.items.find((i) => i.id === state.selected?.id);
  const open = (editId: string | null) => setSetup({ open: true, editId });

  const refresh = async () => {
    if (!item) return;
    // listing models needs the endpoint and key, not a chosen model
    const connection = {
      provider: item.provider,
      baseUrl: item.baseUrl,
      apiKey: state.keys[item.id] ?? "",
    };
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setRefreshing(true);
    setError("");
    try {
      const models = await listModels(connection, controller.signal);
      if (!models.length) throw new Error("The provider returned no models.");
      ai.update(item.id, { models });
    } catch (e) {
      if (!controller.signal.aborted)
        setError(e instanceof Error ? e.message : "Couldn't load the models.");
    } finally {
      setRefreshing(false);
    }
  };

  const dialog = (
    <AiIntegrationsDialog
      open={setup.open}
      onOpenChange={(o) => setSetup((s) => ({ ...s, open: o }))}
      editId={setup.editId}
      returnOnSave
    />
  );

  if (state.cloud === "loading")
    return <p className="text-sm text-muted-foreground">Loading your AI integrations…</p>;
  if (!item)
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-dashed border-border p-3">
        <p className="text-sm text-muted-foreground">
          {state.items.length
            ? "Choose an AI integration to use."
            : "No AI integration is set up yet."}
        </p>
        <Button size="sm" disabled={disabled} onClick={() => open("new")}>
          <Settings2 className="size-4" /> Set up an integration
        </Button>
        {dialog}
      </div>
    );

  const models = modelsFor(item);
  const model = state.selected?.model ?? "";
  const waiting = needsKey(state, item.id);
  return (
    <div className="space-y-2">
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div className="min-w-0 space-y-1">
          <Label htmlFor="ai-integration">AI integration</Label>
          <Select
            disabled={disabled}
            value={item.id}
            onValueChange={(v) => {
              if (v === "__add") open("new");
              else {
                setError("");
                ai.select(v);
              }
            }}
          >
            <SelectTrigger id="ai-integration">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {state.items.map((i) => (
                <SelectItem key={i.id} value={i.id}>
                  {i.name}
                </SelectItem>
              ))}
              <SelectItem value="__add">Add another…</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-0 space-y-1">
          <Label htmlFor="ai-model">Model</Label>
          <Select
            disabled={disabled || !models.length}
            value={model || undefined}
            onValueChange={(v) => ai.select(item.id, v)}
          >
            <SelectTrigger id="ai-model">
              <SelectValue placeholder={models.length ? "Choose a model" : "No models yet"} />
            </SelectTrigger>
            <SelectContent>
              {models.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-1">
          {item.provider !== "compatible" && (
            <Button
              variant="outline"
              size="icon"
              aria-label="Refresh models"
              title="Ask the provider for its current models"
              disabled={disabled || refreshing || waiting}
              onClick={() => void refresh()}
            >
              <RefreshCw className={refreshing ? "size-4 animate-spin" : "size-4"} />
            </Button>
          )}
          <Button
            variant="outline"
            size="icon"
            aria-label="Manage AI integrations"
            disabled={disabled}
            onClick={() => open(null)}
          >
            <Settings2 className="size-4" />
          </Button>
        </div>
      </div>
      {waiting && (
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {item.name} needs its API key again.
          <Button variant="link" size="sm" className="h-auto p-0" onClick={() => open(item.id)}>
            Add key
          </Button>
        </p>
      )}
      {!models.length && !waiting && (
        <p className="text-xs text-muted-foreground">
          {item.provider === "ollama"
            ? "Refresh to list the models installed on this computer, or add model IDs in the integration."
            : "Add model IDs in the integration."}
        </p>
      )}
      {error && (
        <p role="alert" className="wrap-break-word text-sm text-destructive">
          {error}
        </p>
      )}
      {dialog}
    </div>
  );
}
