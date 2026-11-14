import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type AccountUser, changePassword, updateDisplayName } from "@/lib/account/client";
import { accountStore } from "@/lib/account/store";
import { SettingsRow } from "./SettingsRow";

/** Who is signed in, and what they can change about themselves. */
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
      <NameForm name={user.displayName ?? ""} />
      <SettingsRow
        title="Email"
        description={user.emailVerified ? "Confirmed." : "Not confirmed yet."}
      >
        <span className="text-sm text-muted-foreground">{user.email}</span>
      </SettingsRow>
      <PasswordForm hasPassword={user.hasPassword !== false} />
    </section>
  );
}

function NameForm({ name }: { name: string }) {
  const [value, setValue] = useState(name);
  const [busy, setBusy] = useState(false);
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const r = await updateDisplayName(value);
    setBusy(false);
    if ("error" in r) return void toast.error(r.error);
    await accountStore.refresh();
    toast.success("Name saved");
  }
  return (
    <form onSubmit={save} className="border-b border-border py-4">
      <Label htmlFor="account-name" className="text-sm font-medium">
        Display name
      </Label>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Shown to people you edit with and in comments. Leave empty to show your email address.
      </p>
      <div className="mt-2 flex gap-2">
        <Input
          id="account-name"
          value={value}
          maxLength={60}
          className="max-w-xs"
          onChange={(e) => setValue(e.target.value)}
        />
        <Button type="submit" size="sm" disabled={busy || value.trim() === name}>
          Save
        </Button>
      </div>
    </form>
  );
}

function PasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const r = await changePassword(next, hasPassword ? current : undefined);
    setBusy(false);
    if ("error" in r) return void toast.error(r.error);
    setCurrent("");
    setNext("");
    await accountStore.refresh();
    toast.success(hasPassword ? "Password changed" : "Password set", {
      description: "Your other devices were signed out.",
    });
  }
  return (
    <form onSubmit={save} className="py-4">
      <h3 className="text-sm font-medium">{hasPassword ? "Change password" : "Set a password"}</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {hasPassword
          ? "Your other devices are signed out when it changes."
          : "You sign in with GitHub or Google. A password lets you sign in with your email too."}
      </p>
      <div className="mt-2 grid max-w-xs gap-2">
        {hasPassword && (
          <>
            <Label htmlFor="account-current" className="sr-only">
              Current password
            </Label>
            <Input
              id="account-current"
              type="password"
              autoComplete="current-password"
              placeholder="Current password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </>
        )}
        <Label htmlFor="account-new" className="sr-only">
          New password
        </Label>
        <Input
          id="account-new"
          type="password"
          autoComplete="new-password"
          placeholder="New password (10 characters or more)"
          value={next}
          onChange={(e) => setNext(e.target.value)}
        />
        <Button
          type="submit"
          size="sm"
          className="justify-self-start"
          disabled={busy || next.length < 10 || (hasPassword && !current)}
        >
          {hasPassword ? "Change password" : "Set password"}
        </Button>
      </div>
    </form>
  );
}
