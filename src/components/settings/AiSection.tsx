import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AiIntegrationsDialog } from "@/components/studio/AiIntegrationsDialog";
import { SettingsRow } from "./SettingsRow";

/** The AI providers the writer uses. Keys stay in this browser's session, never on a server. */
export function AiSection() {
  const [open, setOpen] = useState(false);
  return (
    <section aria-label="AI" className="max-w-2xl">
      <SettingsRow
        title="AI integrations"
        description="Choose a provider (OpenAI, Anthropic, Gemini, Ollama or any compatible gateway), its model and key. Keys are not saved to disk or sent to mdstudio."
      >
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          Manage…
        </Button>
      </SettingsRow>
      <AiIntegrationsDialog open={open} onOpenChange={setOpen} />
    </section>
  );
}
