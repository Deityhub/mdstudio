import { useNavigate } from "@tanstack/react-router";
import {
  Cloud,
  Eye,
  EyeOff,
  Github,
  ImageIcon,
  LogOut,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Avatar } from "@/components/ui/avatar";
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
import { accountStore, cloudReady, useAccount } from "@/lib/account/store";
import { useConfirmEmailAsked } from "@/lib/account/verify-prompt";
import { documentStore } from "@/lib/storage/documentStore";
import { completeSignOut, prepareSignOut } from "@/lib/sync/hooks";
import { ChooseCloudDrafts, SignOutDialog, type SignOutPrompt, VerifyEmail } from "./CloudDialogs";
import { ManageImages } from "./ManageImages";
import { ForgotPassword } from "./ForgotPassword";
import { Turnstile } from "./Turnstile";

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
  const [manageImages, setManageImages] = useState(false);
  const [prompt, setPrompt] = useState<SignOutPrompt | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [captcha, setCaptcha] = useState("");
  const [captchaRun, setCaptchaRun] = useState(0);
  const asked = useConfirmEmailAsked();
  useEffect(() => {
    if (asked > 0) setVerifying(true);
  }, [asked]);

  useEffect(() => {
    void accountStore.refresh();
  }, []);

  async function submit(form: HTMLFormElement) {
    const data = new FormData(form);
    setBusy(true);
    setError("");
    const result = await signIn(
      mode,
      String(data.get("email")),
      String(data.get("password")),
      mode === "signup" ? captcha : undefined,
    );
    setBusy(false);
    if ("error" in result) {
      setCaptcha("");
      setCaptchaRun((n) => n + 1); // a used token is not good twice: ask for a new one
      return setError(result.error);
    }
    accountStore.set((a) => ({ ...a, user: result.user }));
    setOpen(false);
    toast.success(mode === "signup" ? "Account created" : "Signed in");
    // Nothing is uploaded unless chosen; an unconfirmed address is asked to confirm on first use.
    if (!cloudReady({ ...account, user: result.user })) return;
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
              <Avatar src={user.avatarUrl} label={label} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel className="font-normal">
              <span className="block text-xs text-muted-foreground">Signed in as</span>
              {user.email}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => (cloudReady(account) ? setPicker(true) : setVerifying(true))}
            >
              <Cloud className="size-4" /> Choose drafts for the cloud…
            </DropdownMenuItem>
            {account.images && (
              <DropdownMenuItem onSelect={() => setManageImages(true)}>
                <ImageIcon className="size-4" /> Manage images…
              </DropdownMenuItem>
            )}
            {user.isAdmin && (
              <DropdownMenuItem
                onSelect={() =>
                  void navigate({ to: "/admin", search: { tab: "overview", user: "" } })
                }
              >
                <ShieldCheck className="size-4" /> Admin dashboard
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={() => void startSignOut()}>
              <LogOut className="size-4" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <ChooseCloudDrafts userId={user.id} open={picker} onOpenChange={setPicker} />
        <ManageImages open={manageImages} onOpenChange={setManageImages} />
        <VerifyEmail open={verifying} onOpenChange={setVerifying} email={user.email} />
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
          setForgot(false);
          setOpen(true);
        }}
      >
        <UserRound className="size-4" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {forgot ? "Reset your password" : mode === "login" ? "Sign in" : "Create an account"}
            </DialogTitle>
            <DialogDescription>
              Optional. Your drafts stay in this browser either way.
            </DialogDescription>
          </DialogHeader>
          {forgot ? (
            <ForgotPassword turnstile={account.turnstile} onBack={() => setForgot(false)} />
          ) : (
            <>
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
                  <Input
                    id="account-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                  />
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
                      {reveal ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </Button>
                  </div>
                  {mode === "signup" && (
                    <span className="text-xs text-muted-foreground">At least 10 characters.</span>
                  )}
                  {mode === "login" && account.email && (
                    <button
                      type="button"
                      className="justify-self-start text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                      onClick={() => {
                        setError("");
                        setForgot(true);
                      }}
                    >
                      Forgot your password?
                    </button>
                  )}
                </div>
                {error && (
                  <p role="alert" className="text-sm text-destructive">
                    {error}
                  </p>
                )}
                {mode === "signup" && account.turnstile && (
                  <Turnstile key={captchaRun} siteKey={account.turnstile} onToken={setCaptcha} />
                )}
                <Button
                  type="submit"
                  loading={busy}
                  disabled={mode === "signup" && !!account.turnstile && !captcha}
                >
                  {mode === "login" ? "Sign in" : "Create account"}
                </Button>
              </form>
              {account.google && (
                <Button variant="outline" asChild>
                  <a href="/api/auth/google">
                    <GoogleLogo /> Continue with Google
                  </a>
                </Button>
              )}
              {account.github && (
                <Button variant="outline" asChild>
                  <a href="/api/auth/github">
                    <Github className="size-4" /> Continue with GitHub
                  </a>
                </Button>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/** lucide has no brand marks; this is Google's "G" in a single colour, so it follows the theme. */
function GoogleLogo() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 fill-current">
      <path d="M21.35 11.1H12v2.98h5.35c-.23 1.4-1.6 4.1-5.35 4.1a5.9 5.9 0 0 1 0-11.8c1.87 0 3.12.8 3.84 1.48l2.6-2.5A9.4 9.4 0 0 0 12 3.2a9.8 9.8 0 1 0 0 19.6c5.65 0 9.4-3.97 9.4-9.57 0-.64-.07-1.13-.15-1.6z" />
    </svg>
  );
}
