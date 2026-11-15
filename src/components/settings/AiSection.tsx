import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AiIntegrationsDialog } from "@/components/studio/AiIntegrationsDialog";
import { Card } from "@/components/site/AppShell";
import { ai, needsKey, useAi } from "@/lib/ai/integrations";
import { useAiCloud } from "@/lib/ai/cloud";
import { PROVIDER_LABELS } from "@/lib/ai/models";
import { SettingsRow } from "./SettingsRow";

/** The AI providers the writer uses. Keys stay in this browser's session, never on a server. */
export function AiSection() {
  const state = useAi();
  useAiCloud();
  // the integration being updated, "new" for a blank form, null while the dialog is closed
  const [editing, setEditing] = useState<string | null>(null);
  const full =
    state.cloud === "on" && state.cloudLimit !== null && state.items.length >= state.cloudLimit;
  return (
    <section aria-label="AI">
      <Card>
        <SettingsRow
          title="AI integrations"
          description={
            <>
              The services you use (OpenAI, Anthropic, Gemini, Ollama or any compatible gateway),
              with their model and key. Keys are not saved to disk or sent to mdstudio.
              {full && ` Your account keeps up to ${state.cloudLimit}. Remove one to add another.`}
            </>
          }
        >
          <Button
            variant="outline"
            size="sm"
            pending={state.cloud === "loading"}
            disabled={full}
            onClick={() => setEditing("new")}
          >
            <Plus className="size-4" /> Add integration
          </Button>
        </SettingsRow>
        {state.items.length === 0 ? (
          <p className="px-4 py-4 text-[13px] text-muted-foreground sm:px-5">
            {state.cloud === "loading" ? "Loading your integrations" : "No integrations yet."}
          </p>
        ) : (
          <ul>
            {state.items.map((i) => (
              <li
                key={i.id}
                className="flex items-center gap-2 border-b border-border px-4 py-3 last:border-b-0 sm:px-5"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{i.name}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {PROVIDER_LABELS[i.provider]} · {needsKey(state, i.id) ? "Key needed" : "Ready"}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  aria-label={`Update ${i.name}`}
                  onClick={() => setEditing(i.id)}
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
        )}
      </Card>
      <AiIntegrationsDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        editId={editing}
        returnOnSave
      />
    </section>
  );
}
