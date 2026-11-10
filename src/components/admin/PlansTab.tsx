import { Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HttpError } from "@/lib/sync/api";
import { type LimitCatalog, type LimitValue, type Plan, adminApi } from "@/lib/admin/api";
import { ConfirmButton } from "./bits";
import { LimitsEditor } from "./LimitsEditor";

const NAME = /^[a-z][a-z0-9-]{0,29}$/;

/** The plans an admin defines. Free always exists and changes nothing; others change the limits they list. */
export function PlansTab() {
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [catalog, setCatalog] = useState<LimitCatalog | null>(null);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [isNew, setIsNew] = useState(false);

  const load = useCallback(() => {
    adminApi.plans().then(
      (r) => {
        setPlans(r.plans);
        setCatalog(r.catalog);
      },
      () => toast.error("Couldn't load plans"),
    );
  }, []);
  useEffect(load, [load]);

  const save = async () => {
    if (!editing) return;
    try {
      await adminApi.savePlan(editing);
      toast.success("Plan saved");
      setEditing(null);
      load();
    } catch {
      toast.error("That plan isn't valid");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          A plan lists the limits it changes. Put an account on one from its page under Users.
        </p>
        <Button
          size="sm"
          onClick={() => {
            setIsNew(true);
            setEditing({ name: "", label: "", limits: {} });
          }}
        >
          <Plus className="size-4" /> New plan
        </Button>
      </div>
      <ul className="divide-y divide-border rounded-md border border-border">
        {(plans ?? []).map((p) => (
          <li key={p.name} className="flex items-center gap-3 px-3 py-2">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">
                {p.label} <span className="font-mono text-xs text-muted-foreground">{p.name}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                {Object.keys(p.limits).length
                  ? `Changes ${Object.keys(p.limits).length} limit${Object.keys(p.limits).length === 1 ? "" : "s"}`
                  : "Changes nothing"}
              </div>
            </div>
            {p.name !== "free" && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setIsNew(false);
                    setEditing(p);
                  }}
                >
                  Edit
                </Button>
                <ConfirmButton
                  confirm="Delete plan?"
                  onConfirm={() =>
                    void adminApi.deletePlan(p.name).then(
                      () => {
                        toast.success("Plan deleted");
                        load();
                      },
                      (e) =>
                        toast.error(
                          e instanceof HttpError && e.code === "in_use"
                            ? "Accounts are still on that plan"
                            : "Couldn't delete the plan",
                        ),
                    )
                  }
                >
                  Delete
                </ConfirmButton>
              </>
            )}
          </li>
        ))}
      </ul>
      {editing && catalog && (
        <section aria-label="Edit plan" className="space-y-4 rounded-lg border border-border p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="plan-name">Name</Label>
              <Input
                id="plan-name"
                value={editing.name}
                disabled={!isNew}
                placeholder="pro"
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">Lowercase letters, digits and dashes.</p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="plan-label">Label</Label>
              <Input
                id="plan-label"
                value={editing.label}
                maxLength={40}
                placeholder="Pro"
                onChange={(e) => setEditing({ ...editing, label: e.target.value })}
              />
            </div>
          </div>
          <LimitsEditor
            catalog={catalog}
            values={editing.limits}
            onChange={(limits: Record<string, LimitValue>) => setEditing({ ...editing, limits })}
          />
          <div className="flex gap-2">
            <Button
              disabled={!NAME.test(editing.name) || !editing.label.trim()}
              onClick={() => void save()}
            >
              Save plan
            </Button>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
