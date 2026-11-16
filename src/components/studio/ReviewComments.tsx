import { Check, RotateCcw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { type SharedLink, ShareError, ownerApi } from "@/lib/share/api";
import { useRealtime } from "@/lib/realtime/hooks";
import type { RealtimeEvent } from "@/lib/realtime/protocol";
import { ensureShares } from "@/lib/share/hooks";
import { applyCommentEvent } from "@/lib/share/live";
import { shareDate } from "@/lib/share/page";
import type { ShareComment } from "@/lib/share/protocol";

/**
 * What reviewers said on the draft's link, for the writer: open ones first, each with the line it
 * is about (click to go there), and the writer may resolve or delete any of them. It reads once
 * when it is opened (once the live connection is up, or a moment later without one), and after
 * that listens: a comment, a resolving or a removal anywhere shows here as it happens.
 */
export function ReviewComments({
  draftId,
  share,
  onGo,
}: {
  draftId: string;
  share: SharedLink | undefined;
  onGo: (line: number) => void;
}) {
  const [items, setItems] = useState<ShareComment[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setItems(await ownerApi.comments(draftId));
      setFailed(false);
    } catch (error) {
      // a draft with no link has nothing to read
      if (error instanceof ShareError && error.code === "not_found") setItems([]);
      else setFailed(true);
    }
  }, [draftId]);

  // what the link's readers do reaches this panel over the link's live topic
  const live = useRealtime(share?.slug ? `share:${share.slug}` : null, (event: RealtimeEvent) =>
    setItems((current) => (current ? applyCommentEvent(current, event) : current)),
  );

  const loaded = useRef(false);
  useEffect(() => {
    loaded.current = false;
    setItems(null);
    void ensureShares();
  }, [draftId]);
  // One read: when the live connection is ready (it also catches up after a reconnect), or after
  // a moment if there is none. Nothing reads again while it is up.
  useEffect(() => {
    if (live) {
      loaded.current = true;
      void load();
      return;
    }
    const wait = setTimeout(() => {
      if (!loaded.current) {
        loaded.current = true;
        void load();
      }
    }, 1000);
    return () => clearTimeout(wait);
  }, [load, live]);

  async function act(
    id: string,
    what: "resolve" | "delete",
    work: () => Promise<unknown>,
    event: RealtimeEvent,
  ) {
    setBusy(`${id}:${what}`);
    try {
      await work();
      // what the writer did is on screen at once; the event that follows changes nothing more
      setItems((current) => (current ? applyCommentEvent(current, event) : current));
    } catch {
      toast.error("Couldn't change that comment. Try again.");
    } finally {
      setBusy(null);
    }
  }

  if (failed && !items)
    return <p className="text-sm text-muted-foreground">Couldn't load the comments.</p>;
  if (!items) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!items.length)
    return (
      <p className="text-sm text-muted-foreground">
        {!share
          ? "Share this draft with comments turned on to hear back from reviewers here."
          : share.comments
            ? "No comments yet. They show up here when reviewers write them."
            : "Comments are off for this link. Turn them on in Share."}
      </p>
    );

  const roots = items
    .filter((c) => c.parentId === null)
    .sort((a, b) => Number(a.resolved) - Number(b.resolved) || a.line - b.line);
  const replies = (id: string) => items.filter((c) => c.parentId === id);

  const row = (c: ShareComment, root: boolean) => (
    <li
      key={c.id}
      className={`grid gap-1 rounded-md border border-border p-2 text-sm ${
        c.resolved ? "opacity-60" : ""
      } ${root ? "" : "ml-4"}`}
    >
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="truncate font-medium text-foreground">{c.author}</span>
        <span className="shrink-0">{shareDate(c.createdAt)}</span>
      </div>
      {root && (
        <button
          type="button"
          className="truncate text-left text-xs text-muted-foreground underline-offset-2 hover:underline"
          onClick={() => onGo(c.line)}
        >
          Line {c.line}
          {c.snippet ? `: ${c.snippet}` : ""}
        </button>
      )}
      <p className="whitespace-pre-wrap wrap-break-word">{c.body}</p>
      {c.outdated && (
        <p className="text-xs text-muted-foreground">Written on an earlier published copy.</p>
      )}
      <div className="flex justify-end gap-1">
        {root && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2"
            loading={busy === `${c.id}:resolve`}
            disabled={busy !== null}
            onClick={() =>
              void act(c.id, "resolve", () => ownerApi.resolve(draftId, c.id, !c.resolved), {
                t: "comment_resolved",
                id: c.id,
                resolved: !c.resolved,
              })
            }
          >
            {c.resolved ? <RotateCcw className="size-3.5" /> : <Check className="size-3.5" />}
            {c.resolved ? "Reopen" : "Resolve"}
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-destructive"
          loading={busy === `${c.id}:delete`}
          disabled={busy !== null}
          onClick={() =>
            void act(c.id, "delete", () => ownerApi.remove(draftId, c.id), {
              t: "comment_deleted",
              id: c.id,
            })
          }
        >
          <Trash2 className="size-3.5" />
          Delete
        </Button>
      </div>
    </li>
  );

  return (
    <ul className="grid gap-2">
      {roots.map((c) => (
        <li key={c.id} className="list-none">
          <ul className="grid gap-1">
            {row(c, true)}
            {replies(c.id).map((r) => row(r, false))}
          </ul>
        </li>
      ))}
    </ul>
  );
}
