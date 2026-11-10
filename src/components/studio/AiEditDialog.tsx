import { useEffect, useMemo, useRef, useState } from "react";
import { Check, RefreshCw, Sparkles, Square } from "lucide-react";
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
import { AI_ACTIONS, actionInstruction, cleanEdit, type AiActionId } from "@/lib/ai/actions";
import { ai, useAi } from "@/lib/ai/integrations";
import { generateWithProvider } from "@/lib/ai/provider";
import { diffLines, diffStats } from "@/lib/editor/diff";
import { AiPicker } from "./AiPicker";
import { DiffTable } from "./DiffTable";

/**
 * What to change: an action on a selection (the writer may need to add a language or an instruction),
 * or a ready-made `instruction` such as the fix for a check, with a `label` for the title.
 */
export type AiEdit = { text: string; action?: AiActionId; instruction?: string; label?: string };

/**
 * Runs one action on the selected text and shows the result as a diff. Nothing reaches the draft
 * until the writer accepts.
 */
export function AiEditDialog({
  edit,
  onClose,
  onAccept,
}: {
  edit: AiEdit | null;
  onClose: () => void;
  onAccept: (text: string) => void;
}) {
  useAi();
  const connection = ai.connection();
  const ready = !!connection;
  const action = AI_ACTIONS.find((a) => a.id === edit?.action);
  const needs = !edit?.instruction && action && "needs" in action ? action.needs : null;
  const instructionFor = () =>
    edit?.instruction ?? (edit?.action ? actionInstruction(edit.action, input) : null);
  const [input, setInput] = useState("");
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [started, setStarted] = useState(false);
  const abort = useRef<AbortController | null>(null);

  const run = async () => {
    if (!edit || abort.current || !connection) return;
    const instruction = instructionFor();
    if (!instruction) return;
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true);
    setStarted(true);
    setError("");
    setResult("");
    try {
      await generateWithProvider(
        connection,
        { mode: "edit", instruction, text: edit.text },
        controller.signal,
        (e) => e.type === "text" && setResult((r) => r + e.text),
      );
    } catch (e) {
      if (!controller.signal.aborted)
        setError(e instanceof Error ? e.message : "AI generation failed.");
    } finally {
      abort.current = null;
      setBusy(false);
    }
  };

  // a new request starts clean; nothing is sent until the writer chooses the AI and presses Run
  const key = edit ? `${edit.action ?? edit.instruction}:${edit.text}` : "";
  useEffect(() => {
    abort.current?.abort();
    setInput("");
    setResult("");
    setError("");
    setStarted(false);
    return () => abort.current?.abort();
  }, [key]);

  const cleaned = result && edit ? cleanEdit(result, edit.text) : "";
  const rows = useMemo(
    () => (cleaned && edit ? diffLines(edit.text, cleaned) : []),
    [cleaned, edit],
  );
  const stats = diffStats(rows);

  return (
    <Dialog open={edit !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[90dvh] max-w-4xl flex-col [&_input]:text-base [&_input]:sm:text-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-5 text-primary" />{" "}
            {edit?.label ?? action?.label.replace("…", "")}
          </DialogTitle>
          <DialogDescription>
            Review the change. Your draft stays as it is until you accept.
          </DialogDescription>
        </DialogHeader>
        <AiPicker disabled={busy} />
        {ready && needs && (
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-0 flex-1 space-y-1">
              <Label htmlFor="ai-edit-input">
                {needs === "language" ? "Translate into" : "What should it do?"}
              </Label>
              <Input
                id="ai-edit-input"
                value={input}
                disabled={busy}
                maxLength={1000}
                placeholder={needs === "language" ? "e.g. French" : "e.g. Make the tone friendlier"}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void run()}
              />
            </div>
          </div>
        )}
        {busy && (
          <p role="status" className="text-sm text-muted-foreground">
            {result ? "Writing…" : "Thinking…"}
          </p>
        )}
        {error && (
          <p role="alert" className="wrap-break-word text-sm text-destructive">
            {error}
          </p>
        )}
        {cleaned && (
          <>
            <p className="text-xs text-muted-foreground">
              {stats.removed} line{stats.removed === 1 ? "" : "s"} removed, {stats.added} added
            </p>
            <DiffTable
              rows={rows}
              showAll
              follow={busy}
              left={edit?.instruction ? "Now" : "Selected text"}
              right="Suggestion"
            />
          </>
        )}
        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="outline" onClick={onClose}>
            Discard
          </Button>
          <div className="flex gap-2">
            {busy ? (
              <Button variant="outline" onClick={() => abort.current?.abort()}>
                <Square className="size-4" /> Stop
              </Button>
            ) : (
              <Button
                variant={started ? "outline" : "default"}
                disabled={!ready || !instructionFor()}
                onClick={() => void run()}
              >
                {started ? <RefreshCw className="size-4" /> : <Sparkles className="size-4" />}
                {started ? "Try again" : "Run"}
              </Button>
            )}
            <Button disabled={busy || !cleaned} onClick={() => onAccept(cleaned)}>
              <Check className="size-4" /> Accept
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
