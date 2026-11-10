import { useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ai, needsKey, useAi } from "@/lib/ai/integrations";
import { PROVIDER_LABELS } from "@/lib/ai/models";
import { PROVIDER_URLS, type ProviderId } from "@/lib/ai/provider";

type View = { kind: "list" } | { kind: "form"; id: string | null };

/**
 * The writer's AI integrations: which services they use and how to reach them. Keys are kept in
 * memory only, so after a reload an integration asks for its key again.
 */
export function AiIntegrationsDialog({
  open,
  onOpenChange,
  editId = null,
  returnOnSave = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Open straight on this integration's form (to give it a key), or "new" for a blank one. */
  editId?: string | null;
  /** Close after saving, going back to the dialog that asked for it. */
  returnOnSave?: boolean;
}) {
  const state = useAi();
  const [view, setView] = useState<View>({ kind: "list" });
  // each time it opens: the form for a given integration, a new one when there are none, else the list
  useEffect(() => {
    if (!open) return;
    setView(
      editId === "new"
        ? { kind: "form", id: null }
        : editId
          ? { kind: "form", id: editId }
          : ai.get().items.length
            ? { kind: "list" }
            : { kind: "form", id: null },
    );
  }, [open, editId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-1rem)] max-w-lg overflow-y-auto [&_input]:text-base [&_input]:sm:text-sm">
        <DialogHeader>
          <DialogTitle>AI integrations</DialogTitle>
          <DialogDescription>
            The AI services you use. Requests go straight from your browser to them.
          </DialogDescription>
        </DialogHeader>
        {view.kind === "list" ? (
          <>
            <ul className="space-y-2">
              {state.items.map((i) => (
                <li
                  key={i.id}
                  className="flex items-center gap-2 rounded-md border border-border px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{i.name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {PROVIDER_LABELS[i.provider]} ·{" "}
                      {needsKey(state, i.id) ? "Key needed" : "Ready"}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    aria-label={`Edit ${i.name}`}
                    onClick={() => setView({ kind: "form", id: i.id })}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    aria-label={`Remove ${i.name}`}
                    onClick={() => ai.remove(i.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              Names, endpoints and models are remembered on this device. API keys are not: they stay
              in memory until the page reloads.
            </p>
            <DialogFooter>
              <Button onClick={() => setView({ kind: "form", id: null })}>
                <Plus className="size-4" /> Add integration
              </Button>
            </DialogFooter>
          </>
        ) : (
          <IntegrationForm
            id={view.id}
            onCancel={() =>
              state.items.length && !returnOnSave ? setView({ kind: "list" }) : onOpenChange(false)
            }
            onSaved={() => (returnOnSave ? onOpenChange(false) : setView({ kind: "list" }))}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function IntegrationForm({
  id,
  onCancel,
  onSaved,
}: {
  id: string | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const existing = id ? ai.get().items.find((i) => i.id === id) : undefined;
  const [provider, setProvider] = useState<ProviderId>(existing?.provider ?? "openai");
  const [name, setName] = useState(existing?.name ?? "");
  const [baseUrl, setBaseUrl] = useState(existing?.baseUrl ?? PROVIDER_URLS.openai);
  const [apiKey, setApiKey] = useState((id && ai.get().keys[id]) || "");
  const [models, setModels] = useState(existing?.models.join(", ") ?? "");
  const local = provider === "ollama";
  const custom = provider === "compatible";
  const list = models.split(",").filter((m) => m.trim());
  const valid =
    (!(local || custom) || baseUrl.trim()) &&
    (local || apiKey.trim()) &&
    (!custom || list.length > 0);

  const save = () => {
    const input = {
      name,
      apiKey,
      ...(local || custom ? { baseUrl } : {}),
      ...(local || custom ? { models: list } : {}),
    };
    if (id) ai.update(id, { ...input, name: name.trim() || PROVIDER_LABELS[provider] });
    else ai.add({ provider, ...input });
    onSaved();
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor="ai-provider">AI provider</Label>
        <Select
          disabled={!!id}
          value={provider}
          onValueChange={(v) => {
            setProvider(v as ProviderId);
            setBaseUrl(PROVIDER_URLS[v as ProviderId]);
          }}
        >
          <SelectTrigger id="ai-provider">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(PROVIDER_LABELS) as ProviderId[]).map((p) => (
              <SelectItem key={p} value={p}>
                {PROVIDER_LABELS[p]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="ai-name">Name (optional)</Label>
        <Input
          id="ai-name"
          value={name}
          maxLength={60}
          placeholder={PROVIDER_LABELS[provider]}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      {(local || custom) && (
        <div className="space-y-1">
          <Label htmlFor="ai-endpoint">API base URL</Label>
          <Input
            id="ai-endpoint"
            value={baseUrl}
            placeholder="https://your-provider.example/v1"
            onChange={(e) => setBaseUrl(e.target.value)}
          />
        </div>
      )}
      {!local && (
        <div className="space-y-1">
          <Label htmlFor="ai-key">API key</Label>
          <Input
            id="ai-key"
            type="password"
            autoComplete="off"
            value={apiKey}
            placeholder="Your provider API key"
            onChange={(e) => setApiKey(e.target.value)}
          />
        </div>
      )}
      {(local || custom) && (
        <div className="space-y-1">
          <Label htmlFor="ai-models">{custom ? "Model IDs" : "Model IDs (optional)"}</Label>
          <Input
            id="ai-models"
            value={models}
            placeholder={
              local ? "e.g. llama3.2 (or refresh to list them)" : "e.g. my-model, other-model"
            }
            onChange={(e) => setModels(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Separate several with commas. {custom ? "These are the only models you can pick." : ""}
          </p>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        {local
          ? "Runs on your computer, so nothing leaves it. Ollama must allow this site: start it with OLLAMA_ORIGINS set to this address."
          : "The key stays in memory until the page reloads. The provider must allow requests from a browser."}
      </p>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button disabled={!valid} onClick={save}>
          {id ? "Save" : "Add integration"}
        </Button>
      </div>
    </div>
  );
}
