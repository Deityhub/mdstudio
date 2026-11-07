import { Check, Copy, Globe, TriangleAlert } from "lucide-react";
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
import { askToConfirmEmail } from "@/lib/account/verify-prompt";
import { accountStore } from "@/lib/account/store";
import { ShareError, shareApi } from "@/lib/share/api";
import { contentHash } from "@/lib/share/hash";
import { setShare, useShares } from "@/lib/share/hooks";
import { shareDate } from "@/lib/share/page";
import type { MdDocument } from "@/lib/storage/documentStore";
import { AuthExpiredError, UnverifiedError } from "@/lib/sync/api";

const DAY = 86_400_000;
const daysLabel = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;

const explain = (error: unknown) =>
  error instanceof ShareError
    ? {
        not_found: "This draft hasn't reached your cloud yet. Wait for it to sync, then try again.",
        invalid: "That length isn't allowed.",
        too_many: "You've changed links a lot in the last hour. Try again a little later.",
        failed: "Couldn't reach the server. Check your connection and try again.",
      }[error.code]
    : "Something went wrong. Try again.";

/**
 * Publishes a cloud draft as a public, read-only page that expires. What is public is a copy made
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
  const { byDraft, defaultDays, maxDays } = useShares();
  const share = draft ? byDraft.get(draft.id) : undefined;
  const [days, setDays] = useState(String(defaultDays));
  const [busy, setBusy] = useState<"publish" | "extend" | "stop" | null>(null);
  const [problem, setProblem] = useState("");
  const [copied, setCopied] = useState(false);
  const [stale, setStale] = useState(false);
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setDays(String(defaultDays));
      setProblem("");
      setCopied(false);
    }
  }, [open, draft?.id, defaultDays]);

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

  async function run<T>(kind: NonNullable<typeof busy>, work: () => Promise<T>) {
    setBusy(kind);
    setProblem("");
    try {
      return await work();
    } catch (error) {
      if (error instanceof UnverifiedError) {
        onOpenChange(false);
        askToConfirmEmail();
      } else if (error instanceof AuthExpiredError) {
        onOpenChange(false);
        void accountStore.refresh();
      } else setProblem(explain(error));
      return undefined;
    } finally {
      setBusy(null);
    }
  }

  const publish = (chosen?: number) =>
    run("publish", async () => {
      await beforePublish();
      const { share: link, created } = await shareApi.publish(draft.id, chosen);
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
            Anyone with the link can read the copy you publish. It expires, and you can stop sharing
            at any time.
          </DialogDescription>
        </DialogHeader>

        {share && (
          <div className="grid gap-1.5">
            <Label htmlFor="share-link">Public link</Label>
            <div className="flex gap-2">
              <Input
                id="share-link"
                ref={field}
                readOnly
                value={share.url}
                onFocus={(e) => e.currentTarget.select()}
                aria-label="Public link"
              />
              <Button type="button" variant="outline" onClick={copy} aria-label="Copy link">
                {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              <Globe className="mr-1 inline size-3.5" />
              Published {shareDate(share.publishedAt)}. Available until {shareDate(share.expiresAt)}
              .
            </p>
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
