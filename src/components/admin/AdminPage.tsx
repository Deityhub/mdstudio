import { useEffect } from "react";
import { TabsContent } from "@/components/ui/tabs";
import { AppShell, PageTitle } from "@/components/site/AppShell";
import { NotFoundPage } from "@/components/site/Standalone";
import { accountStore, useAccount } from "@/lib/account/store";
import { ADMIN_TABS, type AdminTab } from "@/lib/admin/tabs";
import { AuditTab } from "./AuditTab";
import { OverviewTab } from "./OverviewTab";
import { PlansTab } from "./PlansTab";
import { SettingsTab } from "./SettingsTab";
import { UsersTab } from "./UsersTab";

const LABEL: Record<AdminTab, string> = {
  overview: "Overview",
  users: "Accounts",
  plans: "Plans",
  settings: "Server",
  audit: "Audit log",
};

const SUB: Record<AdminTab, string> = {
  overview: "Accounts, drafts and sharing on this server.",
  users: "Search by email or name, and open an account to change it.",
  plans: "Each account is on one plan. Its own limits beat the plan's.",
  settings: "Settings for everyone on this server.",
  audit: "Every change an admin made, newest first.",
};

/** Only an admin sees anything here; everyone else gets the same page as for an address that does not exist. */
export function AdminPage({
  tab,
  user,
  onTab,
  onUser,
}: {
  tab: AdminTab;
  user: string | null;
  onTab: (tab: AdminTab) => void;
  onUser: (id: string | null) => void;
}) {
  const account = useAccount();
  // the dashboard is the one page that asks who is signed in itself
  useEffect(() => void accountStore.refresh(), []);
  if (!account.loaded) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  if (!account.user?.isAdmin) return <NotFoundPage />;
  return (
    <AppShell
      label={
        <span className="bg-accent px-2 py-0.5 text-xs font-semibold text-primary">Admin</span>
      }
      sections={ADMIN_TABS.map((id) => ({ id, label: LABEL[id] }))}
      current={tab}
      onSection={onTab}
      menuLabel="Admin sections"
      wide
    >
      <TabsContent value={tab} className="mt-0">
        <PageTitle title={LABEL[tab]} sub={SUB[tab]} />
        {tab === "overview" && <OverviewTab />}
        {tab === "users" && <UsersTab openId={user} onOpen={onUser} />}
        {tab === "plans" && <PlansTab />}
        {tab === "settings" && <SettingsTab />}
        {tab === "audit" && <AuditTab />}
      </TabsContent>
    </AppShell>
  );
}
