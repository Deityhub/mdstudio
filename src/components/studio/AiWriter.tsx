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
import {
  generateWithProvider,
  PROVIDER_URLS,
  type AiConnection,
  type ProviderId,
} from "@/lib/ai/provider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { renderMarkdown } from "@/lib/markdown/markdown";

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
  const [connection, setConnection] = useState<AiConnection>({
    provider: "openai",
    baseUrl: PROVIDER_URLS.openai,
    model: "",
    apiKey: "",
  });
  const [connected, setConnected] = useState(false);
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
  useEffect(() => () => abort.current?.abort(), []);
  const generate = async () => {
    if (abort.current) return;
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
  return (
    <Dialog open={open} onOpenChange={close}>
      <Button
        variant="outline"
        size="sm"
        className="h-10 px-2 sm:px-3"
        onClick={() => {
          setDraft(content);
          setOpen(true);
        }}
      >
        <Sparkles className="h-4 w-4" /> <span className="hidden md:inline">AI writer</span>
        <span className="sr-only md:hidden">AI writer</span>
      </Button>
      <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] min-w-0 max-w-3xl overflow-y-auto overscroll-contain p-4 sm:max-h-[90dvh] sm:p-6 [&_input]:text-base [&_textarea]:text-base [&_input]:sm:text-sm [&_textarea]:sm:text-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" /> AI writer
          </DialogTitle>
          <DialogDescription>Your provider · Your API key</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 border-b border-border pb-4">
          <Label htmlFor="ai-provider">AI provider</Label>
          <Select
            disabled={busy}
            value={connection.provider}
            onValueChange={(value) => {
              const provider = value as ProviderId;
              setConnection({ provider, baseUrl: PROVIDER_URLS[provider], model: "", apiKey: "" });
              setConnected(false);
            }}
          >
            <SelectTrigger id="ai-provider">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="openai">OpenAI</SelectItem>
              <SelectItem value="anthropic">Anthropic</SelectItem>
              <SelectItem value="gemini">Google Gemini</SelectItem>
              <SelectItem value="compatible">Custom / OpenAI-compatible</SelectItem>
            </SelectContent>
          </Select>
          {connection.provider === "compatible" && (
            <div className="space-y-1">
              <Label htmlFor="ai-endpoint">API base URL</Label>
              <Input
                id="ai-endpoint"
                value={connection.baseUrl}
                disabled={busy}
                placeholder="https://your-provider.example/v1"
                onChange={(e) => {
                  setConnection({ ...connection, baseUrl: e.target.value });
                  setConnected(false);
                }}
              />
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="ai-model">Model ID</Label>
              <Input
                id="ai-model"
                value={connection.model}
                disabled={busy}
                placeholder="Model ID from your provider"
                onChange={(e) => {
                  setConnection({ ...connection, model: e.target.value });
                  setConnected(false);
                }}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ai-key">API key</Label>
              <Input
                id="ai-key"
                type="password"
                autoComplete="off"
                value={connection.apiKey}
                disabled={busy}
                placeholder="Your provider API key"
                onChange={(e) => {
                  setConnection({ ...connection, apiKey: e.target.value });
                  setConnected(false);
                }}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              disabled={
                busy ||
                !connection.apiKey.trim() ||
                !connection.model.trim() ||
                !connection.baseUrl.trim()
              }
              onClick={() => setConnected(true)}
            >
              <Check className="h-4 w-4" />{" "}
              {connected ? "Connection configured" : "Use this connection"}
            </Button>
            {connected && (
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => {
                  setConnection({ ...connection, apiKey: "" });
                  setConnected(false);
                }}
              >
                Disconnect
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Key stays in memory until this draft is closed or the page reloads. Requests go directly
            to your provider; browser access is required. Connection is verified on generation.
          </p>
        </div>
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
        {mode === "metadata" ? (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label htmlFor="ai-draft">Markdown draft</Label>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" disabled={busy} onClick={() => setDraft(content)}>
                  Use current draft
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => upload.current?.click()}
                >
                  <Upload className="h-4 w-4" /> Import .md
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Submitted text goes to your chosen provider. Provider charges apply.
          </p>
          {busy ? (
            <Button variant="outline" onClick={() => abort.current?.abort()}>
              <Square className="h-4 w-4" /> Stop
            </Button>
          ) : (
            <Button
              onClick={generate}
              disabled={!connected || (mode === "metadata" ? !draft.trim() : !topic.trim())}
            >
              <Sparkles className="h-4 w-4" />{" "}
              {mode === "metadata" ? "Suggest metadata" : "Generate draft"}
            </Button>
          )}
        </div>
        {busy && (
          <p role="status" className="text-sm text-muted-foreground">
            {output ? "Writing…" : "Thinking…"}
          </p>
        )}
        {reasoning && (
          <details className="text-xs text-muted-foreground">
            <summary>AI thinking</summary>
            <p className="mt-2 whitespace-pre-wrap break-words">{reasoning}</p>
          </details>
        )}
        {error && (
          <p role="alert" className="break-words text-sm text-destructive">
            {error}
          </p>
        )}
        {stopped && <p className="text-sm text-muted-foreground">Stopped. Partial content kept.</p>}
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
            <Button
              disabled={!metadata.title.trim()}
              onClick={() => {
                onApply({ ...metadata, tags: metadata.tags.filter(Boolean) });
                close(false);
              }}
            >
              <Check className="h-4 w-4" /> Apply to current draft
            </Button>
          </div>
        )}
        {mode === "write" && output && (
          <div className="space-y-3 border-t border-border pt-4">
            <article
              aria-label="Generated draft"
              className="md-preview max-h-80 overflow-y-auto"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(output) }}
            />
            <Button
              disabled={busy}
              onClick={async () => {
                try {
                  await onCreate(output);
                  close(false);
                } catch {
                  setError("Unable to save the generated draft.");
                }
              }}
            >
              <FilePlus className="h-4 w-4" /> Open as new draft
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
