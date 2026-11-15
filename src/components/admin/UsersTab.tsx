import { when } from "@/lib/admin/limits";
import { Search } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type UserRow, adminApi } from "@/lib/admin/api";
import { Badge, Pager } from "./bits";
import { UserDialog } from "./UserDialog";

export function UsersTab({
  openId,
  onOpen,
}: {
  /** The account open in the dialog (kept in the address, so a link opens it). */
  openId: string | null;
  onOpen: (id: string | null) => void;
}) {
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const [page, setPage] = useState(0);
  const [data, setData] = useState<{ users: UserRow[]; total: number; pageSize: number } | null>(
    null,
  );
  const [failed, setFailed] = useState(false);

  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    setFailed(false);
    setBusy(true);
    adminApi
      .users(term, page)
      .then(setData, () => setFailed(true))
      .finally(() => setBusy(false));
  }, [term, page]);
  useEffect(load, [load]);

  return (
    <div>
      <form
        className="flex gap-2"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(0);
          setTerm(q);
        }}
      >
        <Input
          aria-label="Search accounts"
          placeholder="Search by email or name"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Button type="submit" variant="outline" loading={busy}>
          <Search className="size-4" /> Search
        </Button>
      </form>
      {failed && <p className="pt-3 text-sm text-destructive">Couldn't load accounts.</p>}
      {data && (
        <>
          <div className="mt-3 overflow-x-auto rounded-md border border-border bg-muted">
            <table className="w-full min-w-160 text-left text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Account</th>
                  <th className="px-3 py-2 font-medium">Plan</th>
                  <th className="px-3 py-2 font-medium">Drafts</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.users.map((u) => (
                  <tr key={u.id} className="hover:bg-accent/40">
                    <td className="px-3 py-2">
                      <button
                        className="text-left font-medium underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        onClick={() => onOpen(u.id)}
                      >
                        {u.email}
                      </button>
                      {u.displayName && (
                        <div className="text-xs text-muted-foreground">{u.displayName}</div>
                      )}
                    </td>
                    <td className="px-3 py-2">{u.plan}</td>
                    <td className="px-3 py-2">{u.drafts}</td>
                    <td className="space-x-1 px-3 py-2">
                      {u.role === "admin" && <Badge tone="good">admin</Badge>}
                      {u.suspended && <Badge tone="bad">suspended</Badge>}
                      {!u.emailVerified && <Badge tone="warn">unconfirmed</Badge>}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{when(u.createdAt)}</td>
                  </tr>
                ))}
                {!data.users.length && (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                      No accounts match.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <Pager page={page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
        </>
      )}
      <UserDialog userId={openId} onClose={() => onOpen(null)} onChanged={load} />
    </div>
  );
}
