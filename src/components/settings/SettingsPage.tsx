import { useEffect } from "react";
import { TabsContent } from "@/components/ui/tabs";
import { AppShell, PageTitle } from "@/components/site/AppShell";
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
    <AppShell
      label={<span className="hidden text-sm text-muted-foreground sm:inline">/ Settings</span>}
      sections={visibleTabs(!!user).map((id) => ({ id, label: LABEL[id] }))}
      current={current}
      onSection={onTab}
      menuLabel="Settings sections"
    >
      {user && (
        <TabsContent value="account" className="mt-0">
          <PageTitle title="Account" sub={`Signed in as ${user.email}.`} />
          <AccountSection user={user} />
        </TabsContent>
      )}
      <TabsContent value="editor" className="mt-0">
        <PageTitle title="Editor" sub="Kept on this device. Works without an account." />
        <EditorSection />
      </TabsContent>
      <TabsContent value="ai" className="mt-0">
        <PageTitle
          title="AI"
          sub="Your browser talks to the provider directly. Keys are kept for this session only, never on our server."
        />
        <AiSection />
      </TabsContent>
      {user && (
        <TabsContent value="connections" className="mt-0">
          <PageTitle title="Connections" sub="What your account reaches beyond this device." />
          <ConnectionsSection userId={user.id} />
        </TabsContent>
      )}
    </AppShell>
  );
}
