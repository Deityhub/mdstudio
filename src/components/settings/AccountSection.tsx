import { Avatar } from "@/components/ui/avatar";
import type { AccountUser } from "@/lib/account/client";
import { SettingsRow } from "./SettingsRow";

/** Who is signed in. Changing the name, password, sign-ins and address comes with the account API. */
export function AccountSection({ user }: { user: AccountUser }) {
  const label = user.displayName || user.email;
  return (
    <section aria-label="Account" className="max-w-2xl">
      <div className="flex items-center gap-3 border-b border-border pb-4">
        <Avatar src={user.avatarUrl} label={label} />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{label}</p>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
        </div>
      </div>
      <SettingsRow
        title="Email"
        description={user.emailVerified ? "Confirmed." : "Not confirmed yet."}
      >
        <span className="text-sm text-muted-foreground">{user.email}</span>
      </SettingsRow>
    </section>
  );
}
