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
import { Textarea } from "@/components/ui/textarea";
import { type SuggestedMetadata } from "@/lib/ai/writing";
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
  const [reasoning, setReasoning] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [stopped, setStopped] = useState(false);
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
        mode === "metadata" ? { mode: "metadata", draft } : { mode: "write", topic, notes },
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
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label htmlFor="ai-draft">Markdown draft</Label>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => setDraft(content)}
                  >
                    Use current draft
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
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
          {stopped && (
            <p className="text-sm text-muted-foreground">Stopped. Partial content kept.</p>
          )}
          {mode === "metadata" && metadata && (
            <div className="space-y-3 border-t border-border pt-4">
              <div className="space-y-1">
                <Label htmlFor="ai-title">Suggested title</Label>
                <Input
                  id="ai-title"
                  value={metadata.title}
                  onChange={(e) => setMetadata({ ...metadata, title: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ai-description">Suggested description</Label>
                <Textarea
                  id="ai-description"
                  rows={2}
                  value={metadata.description}
                  onChange={(e) => setMetadata({ ...metadata, description: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ai-tags">Suggested tags</Label>
                <Input
                  id="ai-tags"
                  value={metadata.tags.join(", ")}
                  onChange={(e) =>
                    setMetadata({
                      ...metadata,
                      tags: e.target.value.split(",").map((tag) => tag.trim()),
                    })
                  }
                />
              </div>
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
                disabled={!metadata.title.trim()}
                onClick={() => {
                  onApply({ ...metadata, tags: metadata.tags.filter(Boolean) });
                  clearResult();
                  close(false);
                }}
              >
                <Check className="size-4" /> Apply to current draft
              </Button>
            )}
            {mode === "write" && output && !busy && (
              <Button
                onClick={async () => {
                  try {
                    await onCreate(output);
                    clearResult();
                    close(false);
                  } catch {
                    setError("Unable to save the generated draft.");
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
