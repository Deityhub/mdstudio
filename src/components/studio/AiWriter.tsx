import { useEffect, useRef, useState } from "react";
import { Sparkles, Square, FilePlus, Check, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DEFAULT_METADATA_FIELDS, METADATA_FIELDS } from "@/lib/ai/writing";
import type { MetadataFieldId, SuggestedMetadata } from "@/lib/ai/writing";
import { generateWithProvider } from "@/lib/ai/provider";
import { ai, useAi } from "@/lib/ai/integrations";
import { renderMarkdown } from "@/lib/markdown/markdown";
import { AiPicker } from "./AiPicker";
import { useStickToBottom } from "./useStickToBottom";

export function AiWriter({
  content,
  onApply,
  onCreate,
}: {
  content: string;
  onApply: (metadata: SuggestedMetadata) => void;
  onCreate: (markdown: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  useAi();
  const connection = ai.connection();
  const [mode, setMode] = useState("metadata");
  const [draft, setDraft] = useState("");
  const [topic, setTopic] = useState("");
  const [notes, setNotes] = useState("");
  const [output, setOutput] = useState("");
  const [metadata, setMetadata] = useState<SuggestedMetadata | null>(null);
  /** Which metadata fields the AI is asked to generate. */
  const [fields, setFields] = useState<MetadataFieldId[]>(DEFAULT_METADATA_FIELDS);
  const [reasoning, setReasoning] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [stopped, setStopped] = useState(false);
  const [creating, setCreating] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const upload = useRef<HTMLInputElement>(null);
  // the body scrolls on its own, and follows the text as it streams in
  const follow = useStickToBottom<HTMLDivElement>(busy, output + reasoning);
  useEffect(() => () => abort.current?.abort(), []);
  const generate = async () => {
    if (abort.current || !connection) return;
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true);
    setError("");
    setOutput("");
    setMetadata(null);
    setReasoning("");
    setStopped(false);
    try {
      await generateWithProvider(
        connection,
        mode === "metadata" ? { mode: "metadata", draft, fields } : { mode: "write", topic, notes },
        controller.signal,
        (event) => {
          if (event.type === "text") setOutput((text) => text + event.text);
          if (event.type === "reasoning") setReasoning((text) => text + event.text);
          if (event.type === "metadata") setMetadata(event.data);
        },
      );
    } catch (e) {
      if (controller.signal.aborted) setStopped(true);
      else setError(e instanceof Error ? e.message : "AI generation failed.");
    } finally {
      abort.current = null;
      setBusy(false);
    }
  };
  const close = (next: boolean) => {
    if (!next) abort.current?.abort();
    setOpen(next);
  };
  /** What was applied or opened is done with: the next visit starts without it. */
  const clearResult = () => {
    setMetadata(null);
    setOutput("");
    setReasoning("");
    setError("");
    setStopped(false);
  };
  const hasInput = mode === "metadata" ? !!draft.trim() : !!topic.trim();
  const hasResult = mode === "metadata" ? !!metadata : !!output;
  const toggleField = (field: MetadataFieldId) => {
    setFields((prev) =>
      prev.includes(field)
        ? prev.length > 1
          ? prev.filter((f) => f !== field)
          : prev
        : [...prev, field],
    );
  };
  const isFieldSelected = (field: MetadataFieldId) => fields.includes(field);
  const hasGenerated = (field: MetadataFieldId) =>
    metadata != null && metadata[field] !== undefined;
  const fieldValue = (field: MetadataFieldId) => metadata?.[field] ?? "";
  return (
    <Dialog open={open} onOpenChange={close}>
      <Button
        variant="outline"
        size="sm"
        className="h-8 px-2 sm:px-3"
        onClick={() => {
          setDraft(content);
          setOpen(true);
        }}
      >
        <Sparkles className="size-4" /> <span className="hidden md:inline">AI writer</span>
        <span className="sr-only md:hidden">AI writer</span>
      </Button>
      <DialogContent className="flex max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] min-w-0 max-w-3xl flex-col gap-0 overflow-hidden p-0 sm:max-h-[90dvh] [&_input]:text-base [&_textarea]:text-base [&_input]:sm:text-sm [&_textarea]:sm:text-sm">
        <DialogHeader className="px-4 pr-12 pt-4 sm:px-6 sm:pt-6">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-5 text-primary" /> AI writer
          </DialogTitle>
          <DialogDescription>Pick the AI to use, then what you want from it.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 border-b border-border px-4 py-3 sm:px-6">
          <AiPicker disabled={busy} />
          <Tabs
            value={mode}
            onValueChange={(value) => {
              setMode(value);
              setError("");
            }}
          >
            <TabsList className="grid h-auto w-full grid-cols-2">
              <TabsTrigger
                className="min-h-11 min-w-0 whitespace-normal text-center"
                value="metadata"
                disabled={busy}
              >
                Title, description & tags
              </TabsTrigger>
              <TabsTrigger
                className="min-h-11 min-w-0 whitespace-normal text-center"
                value="write"
                disabled={busy}
              >
                Write a topic
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <div
          ref={follow.ref}
          onScroll={follow.onScroll}
          className="min-h-0 min-w-0 flex-1 space-y-4 overflow-x-hidden overflow-y-auto overscroll-contain px-4 py-4 sm:px-6"
        >
          {mode === "metadata" ? (
            <div className="space-y-2">
              <div className="grid gap-3 rounded-md border bg-card p-3 sm:grid-cols-3">
                <Label className="text-sm font-medium col-span-full">Generate these fields</Label>
                {METADATA_FIELDS.map((field) => (
                  <label
                    key={field.id}
                    className="flex items-center gap-2 rounded border border-input px-2 py-1.5 text-sm cursor-pointer hover:bg-accent data-[state=checked]:bg-secondary data-[state=checked]:text-secondary-foreground"
                    data-state={isFieldSelected(field.id) ? "checked" : "unchecked"}
                  >
                    <input
                      type="checkbox"
                      id={`ai-field-${field.id}`}
                      checked={isFieldSelected(field.id)}
                      onChange={() => toggleField(field.id)}
                      className="shrink-0"
                    />
                    <div className="flex flex-col leading-none">
                      <span className="font-medium">{field.label}</span>
                      <span className="text-xs text-muted-foreground">{field.hint}</span>
                    </div>
                  </label>
                ))}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label htmlFor="ai-draft">Markdown draft</Label>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    pending={busy}
                    onClick={() => setDraft(content)}
                  >
                    Use current draft
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    pending={busy}
                    onClick={() => upload.current?.click()}
                  >
                    <Upload className="size-4" /> Import .md
                  </Button>
                </div>
              </div>
              <Textarea
                id="ai-draft"
                className="font-mono"
                rows={6}
                maxLength={100000}
                disabled={busy}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="# Paste your draft here"
              />
              <input
                hidden
                ref={upload}
                type="file"
                accept=".md,.markdown,.txt"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  try {
                    const text = await file.text();
                    if (text.length > 100000)
                      throw new Error("Drafts must be under 100,000 characters.");
                    setDraft(text);
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Unable to read this file.");
                  }
                }}
              />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="ai-topic">Topic</Label>
                <Input
                  id="ai-topic"
                  maxLength={5000}
                  disabled={busy}
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="e.g. Building accessible React forms"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ai-notes">Notes, audience & tone (optional)</Label>
                <Textarea
                  id="ai-notes"
                  rows={3}
                  maxLength={10000}
                  disabled={busy}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Key points, source material, or writing preferences"
                />
              </div>
            </div>
          )}
          {busy && (
            <p role="status" className="text-sm text-muted-foreground">
              {output ? "Writing…" : "Thinking…"}
            </p>
          )}
          {reasoning && (
            <details className="text-xs text-muted-foreground">
              <summary>AI thinking</summary>
              <p className="mt-2 whitespace-pre-wrap wrap-break-word">{reasoning}</p>
            </details>
          )}
          {error && (
            <p role="alert" className="wrap-break-word text-sm text-destructive">
              {error}
            </p>
          )}
          {mode === "metadata" && metadata && (
            <div className="space-y-3 border-t border-border pt-4">
              {METADATA_FIELDS.filter(
                (field) => isFieldSelected(field.id) && hasGenerated(field.id),
              ).map((field) => {
                const value = fieldValue(field.id);
                return (
                  <div key={field.id} className="space-y-1">
                    <Label htmlFor={`ai-meta-${field.id}`}>{field.label}</Label>
                    {field.input === "select" ? (
                      <Select
                        value={String(value)}
                        onValueChange={(v) => setMetadata({ ...metadata, [field.id]: v })}
                      >
                        <SelectTrigger id={`ai-meta-${field.id}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {field.options?.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : field.input === "tags" ? (
                      <Input
                        id={`ai-meta-${field.id}`}
                        value={Array.isArray(value) ? value.join(", ") : String(value ?? "")}
                        onChange={(e) =>
                          setMetadata({
                            ...metadata,
                            [field.id]: e.target.value
                              .split(",")
                              .map((tag) => tag.trim())
                              .filter(Boolean),
                          })
                        }
                      />
                    ) : field.input === "textarea" ? (
                      <Textarea
                        id={`ai-meta-${field.id}`}
                        rows={field.rows}
                        value={String(value ?? "")}
                        onChange={(e) => setMetadata({ ...metadata, [field.id]: e.target.value })}
                      />
                    ) : (
                      <Input
                        id={`ai-meta-${field.id}`}
                        value={String(value ?? "")}
                        onChange={(e) => setMetadata({ ...metadata, [field.id]: e.target.value })}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {mode === "write" && output && (
            <article
              aria-label="Generated draft"
              className="md-preview min-w-0 overflow-x-auto border-t border-border pt-4"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(output) }}
            />
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 sm:px-6">
          <p className="min-w-0 flex-1 text-xs text-muted-foreground">
            Submitted text goes to your chosen provider. Provider charges apply.
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            {busy ? (
              <Button variant="outline" onClick={() => abort.current?.abort()}>
                <Square className="size-4" /> Stop
              </Button>
            ) : (
              <Button
                variant={hasResult ? "outline" : "default"}
                onClick={generate}
                disabled={!connection || !hasInput}
              >
                <Sparkles className="size-4" />{" "}
                {hasResult
                  ? "Try again"
                  : mode === "metadata"
                    ? "Suggest metadata"
                    : "Generate draft"}
              </Button>
            )}
            {mode === "metadata" && metadata && !busy && (
              <Button
                disabled={Object.keys(metadata).length === 0}
                onClick={() => {
                  const next: SuggestedMetadata = {};
                  for (const field of fields) {
                    if (metadata[field] !== undefined) next[field] = metadata[field];
                  }
                  const tags = next["tags"];
                  if (Array.isArray(tags)) next["tags"] = tags.filter(Boolean);
                  onApply(next);
                  clearResult();
                  close(false);
                }}
              >
                <Check className="size-4" /> Apply to current draft
              </Button>
            )}
            {mode === "write" && output && !busy && (
              <Button
                loading={creating}
                onClick={async () => {
                  setCreating(true);
                  try {
                    await onCreate(output);
                    clearResult();
                    close(false);
                  } catch {
                    setError("Unable to save the generated draft.");
                  } finally {
                    setCreating(false);
                  }
                }}
              >
                <FilePlus className="size-4" /> Open as new draft
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
