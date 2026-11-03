import { useNavigate } from "@tanstack/react-router";
import { Cloud, Eye, EyeOff, Github, LogOut, UserRound } from "lucide-react";
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
import { authMessage, signIn } from "@/lib/account/client";
import { accountStore, useAccount } from "@/lib/account/store";
import { documentStore } from "@/lib/storage/documentStore";
import { completeSignOut, prepareSignOut } from "@/lib/sync/hooks";
import { ChooseCloudDrafts, SignOutDialog, type SignOutPrompt } from "./CloudDialogs";

/** Optional account: signed out is the default and the editor never needs it. */
export function AccountMenu() {
  const account = useAccount();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [picker, setPicker] = useState(false);
  const [prompt, setPrompt] = useState<SignOutPrompt | null>(null);

  useEffect(() => {
    void accountStore.refresh();
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
    accountStore.set((a) => ({ ...a, user: result.user }));
    setOpen(false);
    toast.success(mode === "signup" ? "Account created" : "Signed in");
    // Nothing is uploaded unless chosen: offer the choice when there is something to choose.
    if ((await documentStore.list()).some((d) => d.content.trim())) setPicker(true);
  }

  if (account.user) {
    const user = account.user;
    const label = user.displayName ?? user.email;

    async function finishSignOut(keep: Set<string> | "all") {
      setPrompt(null);
      await completeSignOut(user.id, keep);
      toast.success("Signed out", {
        description: "Cloud drafts were removed from this browser. Local drafts stay.",
      });
      void navigate({ to: "/editor" });
    }

    async function startSignOut() {
      const { synced, check } = await prepareSignOut(user.id);
      // Offline with unsaved changes: removing the drafts here would lose them, so ask first.
      if (!synced && check.unsynced.length)
        return setPrompt({ kind: "offline", count: check.unsynced.length });
      if (check.withImages.length) {
        const titles = await Promise.all(
          check.withImages.map(async (id) => (await documentStore.get(id))?.title ?? id),
        );
        return setPrompt({ kind: "images", titles, ids: check.withImages });
      }
      await finishSignOut(new Set());
    }

    return (
      <>
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
              {user.email}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setPicker(true)}>
              <Cloud className="h-4 w-4" /> Choose drafts for the cloud…
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void startSignOut()}>
              <LogOut className="h-4 w-4" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <ChooseCloudDrafts userId={user.id} open={picker} onOpenChange={setPicker} />
        <SignOutDialog
          prompt={prompt}
          onCancel={() => setPrompt(null)}
          onConfirm={(keep) =>
            void finishSignOut(
              keep === "all"
                ? "all"
                : keep === "images" && prompt?.kind === "images"
                  ? new Set(prompt.ids)
                  : new Set(),
            )
          }
        />
      </>
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
