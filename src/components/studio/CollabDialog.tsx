import { Check, Copy, Users, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
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
import { handleAccountError } from "@/lib/account/errors";
import { CollabError, type CollabState, type Editor, collabApi } from "@/lib/collab/api";
import type { MdDocument } from "@/lib/storage/documentStore";
import { requestSync } from "@/lib/sync/hooks";

const explain = (error: unknown) =>
  error instanceof CollabError
    ? {
        not_found: "This draft hasn't reached your cloud yet. Wait for it to sync, then try again.",
        invalid: "That isn't an email address you can invite. It can't be your own.",
        too_many: "You've made a lot of changes recently. Try again a little later.",
        forbidden: "That isn't available on this server.",
        limit_reached:
          "You've reached a limit for editing together. Stop another draft or ask an admin.",
        closed: "Editing together is closed on this server right now.",
        failed: "Couldn't reach the server. Check your connection and try again.",
      }[error.code]
    : "Something went wrong. Try again.";

/**
 * Lets the owner of a cloud draft edit it together with named people: at the same time, online or
 * offline, in one text. Everyone is invited by email address and needs an account with that address
 * confirmed. Only the owner invites, removes, or stops; people can leave on their own.
 */
export function CollabDialog({
  draft,
  open,
  onOpenChange,
  beforeStart,
  beforeStop,
}: {
  draft: MdDocument | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Saves the draft and brings the cloud up to date, so the room starts from the latest text. */
  beforeStart: () => Promise<void>;
  /** Runs before it stops: keeps the open comments and suggestions in the draft's History (they end with it). */
  beforeStop?: () => Promise<unknown>;
}) {
  const [state, setState] = useState<CollabState | null>(null);
  const [busy, setBusy] = useState<"start" | "stop" | "invite" | null>(null);
  const [email, setEmail] = useState("");
  const [copied, setCopied] = useState(false);
  const [problem, setProblem] = useState("");
  const draftId = draft?.id;

  useEffect(() => {
    if (!open || !draftId) return;
    let live = true;
    setState(null);
    setProblem("");
    setEmail("");
    collabApi
      .state(draftId)
      .then((s) => live && setState(s))
      .catch((error) => {
        if (!live) return;
        if (!handleAccountError(error, () => onOpenChange(false))) setProblem(explain(error));
      });
    return () => {
      live = false;
    };
    // the dialog's own close handler must not restart the read
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, draftId]);

  if (!draft) return null;

  async function run<T>(kind: NonNullable<typeof busy>, work: () => Promise<T>) {
    setBusy(kind);
    setProblem("");
    try {
      return await work();
    } catch (error) {
      if (!handleAccountError(error, () => onOpenChange(false))) setProblem(explain(error));
      return undefined;
    } finally {
      setBusy(null);
    }
  }

  const start = () =>
    run("start", async () => {
      await beforeStart();
      const r = await collabApi.start(draft.id);
      const fresh = await collabApi.state(draft.id); // for the address people open it by
      setState((s) => (s ? { ...s, ...fresh, live: true, editors: r.editors } : s));
      requestSync(0);
      toast.success("Editing together is on");
    });
  const stop = () =>
    run("stop", async () => {
      await beforeStop?.();
      await collabApi.stop(draft.id);
      setState((s) => (s ? { ...s, live: false, editors: [] } : s));
      requestSync(0);
      toast.success("Editing together stopped", {
        description: "The draft keeps its latest text. Everyone invited was let go.",
      });
    });
  const invite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    void run("invite", async () => {
      const r = await collabApi.invite(draft.id, email);
      setState((s) => (s ? { ...s, editors: r.editors } : s));
      setEmail("");
      toast.success(
        r.emailed
          ? "Invitation sent"
          : "Added. They can open the draft once they sign in with this address.",
      );
    });
  };
  const uninvite = (person: Editor) =>
    void run("invite", async () => {
      await collabApi.remove(draft.id, person.id);
      setState((s) => (s ? { ...s, editors: s.editors.filter((p) => p.id !== person.id) } : s));
    });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(state?.link ?? "");
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.info("Select the link and press Ctrl+C to copy it");
    }
  };
  const full = !!state && state.editors.length + 1 >= state.people;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit together</DialogTitle>
          <DialogDescription>
            People you invite edit this draft with you at the same time, online or offline, in one
            text. They need an account with the address you invite, confirmed.
          </DialogDescription>
        </DialogHeader>

        {!state && !problem && <p className="text-sm text-muted-foreground">Loading…</p>}

        {state && !state.available && !state.live && (
          <p className="text-sm text-muted-foreground">
            Editing together isn't available on this server right now.
          </p>
        )}

        {state && !state.live && state.available && (
          <div className="grid gap-2">
            <p className="text-sm text-muted-foreground">
              While it is on, the draft's text is shared and kept up to date for everyone, and your
              other devices follow it. You can stop at any time; the draft keeps its latest text.
              You can edit up to {state.docs} {state.docs === 1 ? "draft" : "drafts"} together with
              up to {state.people - 1} {state.people - 1 === 1 ? "person" : "people"} each.
            </p>
          </div>
        )}

        {state?.live && (
          <div className="grid gap-2">
            <Label htmlFor="collab-invite">People who can edit it</Label>
            <form className="flex gap-2" onSubmit={invite}>
              <Input
                id="collab-invite"
                type="email"
                autoComplete="off"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-label="Invite by email"
              />
              <Button
                type="submit"
                variant="outline"
                loading={busy === "invite"}
                pending={busy !== null && busy !== "invite"}
                disabled={!email.trim() || full}
              >
                Invite
              </Button>
            </form>
            {state.link && (
              <div className="grid gap-1.5">
                <Label htmlFor="collab-link">Draft link</Label>
                <div className="flex gap-2">
                  <Input
                    id="collab-link"
                    readOnly
                    value={state.link}
                    onFocus={(e) => e.currentTarget.select()}
                    aria-label="Draft link"
                  />
                  <Button type="button" variant="outline" onClick={copy} aria-label="Copy link">
                    {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy"}
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  Only the people you invite can open it. Invitations by email include it.
                </p>
              </div>
            )}
            {full && (
              <p className="text-sm text-muted-foreground">
                A draft can have up to {state.people} people, you included.
              </p>
            )}
            {state.editors.length > 0 ? (
              <ul className="grid gap-1" aria-label="People who can edit">
                {state.editors.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between gap-2 rounded-md border border-border px-2 py-1 text-sm"
                  >
                    <span className="truncate">{p.email}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7 shrink-0"
                      aria-label={`Remove ${p.email}`}
                      pending={busy !== null}
                      onClick={() => uninvite(p)}
                    >
                      <X className="size-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No one yet. Only you can edit it.</p>
            )}
          </div>
        )}

        {state?.live && (
          <p className="text-sm text-muted-foreground">
            Comments and suggestions end with editing together. The open ones are kept in this
            draft's History when you stop. Images added from a computer are stored in that browser
            only, so the others see a broken picture; host them or use image addresses (links) to
            share them.
          </p>
        )}
        {problem && (
          <p role="alert" className="text-sm text-destructive">
            {problem}
          </p>
        )}

        <DialogFooter>
          {state?.live ? (
            <Button
              type="button"
              variant="outline"
              loading={busy === "stop"}
              pending={busy !== null && busy !== "stop"}
              onClick={() => void stop()}
            >
              Stop editing together
            </Button>
          ) : (
            <Button
              type="button"
              loading={busy === "start"}
              disabled={!state?.available}
              onClick={() => void start()}
            >
              <Users /> Start editing together
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
