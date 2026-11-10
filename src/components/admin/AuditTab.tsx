import { when } from "@/lib/admin/limits";
import { useEffect, useState } from "react";
import { type AuditEntry, adminApi } from "@/lib/admin/api";
import { Pager } from "./bits";

const LABEL: Record<string, string> = {
  "user.update": "Changed an account",
  "user.delete": "Deleted an account",
  "user.sign_out": "Signed an account out",
  "share.remove": "Removed a share link",
  "image.remove": "Removed an image",
  "draft.remove": "Removed a cloud draft",
  "plan.save": "Saved a plan",
  "plan.delete": "Deleted a plan",
  "settings.update": "Changed server settings",
};

export function AuditTab() {
  const [page, setPage] = useState(0);
  const [data, setData] = useState<{
    entries: AuditEntry[];
    total: number;
    pageSize: number;
  } | null>(null);
  useEffect(() => {
    adminApi.audit(page).then(setData, () => undefined);
  }, [page]);
  if (!data) return <p className="text-sm text-muted-foreground">Loading…</p>;
  return (
    <div>
      <ul className="divide-y divide-border rounded-md border border-border">
        {data.entries.map((e) => (
          <li key={e.id} className="space-y-0.5 px-3 py-2">
            <div className="text-sm">
              <span className="font-medium">{e.actorEmail}</span> · {LABEL[e.action] ?? e.action}
              {e.targetEmail && <span className="text-muted-foreground"> · {e.targetEmail}</span>}
            </div>
            <div className="text-xs text-muted-foreground">{when(e.at)}</div>
            {typeof e.detail === "object" &&
            e.detail !== null &&
            Object.keys(e.detail).length > 0 ? (
              <pre className="overflow-x-auto rounded bg-muted px-2 py-1 font-mono text-[11px]">
                {JSON.stringify(e.detail)}
              </pre>
            ) : null}
          </li>
        ))}
        {!data.entries.length && (
          <li className="px-3 py-6 text-center text-sm text-muted-foreground">Nothing yet.</li>
        )}
      </ul>
      <Pager page={page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
    </div>
  );
}
