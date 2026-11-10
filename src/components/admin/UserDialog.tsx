import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { HttpError } from "@/lib/sync/api";
import { type LimitValue, type UserContent, type UserDetail, adminApi } from "@/lib/admin/api";
import { bytes, limitDiff, when } from "@/lib/admin/limits";
import { Badge, ConfirmButton } from "./bits";
import { LimitsEditor } from "./LimitsEditor";

const REFUSED: Record<string, string> = {
  self: "You can't do that to your own account.",
  last_admin: "That would leave no admin.",
  invalid: "That change isn't allowed.",
  not_found: "That account no longer exists.",
};
const explain = (e: unknown) =>
  e instanceof HttpError
    ? (REFUSED[e.code ?? ""] ?? `Refused (${e.status}).`)
    : "Couldn't reach the server.";

/** Everything about one account, and the controls for it. Content shows titles and sizes, never text. */
export function UserDialog({
  userId,
  onClose,
  onChanged,
}: {
  userId: string | null;
  onClose: () => void;
  /** Called after a change, so the list behind can refresh. */
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [content, setContent] = useState<UserContent | null>(null);
  const [role, setRole] = useState("user");
  const [plan, setPlan] = useState("free");
  const [suspended, setSuspended] = useState(false);
  const [verified, setVerified] = useState(false);
  const [limits, setLimits] = useState<Record<string, LimitValue>>({});
  const [saving, setSaving] = useState(false);

  const show = useCallback((d: UserDetail) => {
    setDetail(d);
    setRole(d.account.role);
    setPlan(d.account.plan);
    setSuspended(d.account.suspended);
    setVerified(d.account.emailVerified);
    setLimits(
      Object.fromEntries(
        Object.entries(d.limits)
          .filter(([, r]) => r.source === "override")
          .map(([k, r]) => [k, r.value]),
      ),
    );
  }, []);

  useEffect(() => {
    setDetail(null);
    setContent(null);
    if (!userId) return;
    let live = true;
    adminApi
      .user(userId)
      .then((d) => live && show(d))
      .catch((e) => toast.error(explain(e)));
    adminApi
      .content(userId)
      .then((c) => live && setContent(c))
      .catch(() => undefined);
    return () => void (live = false);
  }, [userId, show]);

  const originalLimits = Object.fromEntries(
    Object.entries(detail?.limits ?? {})
      .filter(([, r]) => r.source === "override")
      .map(([k, r]) => [k, r.value]),
  );
  const accountChange = detail
    ? {
        ...(role !== detail.account.role && { role }),
        ...(plan !== detail.account.plan && { plan }),
        ...(suspended !== detail.account.suspended && { suspended }),
        ...(verified !== detail.account.emailVerified && { emailVerified: verified }),
      }
    : {};
  const limitChange = limitDiff(originalLimits, limits);

  const save = async (change: Record<string, unknown>, done: string) => {
    if (!userId) return;
    setSaving(true);
    try {
      show(await adminApi.updateUser(userId, change));
      toast.success(done);
      onChanged();
    } catch (e) {
      toast.error(explain(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (kind: "shares" | "images" | "drafts", item: string) => {
    if (!userId) return;
    try {
      await adminApi.removeContent(userId, kind, item);
      setContent(await adminApi.content(userId));
      show(await adminApi.user(userId));
      toast.success("Removed");
    } catch (e) {
      toast.error(explain(e));
    }
  };

  const a = detail?.account;
  return (
    <Dialog open={userId !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-1rem)] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="break-all">{a?.email ?? "Account"}</DialogTitle>
          <DialogDescription>
            {a ? (
              <span className="flex flex-wrap items-center gap-1.5">
                Joined {when(a.createdAt)}
                {a.role === "admin" && <Badge tone="good">admin</Badge>}
                {a.suspended && <Badge tone="bad">suspended</Badge>}
                {!a.emailVerified && <Badge tone="warn">email not confirmed</Badge>}
                {!a.hasPassword && <Badge>GitHub sign-in only</Badge>}
              </span>
            ) : (
              "Loading…"
            )}
          </DialogDescription>
        </DialogHeader>
        {detail && a && (
          <div className="space-y-6">
            <section aria-label="Account" className="space-y-3">
              <h3 className="text-sm font-medium">Account</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="adm-role">Role</Label>
                  <Select value={role} onValueChange={setRole}>
                    <SelectTrigger id="adm-role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">User</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="adm-plan">Plan</Label>
                  <Select value={plan} onValueChange={setPlan}>
                    <SelectTrigger id="adm-plan">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {detail.plans.map((p) => (
                        <SelectItem key={p} value={p}>
                          {p}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="adm-suspended" className="flex-1">
                  Suspended
                  <span className="block text-xs font-normal text-muted-foreground">
                    Cannot sign in or use the cloud, and its share links stop working. Nothing is
                    deleted.
                  </span>
                </Label>
                <Switch id="adm-suspended" checked={suspended} onCheckedChange={setSuspended} />
              </div>
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="adm-verified" className="flex-1">
                  Email confirmed
                </Label>
                <Switch id="adm-verified" checked={verified} onCheckedChange={setVerified} />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  disabled={saving || !Object.keys(accountChange).length}
                  onClick={() => void save(accountChange, "Account updated")}
                >
                  Save account
                </Button>
                <ConfirmButton
                  onConfirm={() =>
                    void adminApi
                      .signOut(a.id)
                      .then((r) => {
                        toast.success(
                          `Signed out of ${r.ended} session${r.ended === 1 ? "" : "s"}`,
                        );
                        return adminApi.user(a.id).then(show);
                      })
                      .catch((e) => toast.error(explain(e)))
                  }
                >
                  Sign out everywhere
                </ConfirmButton>
                <ConfirmButton
                  confirm="Delete for good?"
                  onConfirm={() =>
                    void adminApi
                      .deleteUser(a.id)
                      .then(() => {
                        toast.success("Account deleted");
                        onChanged();
                        onClose();
                      })
                      .catch((e) => toast.error(explain(e)))
                  }
                >
                  Delete account
                </ConfirmButton>
              </div>
            </section>

            <section aria-label="Usage" className="space-y-2">
              <h3 className="text-sm font-medium">Usage</h3>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
                {[
                  ["Cloud drafts", detail.usage.drafts],
                  ["Share links", detail.usage.shares],
                  ["Images", `${detail.usage.images} · ${bytes(detail.usage.imageBytes)}`],
                  ["AI integrations", detail.usage.integrations],
                  ["Signed-in devices", detail.usage.sessions],
                  ["GitHub", detail.usage.github ?? "not connected"],
                ].map(([k, v]) => (
                  <div key={String(k)}>
                    <dt className="text-xs text-muted-foreground">{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <section aria-label="Limits" className="space-y-2">
              <h3 className="text-sm font-medium">Limits for this account</h3>
              <p className="text-xs text-muted-foreground">
                A value set here beats the plan, the server defaults and the built-in ones. Leave a
                field empty to use what applies.
              </p>
              <LimitsEditor
                catalog={detail.catalog}
                values={limits}
                inherited={detail.limits}
                onChange={setLimits}
                disabled={saving}
              />
              <Button
                size="sm"
                disabled={saving || !Object.keys(limitChange).length}
                onClick={() => void save({ limits: limitChange }, "Limits updated")}
              >
                Save limits
              </Button>
            </section>

            <section aria-label="Content" className="space-y-3">
              <h3 className="text-sm font-medium">Content</h3>
              <p className="text-xs text-muted-foreground">
                Titles, sizes and dates only. The text of a draft is never shown here.
              </p>
              {!content ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : (
                <>
                  <ContentList
                    title="Cloud drafts"
                    empty="No cloud drafts."
                    rows={content.drafts.map((d) => ({
                      id: d.id,
                      label: d.title,
                      meta: `${bytes(d.bytes)} · edited ${when(d.updatedAt)}`,
                    }))}
                    onRemove={(id) => void remove("drafts", id)}
                  />
                  <ContentList
                    title="Share links"
                    empty="No share links."
                    rows={content.shares.map((s) => ({
                      id: s.id,
                      label: s.title || "Untitled",
                      meta: `/s/${s.slug} · ${s.access} · ${s.live ? `until ${when(s.expiresAt)}` : "expired"}`,
                    }))}
                    onRemove={(id) => void remove("shares", id)}
                  />
                  <ContentList
                    title="Images"
                    empty="No hosted images."
                    rows={content.images.map((i) => ({
                      id: i.id,
                      label: i.fileName,
                      meta: `${bytes(i.bytes)} · ${when(i.createdAt)}`,
                    }))}
                    onRemove={(id) => void remove("images", id)}
                  />
                </>
              )}
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ContentList({
  title,
  empty,
  rows,
  onRemove,
}: {
  title: string;
  empty: string;
  rows: { id: string; label: string; meta: string }[];
  onRemove: (id: string) => void;
}) {
  return (
    <div className="space-y-1">
      <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</h4>
      {rows.length ? (
        <ul className="divide-y divide-border rounded-md border border-border">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-2 px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{r.label}</div>
                <div className="truncate text-xs text-muted-foreground">{r.meta}</div>
              </div>
              <ConfirmButton confirm="Remove?" onConfirm={() => onRemove(r.id)}>
                Remove
              </ConfirmButton>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{empty}</p>
      )}
    </div>
  );
}
