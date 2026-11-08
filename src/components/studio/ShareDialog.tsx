import { Check, Copy, Globe, Lock, TriangleAlert, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { handleAccountError } from "@/lib/account/errors";
import { type SharePerson, ShareError, peopleApi, shareApi } from "@/lib/share/api";
import { contentHash } from "@/lib/share/hash";
import { refreshShares, setShare, useShares } from "@/lib/share/hooks";
import { shareDate } from "@/lib/share/page";
import { MAX_SHARE_PEOPLE, type ShareAccess } from "@/lib/share/protocol";
import type { MdDocument } from "@/lib/storage/documentStore";

const DAY = 86_400_000;
const daysLabel = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;

const explain = (error: unknown, about: "link" | "person" = "link") =>
  error instanceof ShareError
    ? {
        not_found: "This draft hasn't reached your cloud yet. Wait for it to sync, then try again.",
        invalid:
          about === "person"
            ? "That isn't an email address you can invite. It can't be your own."
            : "That isn't allowed.",
        too_many: "You've made a lot of changes recently. Try again a little later.",
        forbidden: "That isn't available on this server.",
        limit_reached:
          about === "person"
            ? `A link can be shared with up to ${MAX_SHARE_PEOPLE} people.`
            : "That limit has been reached.",
        failed: "Couldn't reach the server. Check your connection and try again.",
      }[error.code]
    : "Something went wrong. Try again.";

const ACCESS: Record<ShareAccess, string> = {
  public: "Anyone with the link",
  people: "Only people I invite",
};

/**
 * Publishes a cloud draft as a read-only page that expires, open to anyone with the link or only to
 * named people who sign in, with comments if the writer wants them. What readers see is a copy made
 * when the writer publishes; later edits stay private until they publish an update.
 */
export function ShareDialog({
  draft,
  open,
  onOpenChange,
  beforePublish,
}: {
  draft: MdDocument | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Saves the draft and brings the cloud up to date, so the published copy is the latest text. */
  beforePublish: () => Promise<void>;
}) {
  const { byDraft, defaultDays, maxDays, privateLinks, loaded } = useShares();
  const share = draft ? byDraft.get(draft.id) : undefined;
  const [days, setDays] = useState(String(defaultDays));
  const [busy, setBusy] = useState<"publish" | "extend" | "stop" | "settings" | "invite" | null>(
    null,
  );
  // what a link not yet published will be made with
  const [chosenAccess, setChosenAccess] = useState<ShareAccess>("public");
  const [chosenComments, setChosenComments] = useState(false);
  const [people, setPeople] = useState<SharePerson[]>([]);
  const [email, setEmail] = useState("");
  const [problem, setProblem] = useState("");
  const [copied, setCopied] = useState(false);
  const [stale, setStale] = useState(false);
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setDays(String(defaultDays));
      setProblem("");
      setCopied(false);
      setChosenAccess("public");
      setChosenComments(false);
      setEmail("");
    }
  }, [open, draft?.id, defaultDays]);

  // the links are read when the dialog is opened, and not before
  useEffect(() => {
    if (open) void refreshShares();
  }, [open]);

  const access = share ? share.access : chosenAccess;
  const comments = share ? share.comments : chosenComments;
  const isPrivate = access === "people";

  // who a private link is shared with
  const draftId = draft?.id;
  const sharedPrivately = !!share && share.access === "people";
  useEffect(() => {
    if (!open || !draftId || !sharedPrivately) return setPeople([]);
    let live = true;
    peopleApi
      .list(draftId)
      .then((list) => live && setPeople(list))
      .catch(() => live && setProblem("Couldn't load the people on this link."));
    return () => {
      live = false;
    };
  }, [open, draftId, sharedPrivately, share?.slug]);

  // Has the draft moved on since the copy was published?
  useEffect(() => {
    if (!draft || !share) return setStale(false);
    let live = true;
    void contentHash(draft.content).then((h) => live && setStale(h !== share.hash));
    return () => {
      live = false;
    };
  }, [draft, share]);

  if (!draft) return null;
  if (!loaded)
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Share</DialogTitle>
            <DialogDescription>Loading…</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );

  async function run<T>(
    kind: NonNullable<typeof busy>,
    work: () => Promise<T>,
    about: "link" | "person" = "link",
  ) {
    setBusy(kind);
    setProblem("");
    try {
      return await work();
    } catch (error) {
      if (!handleAccountError(error, () => onOpenChange(false))) setProblem(explain(error, about));
      return undefined;
    } finally {
      setBusy(null);
    }
  }

  const publish = (chosen?: number) =>
    run("publish", async () => {
      await beforePublish();
      const { share: link, created } = await shareApi.publish(
        draft.id,
        chosen,
        chosen === undefined ? {} : { access: chosenAccess, comments: chosenComments },
      );
      setShare(draft.id, link);
      toast.success(created ? "Link published" : "Update published");
    });
  const changeLength = (value: string) => {
    setDays(value);
    if (share)
      void run("extend", async () => {
        const { share: link } = await shareApi.extend(draft.id, Number(value));
        setShare(draft.id, link);
      });
  };
  const chooseAccess = (value: string) => {
    const next = value as ShareAccess;
    if (!share) return setChosenAccess(next);
    void run("settings", async () => {
      const { share: link } = await shareApi.update(draft.id, { access: next });
      setShare(draft.id, link);
    });
  };
  const chooseComments = (on: boolean) => {
    if (!share) return setChosenComments(on);
    void run("settings", async () => {
      const { share: link } = await shareApi.update(draft.id, { comments: on });
      setShare(draft.id, link);
    });
  };
  const invite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    void run(
      "invite",
      async () => {
        const added = await peopleApi.add(draft.id, email);
        setPeople(added.people);
        setEmail("");
        toast.success(
          added.emailed
            ? "Invitation sent"
            : "Added. They can open the link once they sign in with this address.",
        );
      },
      "person",
    );
  };
  const uninvite = (person: SharePerson) =>
    void run(
      "invite",
      async () => {
        await peopleApi.remove(draft.id, person.id);
        setPeople((list) => list.filter((p) => p.id !== person.id));
      },
      "person",
    );
  const stop = () =>
    run("stop", async () => {
      await shareApi.revoke(draft.id);
      setShare(draft.id, null);
      toast.success("Link taken down");
    });
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(share?.url ?? "");
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      field.current?.select();
      toast.info("Press Ctrl+C to copy the link");
    }
  };

  const remaining = share
    ? Math.min(maxDays, Math.max(1, Math.ceil((share.expiresAt - Date.now()) / DAY)))
    : Number(days);
  const lengths = Array.from({ length: maxDays }, (_, i) => i + 1);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Share</DialogTitle>
          <DialogDescription>
            {isPrivate
              ? "Only the people you invite can read the copy you publish, once they sign in. "
              : "Anyone with the link can read the copy you publish. "}
            It expires, and you can stop sharing at any time.
          </DialogDescription>
        </DialogHeader>

        {share && (
          <div className="grid gap-1.5">
            <Label htmlFor="share-link">{isPrivate ? "Private link" : "Public link"}</Label>
            <div className="flex gap-2">
              <Input
                id="share-link"
                ref={field}
                readOnly
                value={share.url}
                onFocus={(e) => e.currentTarget.select()}
                aria-label={isPrivate ? "Private link" : "Public link"}
              />
              <Button type="button" variant="outline" onClick={copy} aria-label="Copy link">
                {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              {isPrivate ? (
                <Lock className="mr-1 inline size-3.5" />
              ) : (
                <Globe className="mr-1 inline size-3.5" />
              )}
              Published {shareDate(share.publishedAt)}. Available until {shareDate(share.expiresAt)}
              .
            </p>
          </div>
        )}

        <div className="grid gap-1.5">
          <Label htmlFor="share-access">Who can open it</Label>
          <Select value={access} onValueChange={chooseAccess}>
            <SelectTrigger id="share-access" aria-label="Who can open it" disabled={busy !== null}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="public">{ACCESS.public}</SelectItem>
              <SelectItem value="people" disabled={!privateLinks && access !== "people"}>
                {ACCESS.people}
              </SelectItem>
            </SelectContent>
          </Select>
          {!privateLinks && (
            <p className="text-sm text-muted-foreground">
              Links for named people aren't available on this server.
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="grid gap-0.5">
            <Label htmlFor="share-comments">Let reviewers comment</Label>
            <p className="text-sm text-muted-foreground">
              Only verified and signed-in readers can comment
            </p>
          </div>
          <Switch
            id="share-comments"
            checked={comments}
            disabled={busy !== null}
            onCheckedChange={chooseComments}
            aria-label="Let reviewers comment"
          />
        </div>

        {isPrivate && !share && (
          <p className="text-sm text-muted-foreground">
            After you publish, add the email addresses of the people who may open it.
          </p>
        )}
        {isPrivate && share && (
          <div className="grid gap-2">
            <Label htmlFor="share-invite">People who can open it</Label>
            <form className="flex gap-2" onSubmit={invite}>
              <Input
                id="share-invite"
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
                disabled={!email.trim() || people.length >= MAX_SHARE_PEOPLE}
              >
                Invite
              </Button>
            </form>
            {people.length > 0 ? (
              <ul className="grid gap-1">
                {people.map((p) => (
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
              <p className="text-sm text-muted-foreground">No one yet. Only you can open it.</p>
            )}
          </div>
        )}

        <div className="grid gap-1.5">
          <Label htmlFor="share-days">Link lasts</Label>
          <Select value={String(share ? remaining : days)} onValueChange={changeLength}>
            <SelectTrigger id="share-days" aria-label="Link lasts" disabled={busy !== null}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {lengths.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {daysLabel(n)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!share && (
            <p className="text-sm text-muted-foreground">
              The page shows your text as it is in your cloud when you publish. Later edits stay
              private until you publish an update.
            </p>
          )}
        </div>

        {draft.images && Object.keys(draft.images).length > 0 && (
          <p className="text-sm text-muted-foreground">
            Images stored only on this device won't show on the public page. Host them first, or use
            image addresses.
          </p>
        )}

        {share && stale && (
          <p role="status" className="flex items-start gap-2 text-sm text-warning">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            Your draft has changes that are not published.
          </p>
        )}
        {problem && (
          <p role="alert" className="text-sm text-destructive">
            {problem}
          </p>
        )}

        <DialogFooter>
          {share ? (
            <>
              <Button
                type="button"
                variant="outline"
                loading={busy === "stop"}
                pending={busy !== null && busy !== "stop"}
                onClick={() => void stop()}
              >
                Stop sharing
              </Button>
              <Button
                type="button"
                loading={busy === "publish"}
                pending={busy !== null && busy !== "publish"}
                disabled={!stale}
                onClick={() => void publish()}
              >
                Publish update
              </Button>
            </>
          ) : (
            <Button
              type="button"
              loading={busy === "publish"}
              onClick={() => void publish(Number(days))}
            >
              Publish
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
