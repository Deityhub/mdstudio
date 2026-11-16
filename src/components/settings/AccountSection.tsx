import { type FormEvent, type ReactNode, useState } from "react";
import { toast } from "sonner";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  type AccountUser,
  changePassword,
  requestEmailChange,
  unlinkProvider,
  updateDisplayName,
} from "@/lib/account/client";
import { accountStore, useAccount } from "@/lib/account/store";
import { Card, CardHeading } from "@/components/site/AppShell";
import { SettingsRow } from "./SettingsRow";

/** Who is signed in, and what they can change about themselves (each change in its own dialog). */
export function AccountSection({ user }: { user: AccountUser }) {
  const label = user.displayName || user.email;
  const [editing, setEditing] = useState<"name" | "email" | "password" | null>(null);
  const hasPassword = user.hasPassword !== false;
  return (
    <section aria-label="Account">
      <Card className="flex items-center gap-3 px-4 py-4 sm:px-5">
        <Avatar src={user.avatarUrl} label={label} className="size-10 text-base" />
        <div className="min-w-0">
          <p className="truncate text-base font-semibold">{label}</p>
          <p className="truncate text-[13px] text-muted-foreground">{user.email}</p>
        </div>
      </Card>
      <Card>
        <SettingsRow
          title="Display name"
          description={`Shown to people you edit with and in comments. ${
            user.displayName ? user.displayName : "Not set: your email address is shown."
          }`}
        >
          <Button variant="outline" size="sm" onClick={() => setEditing("name")}>
            Edit
          </Button>
        </SettingsRow>
        <SettingsRow
          title="Email"
          description={
            hasPassword
              ? `${user.email}. ${user.emailVerified ? "Confirmed." : "Not confirmed yet."}`
              : `${user.email}. Set a password first to change it.`
          }
        >
          <Button
            variant="outline"
            size="sm"
            disabled={!hasPassword}
            onClick={() => setEditing("email")}
          >
            Edit
          </Button>
        </SettingsRow>
        <SettingsRow
          title="Password"
          description={
            hasPassword
              ? "Changing it signs your other devices out."
              : "You sign in with GitHub or Google. A password lets you sign in with your email too."
          }
        >
          <Button variant="outline" size="sm" onClick={() => setEditing("password")}>
            {hasPassword ? "Edit" : "Set password"}
          </Button>
        </SettingsRow>
      </Card>
      <SignInMethods user={user} />
      {/* mounted only while open, so each opening starts empty or from what is saved */}
      {editing === "name" && (
        <NameDialog onClose={() => setEditing(null)} name={user.displayName ?? ""} />
      )}
      {editing === "email" && <EmailDialog onClose={() => setEditing(null)} />}
      {editing === "password" && (
        <PasswordDialog onClose={() => setEditing(null)} hasPassword={hasPassword} />
      )}
    </section>
  );
}

const PROVIDERS = [
  { id: "github", name: "GitHub" },
  { id: "google", name: "Google" },
] as const;

/** GitHub and Google sign-ins: link another one, or unlink one while another way remains. */
function SignInMethods({ user }: { user: AccountUser }) {
  const account = useAccount();
  const linked = user.linked ?? [];
  const [busy, setBusy] = useState(false);
  const lastMethod = user.hasPassword === false && linked.length < 2;
  const shown = PROVIDERS.filter((p) => linked.includes(p.id) || account[p.id]);
  if (!shown.length) return null;
  return (
    <>
      <CardHeading>Sign-in methods</CardHeading>
      <Card>
        {shown.map((p) => {
          const isLinked = linked.includes(p.id);
          return (
            <SettingsRow
              key={p.id}
              title={`Sign in with ${p.name}`}
              description={
                isLinked
                  ? lastMethod
                    ? "Linked. It is your only way to sign in: set a password to be able to unlink it."
                    : "Linked."
                  : `Link a ${p.name} account to sign in with it too. It can have a different email address.`
              }
            >
              {isLinked ? (
                <Button
                  variant="outline"
                  size="sm"
                  loading={busy}
                  disabled={lastMethod}
                  onClick={async () => {
                    setBusy(true);
                    const r = await unlinkProvider(p.id);
                    setBusy(false);
                    if ("error" in r) return void toast.error(r.error);
                    await accountStore.refresh();
                    toast.success(`${p.name} unlinked`);
                  }}
                >
                  Unlink
                </Button>
              ) : (
                <Button asChild variant="outline" size="sm">
                  <a href={`/api/auth/${p.id}?link=1`}>Link</a>
                </Button>
              )}
            </SettingsRow>
          );
        })}
      </Card>
    </>
  );
}

function FormDialog({
  onClose,
  title,
  description,
  submit,
  busy,
  disabled,
  onSubmit,
  children,
}: {
  onClose: () => void;
  title: string;
  description: string;
  submit: string;
  busy: boolean;
  disabled: boolean;
  onSubmit: () => void;
  children: ReactNode;
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm [&_input]:text-base [&_input]:sm:text-sm">
        <form
          className="grid gap-4"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            onSubmit();
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          {children}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={busy} disabled={disabled}>
              {submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function NameDialog({ onClose, name }: { onClose: () => void; name: string }) {
  const [value, setValue] = useState(name);
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    const r = await updateDisplayName(value);
    setBusy(false);
    if ("error" in r) return void toast.error(r.error);
    await accountStore.refresh();
    toast.success("Name saved");
    onClose();
  }
  return (
    <FormDialog
      onClose={onClose}
      title="Display name"
      description="Shown to people you edit with and in comments. Leave empty to show your email address."
      submit="Save"
      busy={busy}
      disabled={value.trim() === name}
      onSubmit={save}
    >
      <Label htmlFor="account-name" className="sr-only">
        Display name
      </Label>
      <Input
        id="account-name"
        value={value}
        maxLength={60}
        autoFocus
        onChange={(e) => setValue(e.target.value)}
      />
    </FormDialog>
  );
}

function EmailDialog({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [current, setCurrent] = useState("");
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    const r = await requestEmailChange(email, current);
    setBusy(false);
    if ("error" in r) return void toast.error(r.error);
    toast.success("Check your new inbox", {
      description: `We sent a link to ${r.to}. Your address changes when you open it.`,
    });
    onClose();
  }
  return (
    <FormDialog
      onClose={onClose}
      title="Change email"
      description="We email a link to the new address. Until you open it, your account keeps its current one."
      submit="Send link"
      busy={busy}
      disabled={!email.includes("@") || !current}
      onSubmit={save}
    >
      <Label htmlFor="account-email" className="sr-only">
        New email address
      </Label>
      <Input
        id="account-email"
        type="email"
        autoComplete="email"
        placeholder="New email address"
        autoFocus
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <Label htmlFor="account-email-password" className="sr-only">
        Current password
      </Label>
      <Input
        id="account-email-password"
        type="password"
        autoComplete="current-password"
        placeholder="Current password"
        value={current}
        onChange={(e) => setCurrent(e.target.value)}
      />
    </FormDialog>
  );
}

function PasswordDialog({ onClose, hasPassword }: { onClose: () => void; hasPassword: boolean }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    const r = await changePassword(next, hasPassword ? current : undefined);
    setBusy(false);
    if ("error" in r) return void toast.error(r.error);
    await accountStore.refresh();
    toast.success(hasPassword ? "Password changed" : "Password set", {
      description: "Your other devices were signed out.",
    });
    onClose();
  }
  return (
    <FormDialog
      onClose={onClose}
      title={hasPassword ? "Change password" : "Set a password"}
      description={
        hasPassword
          ? "Your other devices are signed out when it changes."
          : "A password lets you sign in with your email as well as GitHub or Google."
      }
      submit={hasPassword ? "Change password" : "Set password"}
      busy={busy}
      disabled={next.length < 10 || (hasPassword && !current)}
      onSubmit={save}
    >
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
            autoFocus
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
    </FormDialog>
  );
}
