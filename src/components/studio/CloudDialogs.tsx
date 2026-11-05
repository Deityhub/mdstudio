import { Cloud } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { documentStore, indexedDbStore, type MdDocument } from "@/lib/storage/documentStore";
import { addToCloud, useCloud } from "@/lib/sync/hooks";
import { cloudOwners, isVisible } from "@/lib/sync/meta";
import { toast } from "sonner";
import { requestVerification } from "@/lib/account/client";
import { accountStore } from "@/lib/account/store";

/** Picks which drafts go to the account; everything else stays in this browser. */
export function ChooseCloudDrafts({
  userId,
  open,
  onOpenChange,
}: {
  userId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const cloud = useCloud();
  const [drafts, setDrafts] = useState<MdDocument[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const room = Math.max(0, cloud.limit - cloud.linked.size);

  useEffect(() => {
    if (!open) return;
    setPicked(new Set());
    void Promise.all([documentStore.list(), cloudOwners(indexedDbStore)]).then(([all, owners]) =>
      setDrafts(all.filter((d) => isVisible(owners, d.id, userId) && !cloud.linked.has(d.id))),
    );
    // the list is read when the dialog opens; later cloud changes must not reshuffle it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, userId]);

  const toggle = (id: string) =>
    setPicked((p) => {
      const next = new Set(p);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Choose what to store in your cloud</DialogTitle>
          <DialogDescription>
            Only the drafts you pick are uploaded to your account. Everything else stays in this
            browser. You can change this later from a draft's menu.
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm text-muted-foreground" data-testid="cloud-room">
          {room === 0
            ? `Your cloud is full (${cloud.limit} of ${cloud.limit}).`
            : `You can add ${room} more draft${room === 1 ? "" : "s"} (${cloud.linked.size} of ${cloud.limit} used).`}
        </p>
        <ul className="max-h-64 space-y-1 overflow-y-auto" aria-label="Drafts on this device">
          {drafts.length === 0 && (
            <li className="text-sm text-muted-foreground">No other drafts on this device.</li>
          )}
          {drafts.map((d) => (
            <li key={d.id}>
              <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-primary"
                  checked={picked.has(d.id)}
                  disabled={!picked.has(d.id) && picked.size >= room}
                  onChange={() => toggle(d.id)}
                />
                <span className="truncate">{d.title}</span>
              </label>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button variant="ghost" pending={saving} onClick={() => onOpenChange(false)}>
            Not now
          </Button>
          <Button
            loading={saving}
            disabled={picked.size === 0}
            onClick={async () => {
              setSaving(true);
              try {
                await addToCloud(userId, [...picked]);
              } finally {
                setSaving(false);
              }
              onOpenChange(false);
              toast.success(
                `${picked.size} draft${picked.size === 1 ? "" : "s"} will be stored in your cloud`,
              );
            }}
          >
            <Cloud className="h-4 w-4" /> Save to cloud
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export type SignOutPrompt =
  { kind: "offline"; count: number } | { kind: "images"; titles: string[]; ids: string[] };

/** Asks before a sign-out that would cost something: unsaved changes, or images that only live here. */
export function SignOutDialog({
  prompt,
  onCancel,
  onConfirm,
}: {
  prompt: SignOutPrompt | null;
  onCancel: () => void;
  /** `keep` is the drafts to leave on this device: "all", none, or just the ones with images. */
  onConfirm: (keep: "all" | "none" | "images") => void;
}) {
  return (
    <Dialog open={!!prompt} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-md">
        {prompt?.kind === "offline" && (
          <>
            <DialogHeader>
              <DialogTitle>Can't save your latest changes</DialogTitle>
              <DialogDescription>
                The server can't be reached, so changes to {prompt.count} cloud draft
                {prompt.count === 1 ? "" : "s"} are not saved to your account yet. Staying signed in
                lets them sync once you are back online.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="ghost" onClick={onCancel}>
                Stay signed in
              </Button>
              <Button variant="outline" onClick={() => onConfirm("all")}>
                Sign out and keep these drafts here
              </Button>
            </DialogFooter>
          </>
        )}
        {prompt?.kind === "images" && (
          <>
            <DialogHeader>
              <DialogTitle>Some drafts have images stored only here</DialogTitle>
              <DialogDescription>
                Images are not stored in the cloud yet. Removing these drafts from this device when
                you sign out would lose their images:
              </DialogDescription>
            </DialogHeader>
            <ul className="list-disc pl-5 text-sm">
              {prompt.titles.map((t, i) => (
                <li key={i} className="truncate">
                  {t}
                </li>
              ))}
            </ul>
            <DialogFooter>
              <Button variant="ghost" onClick={onCancel}>
                Cancel
              </Button>
              <Button variant="outline" onClick={() => onConfirm("none")}>
                Remove everything
              </Button>
              <Button onClick={() => onConfirm("images")}>Keep these drafts here</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * The cloud is closed until the email address is confirmed. Opening this for the first time sends
 * the link (nothing is sent at sign-up), and later openings do not send another unless asked.
 */
export function VerifyEmail({
  open,
  onOpenChange,
  email,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  email: string;
}) {
  const [sending, setSending] = useState(false);
  const [checking, setChecking] = useState(false);
  const [problem, setProblem] = useState("");
  const [sent, setSent] = useState(false);

  async function send(force: boolean) {
    setSending(true);
    setProblem("");
    const result = await requestVerification(force);
    setSending(false);
    if ("error" in result) return setProblem(result.error);
    if (result.alreadyVerified) {
      await accountStore.refresh();
      return onOpenChange(false);
    }
    setSent(true);
    if (result.sent)
      toast.success("Email sent", { description: "It can take a minute to arrive." });
  }

  useEffect(() => {
    if (open) {
      setSent(false);
      void send(false);
    }
    // sends once per opening
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Confirm your email</DialogTitle>
          <DialogDescription>
            To store drafts in your cloud, confirm {email}.{" "}
            {problem
              ? ""
              : sending && !sent
                ? "Sending a link…"
                : "We sent a link: click it, then come back. "}
            Writing, previewing and exporting work without it.
          </DialogDescription>
        </DialogHeader>
        {problem && (
          <p role="alert" className="text-sm text-destructive">
            {problem}
          </p>
        )}
        <DialogFooter>
          <Button
            variant="ghost"
            loading={checking}
            pending={sending}
            onClick={async () => {
              setChecking(true);
              try {
                await accountStore.refresh();
              } finally {
                setChecking(false);
              }
              onOpenChange(false);
            }}
          >
            I've confirmed it
          </Button>
          <Button
            variant="outline"
            loading={sending}
            pending={checking}
            onClick={() => void send(true)}
          >
            Send it again
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
