import { MessageSquare } from "lucide-react";
import { type RefObject, useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { type AccountUser } from "@/lib/account/client";
import { cloudReady, useAccount } from "@/lib/account/store";
import { commentsApi, ShareError } from "@/lib/share/api";
import { type Block, type Thread, blockText, placeComments } from "@/lib/share/anchor";
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
  onDelete: (c: ShareComment) => void;
  className?: string;
}) {
  const [confirming, setConfirming] = useState(false);
  return (
    <li className={`grid gap-1 text-sm m-0! ${className}`}>
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
              <button
                type="button"
                className="text-destructive underline-offset-4 hover:underline"
                onClick={() => onDelete(comment)}
              >
                Confirm delete
              </button>
              <button
                type="button"
                className="underline-offset-4 hover:underline"
                onClick={() => setConfirming(false)}
              >
                Keep
              </button>
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
  onDelete: (c: ShareComment) => void;
}) {
  const [replying, setReplying] = useState(false);
  return (
    <li className="m-0! grid gap-2 rounded-md border border-border bg-card p-3">
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
    </li>
  );
}

/**
 * Comments on a shared copy. Each top-level block of the page gets a "Comment" button and its
 * threads, drawn into a spot just after the block; comments whose block is gone are listed below.
 * Reading and writing need a signed-in, confirmed account; the page itself never does.
 */
export function ShareComments({
  slug,
  html,
  body,
  enabled,
  onSignedIn,
}: {
  slug: string;
  /** The rendered text, so the spots can be made again whenever it is drawn again. */
  html: string;
  body: RefObject<HTMLElement | null>;
  enabled: boolean;
  /** A private page reads for the signed-in reader, so it is loaded again after a sign-in. */
  onSignedIn: (user: AccountUser) => void;
}) {
  const account = useAccount();
  const ready = enabled && cloudReady(account);
  const [comments, setComments] = useState<ShareComment[]>([]);
  const [signIn, setSignIn] = useState(false);
  const [spots, setSpots] = useState<{ host: HTMLElement; block: Block }[]>([]);
  const [composing, setComposing] = useState<number | null>(null);

  // the spots: one after each top-level block, made again each time the page is drawn
  useEffect(() => {
    const root = body.current;
    if (!root || !enabled) return setSpots([]);
    const made: { host: HTMLElement; block: Block }[] = [];
    for (const el of Array.from(root.children)) {
      const line = Number(el.getAttribute("data-sl"));
      if (!line) continue;
      const host = document.createElement("div");
      host.className = "share-spot not-prose my-2 grid gap-2";
      el.insertAdjacentElement("afterend", host);
      made.push({ host, block: { line, text: blockText(el.textContent ?? "") } });
    }
    setSpots(made);
    return () => made.forEach((m) => m.host.remove());
  }, [html, enabled, body]);

  const load = useCallback(async () => {
    if (!ready) return setComments([]);
    try {
      setComments(await commentsApi.list(slug));
    } catch (error) {
      if (!(error instanceof ShareError && error.code === "not_found")) console.error(error);
      setComments([]);
    }
  }, [ready, slug]);
  useEffect(() => void load(), [load]);

  const blocks = useMemo(() => spots.map((s) => s.block), [spots]);
  const { byLine, loose } = useMemo(() => placeComments(comments, blocks), [comments, blocks]);

  const add = async (input: {
    body: string;
    line: number;
    snippet?: string;
    parentId?: string;
  }) => {
    const made = await commentsApi.add(slug, input);
    setComments((all) => [...all, made]);
  };
  const remove = async (c: ShareComment) => {
    try {
      await commentsApi.remove(slug, c.id);
      setComments((all) => all.filter((x) => x.id !== c.id && x.parentId !== c.id));
    } catch (error) {
      toast.error(explain(error));
    }
  };
  const reply = (parent: ShareComment, text: string) =>
    add({ body: text, line: parent.line, snippet: parent.snippet, parentId: parent.id });

  if (!enabled) return null;
  return (
    <>
      {spots.map(({ host, block }) =>
        createPortal(
          <>
            {ready && (byLine.get(block.line)?.length ?? 0) > 0 && (
              <ul className="grid gap-2 list-none! m-0! pl-0!">
                {byLine.get(block.line)!.map((t) => (
                  <ThreadView
                    key={t.comment.id}
                    thread={t}
                    canReply
                    onReply={reply}
                    onDelete={remove}
                  />
                ))}
              </ul>
            )}
            {ready && composing === block.line ? (
              <Composer
                placeholder="Add a comment on this block"
                submitLabel="Comment"
                onCancel={() => setComposing(null)}
                onSubmit={async (text) => {
                  await add({ body: text, line: block.line, snippet: block.text });
                  setComposing(null);
                }}
              />
            ) : (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 justify-self-start px-2 text-xs text-muted-foreground"
                aria-label={`Comment on: ${block.text.slice(0, 60)}`}
                onClick={() => (ready ? setComposing(block.line) : setSignIn(true))}
              >
                <MessageSquare className="size-3.5" /> Comment
              </Button>
            )}
          </>,
          host,
          `${block.line}`,
        ),
      )}

      {ready && loose.length > 0 && (
        <section className="mt-10 grid gap-3" aria-label="Comments on earlier versions">
          <h2 className="font-display text-lg font-semibold">Comments on earlier versions</h2>
          <ul className="grid gap-2 list-none! m-0! pl-0!">
            {loose.map((t) => (
              <ThreadView
                key={t.comment.id}
                thread={t}
                canReply={false}
                onReply={reply}
                onDelete={remove}
              />
            ))}
          </ul>
        </section>
      )}

      {!ready && (
        <p className="mt-8 rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
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

      <ReaderSignIn
        open={signIn}
        onOpenChange={setSignIn}
        onSignedIn={onSignedIn}
        reason="Comments are from signed-in readers, so the writer knows who is asking."
      />
    </>
  );
}
