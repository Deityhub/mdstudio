import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { type LimitCatalog, type LimitValue, type Settings, adminApi } from "@/lib/admin/api";
import { limitDiff } from "@/lib/admin/limits";
import { LimitsEditor } from "./LimitsEditor";

/** Server-wide controls: who may sign up, a notice for every page, and the default limits. */
export function SettingsTab() {
  const [saved, setSaved] = useState<Settings | null>(null);
  const [catalog, setCatalog] = useState<LimitCatalog | null>(null);
  const [signups, setSignups] = useState(true);
  const [collab, setCollab] = useState(true);
  const [notice, setNotice] = useState("");
  const [limits, setLimits] = useState<Record<string, LimitValue>>({});
  const [busy, setBusy] = useState(false);

  const show = useCallback((r: { settings: Settings; catalog: LimitCatalog }) => {
    setSaved(r.settings);
    setCatalog(r.catalog);
    setSignups(r.settings.signupsOpen);
    setCollab(r.settings.collabOpen);
    setNotice(r.settings.notice ?? "");
    setLimits(r.settings.limits);
  }, []);
  useEffect(() => {
    adminApi.settings().then(show, () => toast.error("Couldn't load settings"));
  }, [show]);

  if (!saved || !catalog) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const change = {
    ...(signups !== saved.signupsOpen && { signupsOpen: signups }),
    ...(collab !== saved.collabOpen && { collabOpen: collab }),
    ...(notice.trim() !== (saved.notice ?? "") && { notice: notice.trim() || null }),
    ...(Object.keys(limitDiff(saved.limits, limits)).length && {
      limits: limitDiff(saved.limits, limits),
    }),
  };

  return (
    <div className="space-y-6">
      <section aria-label="Site" className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="set-signups" className="flex-1">
            New accounts can be created
            <span className="block text-xs font-normal text-muted-foreground">
              Turn off to close sign-ups (password and GitHub). Existing accounts are not affected.
            </span>
          </Label>
          <Switch id="set-signups" checked={signups} onCheckedChange={setSignups} />
        </div>
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="set-collab" className="flex-1">
            Editing together is open
            <span className="block text-xs font-normal text-muted-foreground">
              Turn off to close live editing for everyone: open sessions end within minutes and no
              new ones start. Drafts keep their latest text.
            </span>
          </Label>
          <Switch id="set-collab" checked={collab} onCheckedChange={setCollab} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="set-notice">Site notice</Label>
          <Textarea
            id="set-notice"
            rows={2}
            maxLength={300}
            value={notice}
            placeholder="Shown above every page, for example about maintenance. Leave empty for none."
            onChange={(e) => setNotice(e.target.value)}
          />
        </div>
      </section>
      <section aria-label="Default limits" className="space-y-2">
        <h3 className="text-sm font-medium">Default limits for every account</h3>
        <p className="text-xs text-muted-foreground">
          These beat the server's environment settings and are beaten by a plan or an account's own
          limits. Leave a field empty to use the environment setting or the built-in value.
        </p>
        <LimitsEditor catalog={catalog} values={limits} onChange={setLimits} disabled={busy} />
      </section>
      <Button
        loading={busy}
        disabled={!Object.keys(change).length}
        onClick={async () => {
          setBusy(true);
          try {
            show(await adminApi.updateSettings(change));
            toast.success("Settings saved");
          } catch {
            toast.error("Couldn't save the settings");
          } finally {
            setBusy(false);
          }
        }}
      >
        Save settings
      </Button>
    </div>
  );
}
