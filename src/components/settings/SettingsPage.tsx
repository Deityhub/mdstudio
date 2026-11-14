import { useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { accountStore, useAccount } from "@/lib/account/store";
import { type SettingsTab, parseSettingsTab, visibleTabs } from "@/lib/settings/tabs";
import { AccountSection } from "./AccountSection";
import { AiSection } from "./AiSection";
import { ConnectionsSection } from "./ConnectionsSection";
import { EditorSection } from "./EditorSection";

const LABEL: Record<SettingsTab, string> = {
  account: "Account",
  editor: "Editor",
  ai: "AI",
  connections: "Connections",
};

/** Everything that can be set, in one place. Sections that need an account only show with one. */
export function SettingsPage({ tab, onTab }: { tab: string; onTab: (tab: SettingsTab) => void }) {
  const account = useAccount();
  // this page asks who is signed in itself, like the dashboard
  useEffect(() => void accountStore.refresh(), []);
  if (!account.loaded) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  const user = account.user;
  const current = parseSettingsTab(tab, !!user);
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-3">
          <Link to="/" aria-label="mdstudio home">
            <Logo />
          </Link>
          <span className="text-sm text-muted-foreground">Settings</span>
          <div className="ml-auto flex items-center gap-1">
            <Button asChild variant="ghost" size="sm">
              <Link to="/editor">Back to the editor</Link>
            </Button>
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-6">
        <h1 className="sr-only">Settings</h1>
        <Tabs value={current} onValueChange={(v) => onTab(v as SettingsTab)}>
          <TabsList className="mb-5 flex h-auto w-full flex-wrap justify-start">
            {visibleTabs(!!user).map((t) => (
              <TabsTrigger key={t} value={t}>
                {LABEL[t]}
              </TabsTrigger>
            ))}
          </TabsList>
          {user && (
            <TabsContent value="account">
              <AccountSection user={user} />
            </TabsContent>
          )}
          <TabsContent value="editor">
            <EditorSection />
          </TabsContent>
          <TabsContent value="ai">
            <AiSection />
          </TabsContent>
          {user && (
            <TabsContent value="connections">
              <ConnectionsSection userId={user.id} />
            </TabsContent>
          )}
        </Tabs>
      </main>
    </div>
  );
}
