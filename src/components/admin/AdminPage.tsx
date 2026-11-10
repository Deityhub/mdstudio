import { Link } from "@tanstack/react-router";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useEffect } from "react";
import { accountStore, useAccount } from "@/lib/account/store";
import { AuditTab } from "./AuditTab";
import { OverviewTab } from "./OverviewTab";
import { PlansTab } from "./PlansTab";
import { SettingsTab } from "./SettingsTab";
import { UsersTab } from "./UsersTab";

import { ADMIN_TABS, type AdminTab } from "@/lib/admin/tabs";

const LABEL: Record<AdminTab, string> = {
  overview: "Overview",
  users: "Accounts",
  plans: "Plans",
  settings: "Server",
  audit: "Audit log",
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
  if (!account.user?.isAdmin) return <NotFound />;
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <Link to="/" aria-label="mdstudio home">
            <Logo />
          </Link>
          <span className="text-sm text-muted-foreground">Admin</span>
          <div className="ml-auto flex items-center gap-1">
            <Button asChild variant="ghost" size="sm">
              <Link to="/editor">Back to the editor</Link>
            </Button>
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <h1 className="sr-only">Admin dashboard</h1>
        <Tabs value={tab} onValueChange={(v) => onTab(v as AdminTab)}>
          <TabsList className="mb-5 flex h-auto w-full flex-wrap justify-start">
            {ADMIN_TABS.map((t) => (
              <TabsTrigger key={t} value={t}>
                {LABEL[t]}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="overview">{tab === "overview" && <OverviewTab />}</TabsContent>
          <TabsContent value="users">
            {tab === "users" && <UsersTab openId={user} onOpen={onUser} />}
          </TabsContent>
          <TabsContent value="plans">{tab === "plans" && <PlansTab />}</TabsContent>
          <TabsContent value="settings">{tab === "settings" && <SettingsTab />}</TabsContent>
          <TabsContent value="audit">{tab === "audit" && <AuditTab />}</TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}
