import { Eye, EyeOff, Github, LogOut, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type Account, authMessage, fetchAccount, signIn, signOut } from "@/lib/account/client";

/** Optional account: signed out is the default and the editor never needs it. */
export function AccountMenu() {
  const [account, setAccount] = useState<Account>({ user: null, github: false });
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reveal, setReveal] = useState(false);

  useEffect(() => {
    void fetchAccount().then(setAccount);
    // The GitHub callback sends failures back as /editor?auth_error=<code>.
    const url = new URL(window.location.href);
    const code = url.searchParams.get("auth_error");
    if (code) {
      toast.error(authMessage(code));
      url.searchParams.delete("auth_error");
      window.history.replaceState(null, "", url);
    }
  }, []);

  async function submit(form: HTMLFormElement) {
    const data = new FormData(form);
    setBusy(true);
    setError("");
    const result = await signIn(mode, String(data.get("email")), String(data.get("password")));
    setBusy(false);
    if ("error" in result) return setError(result.error);
    setAccount((a) => ({ ...a, user: result.user }));
    setOpen(false);
    toast.success(mode === "signup" ? "Account created" : "Signed in");
  }

  if (account.user) {
    const label = account.user.displayName ?? account.user.email;
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`Account: ${label}`}>
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-medium uppercase text-primary-foreground">
              {label.charAt(0)}
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel className="font-normal">
            <span className="block text-xs text-muted-foreground">Signed in as</span>
            {account.user.email}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={async () => {
              await signOut();
              setAccount((a) => ({ ...a, user: null }));
              toast.success("Signed out");
            }}
          >
            <LogOut className="h-4 w-4" /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Sign in"
        onClick={() => {
          setError("");
          setReveal(false);
          setOpen(true);
        }}
      >
        <UserRound className="h-4 w-4" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{mode === "login" ? "Sign in" : "Create an account"}</DialogTitle>
            <DialogDescription>
              Optional. Your drafts stay in this browser either way.
            </DialogDescription>
          </DialogHeader>
          <Tabs
            value={mode}
            onValueChange={(v) => {
              setMode(v as "login" | "signup");
              setError("");
            }}
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Sign in</TabsTrigger>
              <TabsTrigger value="signup">Create account</TabsTrigger>
            </TabsList>
          </Tabs>
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void submit(e.currentTarget);
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="account-email">Email</Label>
              <Input id="account-email" name="email" type="email" autoComplete="email" required />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="account-password">Password</Label>
              <div className="relative">
                <Input
                  id="account-password"
                  name="password"
                  type={reveal ? "text" : "password"}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  minLength={mode === "signup" ? 10 : undefined}
                  className="pr-10"
                  required
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute inset-y-0 right-0 h-full w-10 text-muted-foreground"
                  aria-label={reveal ? "Hide password" : "Show password"}
                  aria-pressed={reveal}
                  onClick={() => setReveal((r) => !r)}
                >
                  {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              {mode === "signup" && (
                <span className="text-xs text-muted-foreground">At least 10 characters.</span>
              )}
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" disabled={busy}>
              {mode === "login" ? "Sign in" : "Create account"}
            </Button>
          </form>
          {account.github && (
            <Button variant="outline" asChild>
              <a href="/api/auth/github">
                <Github className="h-4 w-4" /> Continue with GitHub
              </a>
            </Button>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
