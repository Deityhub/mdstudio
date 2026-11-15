import { MessageSquare, X } from "lucide-react";
import {
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { type AccountUser } from "@/lib/account/client";
import { cloudReady, useAccount } from "@/lib/account/store";
import { useRealtime } from "@/lib/realtime/hooks";
import type { RealtimeEvent } from "@/lib/realtime/protocol";
import { commentsApi, ShareError } from "@/lib/share/api";
import { applyCommentEvent, upsertComment } from "@/lib/share/live";
import { type Block, type Thread, blockText, placeComments, plainText } from "@/lib/share/anchor";
import { clearHighlights, highlightSnippet } from "@/lib/share/highlight";
import { MAX_COMMENT_LENGTH, type ShareComment } from "@/lib/share/protocol";
import { ReaderSignIn } from "./ReaderSignIn";

const explain = (error: unknown) =>
  error instanceof ShareError
    ? {
        not_found: "This link is no longer available.",
        invalid: "That comment can't be posted. Check the text and try again.",
        too_many: "You've commented a lot in the last hour. Try again a little later.",
        forbidden: "Comments are turned off on this link, or your email isn't confirmed yet.",
        limit_reached: "This link has all the comments it can hold.",
        failed: "Couldn't reach the server. Check your connection and try again.",
      }[error.code]
    : "Something went wrong. Try again.";

const when = (ms: number) =>
  new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

function Composer({
  placeholder,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  placeholder: string;
  submitLabel: string;
  onSubmit: (body: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  return (
    <form
      className="grid gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setProblem("");
        try {
          await onSubmit(body);
          setBody("");
        } catch (error) {
          setProblem(explain(error));
        } finally {
          setBusy(false);
        }
      }}
    >
      <Textarea
        autoFocus
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={MAX_COMMENT_LENGTH}
        rows={3}
        placeholder={placeholder}
        aria-label={placeholder}
      />
      {problem && (
        <p role="alert" className="text-sm text-destructive">
          {problem}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="sm" loading={busy} disabled={!body.trim()}>
          {submitLabel}
        </Button>
        <Button type="button" size="sm" variant="ghost" pending={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function One({
  comment,
  onDelete,
  className = "",
}: {
  comment: ShareComment;
  onDelete: (c: ShareComment) => unknown;
  className?: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const remove = async () => {
    setDeleting(true);
    try {
      await onDelete(comment);
    } finally {
      setDeleting(false);
      setConfirming(false);
    }
  };
  return (
    // while it is being deleted the comment is dimmed, and its button shows the work
    <li
      aria-busy={deleting || undefined}
      className={`grid gap-1 text-sm m-0! transition-opacity ${deleting ? "opacity-60" : ""} ${className}`}
    >
      <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{comment.author}</span>
        <span>{when(comment.createdAt)}</span>
        {comment.outdated && (
          <span className="rounded border border-border px-1" title="Written on an earlier version">
            Earlier version
          </span>
        )}
        {comment.resolved && <span className="rounded border border-border px-1">Resolved</span>}
        {comment.mine &&
          (confirming ? (
            <>
              <Button
                type="button"
                variant="ghost"
                className="h-6 px-1.5 text-xs text-destructive hover:text-destructive"
                loading={deleting}
                onClick={() => void remove()}
              >
                {deleting ? "Deleting" : "Confirm delete"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="h-6 px-1.5 text-xs"
                pending={deleting}
                onClick={() => setConfirming(false)}
              >
                Keep
              </Button>
            </>
          ) : (
            <button
              type="button"
              className="underline-offset-4 hover:underline"
              onClick={() => setConfirming(true)}
            >
              Delete
            </button>
          ))}
      </div>
      {/* plain text only: never markup */}
      <p className="whitespace-pre-wrap wrap-break-word">{comment.body}</p>
    </li>
  );
}

function ThreadView({
  thread,
  canReply,
  onReply,
  onDelete,
}: {
  thread: Thread;
  canReply: boolean;
  onReply: (parent: ShareComment, body: string) => Promise<void>;
  onDelete: (c: ShareComment) => unknown;
}) {
  const [replying, setReplying] = useState(false);
  return (
    <div className="grid gap-2">
      <ul className="grid gap-3 list-none! m-0! pl-0!">
        <One comment={thread.comment} onDelete={onDelete} />
        {thread.replies.map((r) => (
          <One
            key={r.id}
            comment={r}
            onDelete={onDelete}
            className="ml-4 border-l border-border pl-3"
          />
        ))}
      </ul>
      {canReply &&
        (replying ? (
          <Composer
            placeholder="Write a reply"
            submitLabel="Reply"
            onCancel={() => setReplying(false)}
            onSubmit={async (body) => {
              await onReply(thread.comment, body);
              setReplying(false);
            }}
          />
        ) : (
          <Button
            size="sm"
            variant="ghost"
            className="justify-self-start"
            onClick={() => setReplying(true)}
          >
            Reply
          </Button>
        ))}
    </div>
  );
}

const WIDE = "(min-width: 1024px)";
const useWide = () =>
  useSyncExternalStore(
    (notify) => {
      const query = window.matchMedia(WIDE);
      query.addEventListener("change", notify);
      return () => query.removeEventListener("change", notify);
    },
    () => window.matchMedia(WIDE).matches,
    () => true,
  );

type Item =
  | { key: string; kind: "thread"; line: number; thread: Thread; loose: boolean }
  | { key: string; kind: "draft"; line: number; snippet: string }
  | {
      key: string;
      kind: "notice";
      line: number;
      /** Set when the link changed under the reader: a new copy was published, or it was withdrawn. */
      message?: "updated" | "revoked";
    };

/** The top-level block of the page that holds a node, if any. */
const blockOf = (root: HTMLElement, node: Node | null) => {
  let el = node instanceof Element ? node : (node?.parentElement ?? null);
  while (el && el.parentElement !== root) el = el.parentElement;
  return el && Number(el.getAttribute("data-sl")) ? el : null;
};
const blockAt = (root: HTMLElement, line: number) =>
  Array.from(root.children).find((el) => Number(el.getAttribute("data-sl")) === line) ?? null;

/**
 * Comments on a shared copy, the way a document review works: the reader selects words, a "Comment"
 * button appears, and the comment is tied to those words. The words stay highlighted on the page and
 * the comments sit in a column beside it (a sheet on a phone), each level with what it is about.
 * Clicking a highlight shows its comment; the column can be hidden. Reading and writing need a
 * signed-in, confirmed account; the page itself never does.
 */
export function ShareComments({
  slug,
  html,
  body,
  enabled,
  onSignedIn,
  onSideChange,
}: {
  slug: string;
  /** The rendered text, so the highlights can be made again whenever it is drawn again. */
  html: string;
  body: RefObject<HTMLElement | null>;
  enabled: boolean;
  /** A private page reads for the signed-in reader, so it is loaded again after a sign-in. */
  onSignedIn: (user: AccountUser) => void;
  /** Tells the page whether the comments are showing in a column beside the text (or not). */
  onSideChange?: (shown: boolean) => void;
}) {
  const account = useAccount();
  const ready = enabled && cloudReady(account);
  const wide = useWide();
  const [comments, setComments] = useState<ShareComment[]>([]);
  const [signIn, setSignIn] = useState(false);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [open, setOpen] = useState(true);
  const [active, setActive] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ line: number; snippet: string } | null>(null);
  const [picked, setPicked] = useState<{
    top: number;
    left: number;
    line: number;
    snippet: string;
  } | null>(null);
  const [layout, setLayout] = useState<{ tops: Map<string, number>; height: number }>({
    tops: new Map(),
    height: 0,
  });
  const [tick, setTick] = useState(0);
  const aside = useRef<HTMLElement>(null);
  const cards = useRef(new Map<string, HTMLElement>());

  // the blocks of the page, made again each time it is drawn
  useEffect(() => {
    const root = body.current;
    if (!root || !enabled) return setBlocks([]);
    setBlocks(
      Array.from(root.children).flatMap((el) => {
        const line = Number(el.getAttribute("data-sl"));
        return line ? [{ line, text: plainText(el.textContent ?? "") }] : [];
      }),
    );
  }, [html, enabled, body]);

  const [changed, setChanged] = useState<"updated" | "revoked" | null>(null);

  const load = useCallback(async () => {
    if (!ready) return setComments([]);
    try {
      setComments(await commentsApi.list(slug));
    } catch (error) {
      if (!(error instanceof ShareError && error.code === "not_found")) console.error(error);
      setComments([]);
    }
  }, [ready, slug]);

  // What the writer and the other readers do reaches this page over the link's live topic.
  const live = useRealtime(ready ? `share:${slug}` : null, (event: RealtimeEvent) => {
    setComments((current) => applyCommentEvent(current, event));
    if (event.t === "share" && event.change !== "settings") setChanged(event.change);
  });
  // One read: when the live connection is ready (it also catches up after a reconnect), or after a
  // moment if there is none. Nothing reads again while it is up.
  const loaded = useRef(false);
  useEffect(() => {
    loaded.current = false;
  }, [ready, slug]);
  useEffect(() => {
    if (!ready || live) {
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
  }, [load, live, ready]);

  const { byLine, loose } = useMemo(() => placeComments(comments, blocks), [comments, blocks]);

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    if (changed) out.push({ key: "changed", kind: "notice", line: 0, message: changed });
    if (!ready) out.push({ key: "notice", kind: "notice", line: 0 });
    for (const [line, threads] of [...byLine].sort((a, b) => a[0] - b[0]))
      for (const thread of threads)
        out.push({ key: thread.comment.id, kind: "thread", line, thread, loose: false });
    if (draft) out.push({ key: "draft", kind: "draft", ...draft });
    for (const thread of loose)
      out.push({ key: thread.comment.id, kind: "thread", line: Infinity, thread, loose: true });
    return out;
  }, [byLine, loose, draft, ready, changed]);
  // the column only counts as there while something is in it: the page makes room for it then
  const side = enabled && wide && open && items.length > 0;
  useEffect(() => onSideChange?.(side), [side, onSideChange]);

  // the highlights: the words of each comment, and of the one being written
  useLayoutEffect(() => {
    const root = body.current;
    if (!root || !enabled) return;
    clearHighlights(root);
    for (const item of items) {
      const el = item.kind === "notice" || item.line === Infinity ? null : blockAt(root, item.line);
      if (!el) continue;
      const snippet =
        item.kind === "draft"
          ? item.snippet
          : item.kind === "thread"
            ? item.thread.comment.snippet
            : "";
      if (snippet) highlightSnippet(el, snippet, item.key);
    }
    for (const mark of Array.from(root.querySelectorAll("mark[data-comment]")))
      mark.toggleAttribute("data-active", mark.getAttribute("data-comment") === active);
    setTick((t) => t + 1);
  }, [items, active, html, enabled, body]);

  const markOf = useCallback(
    (key: string) => body.current?.querySelector(`mark[data-comment="${CSS.escape(key)}"]`),
    [body],
  );

  // a click on a highlight shows the comment it belongs to
  useEffect(() => {
    const root = body.current;
    if (!root || !enabled) return;
    const onClick = (e: MouseEvent) => {
      const mark = (e.target as Element).closest("mark[data-comment]");
      if (!mark || !window.getSelection()?.isCollapsed) return;
      setActive(mark.getAttribute("data-comment"));
      setOpen(true);
    };
    root.addEventListener("click", onClick);
    return () => root.removeEventListener("click", onClick);
  }, [body, enabled]);

  // selected words offer a Comment button beside them
  useEffect(() => {
    if (!enabled) return;
    const update = () => {
      const root = body.current;
      const sel = window.getSelection();
      if (!root || !sel || sel.isCollapsed || !sel.rangeCount) return setPicked(null);
      const range = sel.getRangeAt(0);
      const block = root.contains(range.commonAncestorContainer)
        ? blockOf(root, range.startContainer)
        : null;
      if (!block) return setPicked(null);
      // the words in the block where the selection starts
      const inBlock = range.cloneRange();
      if (!block.contains(range.endContainer)) inBlock.setEndAfter(block.lastChild ?? block);
      const snippet = blockText(inBlock.toString());
      if (!snippet) return setPicked(null);
      const rect = range.getBoundingClientRect();
      setPicked({
        top: Math.max(8, rect.top - 44),
        left: Math.min(window.innerWidth - 150, Math.max(8, rect.left + rect.width / 2 - 70)),
        line: Number(block.getAttribute("data-sl")),
        snippet,
      });
    };
    document.addEventListener("selectionchange", update);
    window.addEventListener("scroll", update, { passive: true });
    return () => {
      document.removeEventListener("selectionchange", update);
      window.removeEventListener("scroll", update);
    };
  }, [body, enabled]);

  // the column keeps level with what each comment is about, and no two overlap
  useEffect(() => {
    const root = body.current;
    const again = () => setTick((t) => t + 1);
    window.addEventListener("resize", again);
    const watch = root ? new ResizeObserver(again) : null;
    if (root) watch?.observe(root);
    return () => {
      window.removeEventListener("resize", again);
      watch?.disconnect();
    };
  }, [body, enabled]);
  // Runs after every render on purpose: a card's height changes when a reply box opens. It only sets
  // state when a position moved, so it settles at once.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const column = aside.current;
    const root = body.current;
    if (!wide || !open || !column || !root) return;
    const base = column.getBoundingClientRect().top;
    const anchored = items.map((item) => {
      const el =
        markOf(item.key) ??
        (item.line === Infinity || !item.line ? null : blockAt(root, item.line));
      return {
        item,
        at: el ? el.getBoundingClientRect().top - base : item.line === Infinity ? Infinity : 0,
      };
    });
    anchored.sort((a, b) => a.at - b.at);
    const tops = new Map<string, number>();
    let cursor = 0;
    for (const { item, at } of anchored) {
      const top = Math.max(at === Infinity ? 0 : at, cursor);
      tops.set(item.key, top);
      cursor = top + (cards.current.get(item.key)?.offsetHeight ?? 0) + 8;
    }
    const same =
      layout.height === cursor &&
      tops.size === layout.tops.size &&
      [...tops].every(([k, v]) => layout.tops.get(k) === v);
    if (!same) setLayout({ tops, height: cursor });
  });

  const add = async (input: {
    body: string;
    line: number;
    snippet?: string;
    parentId?: string;
  }) => {
    const made = await commentsApi.add(slug, input);
    setComments((all) => upsertComment(all, made)); // its echo may have come first
    return made;
  };
  const remove = async (c: ShareComment) => {
    try {
      await commentsApi.remove(slug, c.id);
      setComments((all) => all.filter((x) => x.id !== c.id && x.parentId !== c.id));
    } catch (error) {
      toast.error(explain(error));
    }
  };
  const reply = async (parent: ShareComment, text: string) => {
    await add({ body: text, line: parent.line, snippet: parent.snippet, parentId: parent.id });
  };

  const startComment = () => {
    if (!picked) return;
    if (!ready) return setSignIn(true);
    setDraft({ line: picked.line, snippet: picked.snippet });
    setActive("draft");
    setOpen(true);
    window.getSelection()?.removeAllRanges();
    setPicked(null);
  };
  const show = (key: string) => {
    setActive(key);
    markOf(key)?.scrollIntoView({ block: "center", behavior: "smooth" });
  };

  if (!enabled) return null;

  const card = (item: Item) => (
    <li
      key={item.key}
      ref={(el) => void (el ? cards.current.set(item.key, el) : cards.current.delete(item.key))}
      style={wide ? { top: layout.tops.get(item.key) ?? 0 } : undefined}
      onClick={() => item.kind !== "notice" && show(item.key)}
      className={`m-0! list-none! rounded-md border bg-muted p-3.5 text-sm ${
        wide ? "absolute inset-x-0" : ""
      } ${active === item.key ? "border-primary ring-1 ring-primary" : "border-border"}`}
    >
      {item.kind === "notice" && item.message && (
        <p role="status" className="text-muted-foreground">
          {item.message === "updated" ? (
            <>
              The writer published an update.{" "}
              <button
                type="button"
                className="text-primary underline-offset-4 hover:underline"
                onClick={() => window.location.reload()}
              >
                Reload to read it
              </button>
              . Comments written so far are marked as being on an earlier copy.
            </>
          ) : (
            "The writer has stopped sharing this page."
          )}
        </p>
      )}
      {item.kind === "notice" && !item.message && (
        <p className="text-muted-foreground">
          The writer is taking comments.{" "}
          {account.user ? (
            "Confirm your email address to read and write them."
          ) : (
            <button
              type="button"
              className="text-primary underline-offset-4 hover:underline"
              onClick={() => setSignIn(true)}
            >
              Sign in to read and write comments
            </button>
          )}
        </p>
      )}
      {item.kind === "draft" && (
        <div className="grid gap-2">
          <p className="border-l-2 border-warning pl-2 text-xs text-muted-foreground">
            {item.snippet}
          </p>
          <Composer
            placeholder="Add a comment"
            submitLabel="Comment"
            onCancel={() => setDraft(null)}
            onSubmit={async (text) => {
              const made = await add({ body: text, line: item.line, snippet: item.snippet });
              setDraft(null);
              setActive(made.id);
            }}
          />
        </div>
      )}
      {item.kind === "thread" && (
        <div className="grid gap-2">
          {item.thread.comment.snippet && (
            <p className="line-clamp-2 border-l-2 border-warning pl-2 text-xs text-muted-foreground">
              {item.thread.comment.snippet}
            </p>
          )}
          {item.loose && (
            <p className="text-xs text-muted-foreground">On an earlier version of this page</p>
          )}
          <ThreadView
            thread={item.thread}
            canReply={!item.loose}
            onReply={reply}
            onDelete={remove}
          />
        </div>
      )}
    </li>
  );

  const count = comments.filter((c) => c.parentId === null).length;
  return (
    <>
      {open &&
        (wide ? (
          // nothing in it: no column, so the page keeps no room for one
          side && (
            <aside
              ref={aside}
              aria-label="Comments"
              className="relative"
              style={{ minHeight: layout.height }}
            >
              <ul className="m-0! list-none! p-0!">{items.map(card)}</ul>
            </aside>
          )
        ) : (
          <aside
            aria-label="Comments"
            className="fixed inset-x-0 bottom-0 z-40 max-h-[60vh] overflow-y-auto border-t border-border bg-background p-3 shadow-lg"
          >
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-display text-base font-semibold">Comments</h2>
              <Button
                size="icon"
                variant="ghost"
                className="size-8"
                aria-label="Hide comments"
                onClick={() => setOpen(false)}
              >
                <X className="size-4" />
              </Button>
            </div>
            {items.length ? (
              <ul className="m-0! grid list-none! gap-2 p-0!">{items.map(card)}</ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                Select some text on the page to comment on it.
              </p>
            )}
          </aside>
        ))}

      {(wide || !open) && (
        <Button
          size="sm"
          variant="outline"
          className="fixed bottom-4 right-4 z-30 bg-background shadow-md"
          aria-label={open ? "Hide comments" : "Show comments"}
          onClick={() => setOpen((v) => !v)}
        >
          <MessageSquare className="size-4" />
          {open ? "Hide comments" : `Comments${count ? ` (${count})` : ""}`}
        </Button>
      )}

      {picked && (
        <button
          type="button"
          className="fixed z-50 inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border border-border bg-popover px-3 text-sm font-medium text-popover-foreground shadow-md hover:bg-accent"
          style={{ top: picked.top, left: picked.left }}
          aria-label="Comment on selection"
          // keep the selection while the button is pressed
          onMouseDown={(e) => e.preventDefault()}
          onClick={startComment}
        >
          <MessageSquare className="size-4" /> Comment
        </button>
      )}

      <ReaderSignIn
        open={signIn}
        onOpenChange={setSignIn}
        onSignedIn={onSignedIn}
        reason="Comments are from signed-in readers, so the writer knows who is asking."
      />
    </>
  );
}
