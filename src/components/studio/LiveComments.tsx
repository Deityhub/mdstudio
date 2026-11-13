import { Check, MessageSquarePlus, PencilLine, RotateCcw, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MAX_BODY, type Thread, canDelete } from "@/lib/collab/thread-rules";
import type { Threads } from "@/lib/collab/threads";
import { cn } from "@/lib/utils";

const when = (at: number) =>
  new Date(at).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

const WHY: Record<string, string> = {
  changed: "The words were edited since, so this can't be applied as it was meant.",
  gone: "The words were deleted, so there is nothing to replace.",
  closed: "This was already dealt with.",
  not_found: "This thread is gone.",
};

/**
 * Comments and suggestions on the words of a draft being edited together: made on a selection,
 * shown on the words (click a thread to go to them, click the marked words to come here), answered,
 * resolved, and for a suggestion accepted, which makes the edit. Anyone invited may do all of it; a
 * person deletes their own, and the draft's owner deletes anyone's.
 */
export function LiveComments({
  threads,
  actions,
  userId,
  isOwner,
  activeId,
  canSelect,
  onComment,
  onSuggest,
  onGo,
}: {
  threads: Thread[];
  actions: Threads;
  userId: string;
  isOwner: boolean;
  activeId: string | null;
  /** Whether words are selected in the editor, for the two buttons above the list. */
  canSelect: boolean;
  onComment: () => void;
  onSuggest: () => void;
  onGo: (t: Thread) => void;
}) {
  const open = threads.filter((t) => t.status === "open");
  const closed = threads.filter((t) => t.status !== "open");
  const [showClosed, setShowClosed] = useState(false);
  const active = useRef<HTMLLIElement | null>(null);
  useEffect(() => void active.current?.scrollIntoView({ block: "nearest" }), [activeId]);

  return (
    <div className="grid gap-3" data-testid="live-comments">
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" disabled={!canSelect} onClick={onComment}>
          <MessageSquarePlus className="size-3.5" /> Comment on selection
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={!canSelect} onClick={onSuggest}>
          <PencilLine className="size-3.5" /> Suggest an edit
        </Button>
      </div>
      {!canSelect && (
        <p className="text-xs text-muted-foreground">Select some words in the draft first.</p>
      )}
      {open.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No open comments. People editing this draft see them here as they are written.
        </p>
      )}
      <ul className="grid gap-2" aria-label="Open comments and suggestions">
        {open.map((t) => (
          <ThreadItem
            key={t.id}
            t={t}
            actions={actions}
            userId={userId}
            isOwner={isOwner}
            current={t.id === activeId}
            refActive={t.id === activeId ? active : undefined}
            onGo={onGo}
          />
        ))}
      </ul>
      {closed.length > 0 && (
        <div className="grid gap-2">
          <button
            type="button"
            className="text-left text-xs text-muted-foreground underline-offset-2 hover:underline"
            aria-expanded={showClosed}
            onClick={() => setShowClosed((v) => !v)}
          >
            {showClosed ? "Hide" : "Show"} {closed.length} closed
          </button>
          {showClosed && (
            <ul className="grid gap-2" aria-label="Closed comments and suggestions">
              {closed.map((t) => (
                <ThreadItem
                  key={t.id}
                  t={t}
                  actions={actions}
                  userId={userId}
                  isOwner={isOwner}
                  current={t.id === activeId}
                  onGo={onGo}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function ThreadItem({
  t,
  actions,
  userId,
  isOwner,
  current,
  refActive,
  onGo,
}: {
  t: Thread;
  actions: Threads;
  userId: string;
  isOwner: boolean;
  current: boolean;
  refActive?: React.RefObject<HTMLLIElement | null> | undefined;
  onGo: (t: Thread) => void;
}) {
  const [answer, setAnswer] = useState("");
  const isOpen = t.status === "open";
  const words = t.gone ? t.original : t.text || t.original;
  const tell = (result: { ok: boolean; error?: string }) => {
    if (!result.ok) toast.error(WHY[result.error ?? ""] ?? "That didn't work. Try again.");
  };

  return (
    <li
      ref={refActive}
      data-thread-id={t.id}
      data-state={t.status}
      className={cn(
        "grid gap-1.5 rounded-md border border-border p-2 text-sm",
        current && "ring-1 ring-ring",
        !isOpen && "opacity-70",
      )}
    >
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="truncate font-medium text-foreground">{t.author.name}</span>
        <span className="shrink-0">{when(t.createdAt)}</span>
      </div>
      <button
        type="button"
        disabled={t.gone}
        className="truncate text-left text-xs text-muted-foreground underline-offset-2 hover:underline disabled:no-underline"
        onClick={() => onGo(t)}
        title={t.gone ? "The words were deleted" : "Go to the words"}
      >
        “{words.replace(/\s+/g, " ").trim().slice(0, 80)}”{t.gone ? " (deleted)" : ""}
        {t.changed && !t.gone ? " (edited since)" : ""}
      </button>
      {t.kind === "suggestion" && (
        <p className="grid gap-0.5 rounded bg-muted/50 px-2 py-1">
          <span className="text-xs text-muted-foreground">Suggested change</span>
          <span className="whitespace-pre-wrap wrap-break-word text-muted-foreground line-through">
            {t.original}
          </span>
          <span className="whitespace-pre-wrap wrap-break-word">
            {t.proposed || "(delete these words)"}
          </span>
        </p>
      )}
      {t.body && <p className="whitespace-pre-wrap wrap-break-word">{t.body}</p>}
      {t.status === "accepted" && <p className="text-xs text-muted-foreground">Accepted</p>}
      {t.status === "rejected" && <p className="text-xs text-muted-foreground">Rejected</p>}
      {t.status === "resolved" && <p className="text-xs text-muted-foreground">Resolved</p>}

      {t.replies.map((r) => (
        <div key={r.id} className="ml-3 grid gap-0.5 border-l border-border pl-2">
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span className="truncate font-medium text-foreground">{r.author.name}</span>
            <span className="flex shrink-0 items-center gap-1">
              {when(r.createdAt)}
              {canDelete(r, userId, isOwner) && (
                <button
                  type="button"
                  aria-label={`Delete reply by ${r.author.name}`}
                  className="rounded p-0.5 hover:text-destructive"
                  onClick={() => actions.removeReply(r.id)}
                >
                  <Trash2 className="size-3" />
                </button>
              )}
            </span>
          </div>
          <p className="whitespace-pre-wrap wrap-break-word">{r.body}</p>
        </div>
      ))}

      {isOpen && (
        <form
          className="flex gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            const r = actions.reply(t.id, answer);
            if (r.ok) setAnswer("");
            else if (r.error !== "empty") toast.error("That reply can't be posted.");
          }}
        >
          <Textarea
            rows={1}
            maxLength={MAX_BODY}
            value={answer}
            aria-label={`Reply to ${t.author.name}`}
            placeholder="Reply"
            className="min-h-8 flex-1 py-1 text-sm"
            onChange={(e) => setAnswer(e.target.value)}
          />
          <Button type="submit" size="sm" variant="outline" disabled={!answer.trim()}>
            Reply
          </Button>
        </form>
      )}

      <div className="flex flex-wrap justify-end gap-1">
        {isOpen && t.kind === "suggestion" && (
          <>
            <Button
              type="button"
              size="sm"
              className="h-7 px-2"
              onClick={() => tell(actions.accept(t.id))}
            >
              <Check className="size-3.5" /> Accept
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 px-2"
              onClick={() => actions.setStatus(t.id, "rejected")}
            >
              <X className="size-3.5" /> Reject
            </Button>
          </>
        )}
        {isOpen && t.kind === "comment" && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2"
            onClick={() => actions.setStatus(t.id, "resolved")}
          >
            <Check className="size-3.5" /> Resolve
          </Button>
        )}
        {!isOpen && t.status !== "accepted" && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2"
            onClick={() => actions.setStatus(t.id, "open")}
          >
            <RotateCcw className="size-3.5" /> Reopen
          </Button>
        )}
        {canDelete(t, userId, isOwner) && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-destructive"
            onClick={() => actions.remove(t.id)}
          >
            <Trash2 className="size-3.5" /> Delete
          </Button>
        )}
      </div>
    </li>
  );
}
