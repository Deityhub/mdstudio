import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Turnstile } from "@/components/studio/Turnstile";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type AccountUser, requestVerification, signIn } from "@/lib/account/client";
import { accountStore, useAccount } from "@/lib/account/store";

/**
 * A small sign-in for someone who came to read (and maybe comment on) a shared copy. It signs in
 * or creates an account, then leaves them on the page; the editor and its cloud are not involved.
 */
export function ReaderSignIn({
  open,
  onOpenChange,
  onSignedIn,
  reason,
  confirmFor = "comment",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSignedIn: (user: AccountUser) => void;
  /** Why they are being asked, shown under the title. */
  reason: string;
  /** What an unconfirmed address cannot do yet, for the notice that asks them to confirm it. */
  confirmFor?: string;
}) {
  const account = useAccount();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [captcha, setCaptcha] = useState("");
  const [captchaRun, setCaptchaRun] = useState(0);

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
      setCaptchaRun((n) => n + 1); // a used token is not good twice
      return setError(result.error);
    }
    accountStore.set((a) => ({ ...a, user: result.user }));
    onOpenChange(false);
    if (!result.user.emailVerified && account.email) {
      // commenting needs a confirmed address; the link comes by email and the page stays as it is
      void requestVerification();
      toast.info(`Confirm your email to ${confirmFor}`, {
        description: "We sent you a link. Open it, then come back to this page.",
      });
    } else toast.success(mode === "signup" ? "Account created" : "Signed in");
    onSignedIn(result.user);
  }

  const needsCaptcha = mode === "signup" && !!account.turnstile;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Sign in to continue</DialogTitle>
          <DialogDescription>{reason}</DialogDescription>
        </DialogHeader>
        <Tabs value={mode} onValueChange={(v) => setMode(v as "login" | "signup")}>
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
            <Label htmlFor="reader-email">Email</Label>
            <Input id="reader-email" name="email" type="email" autoComplete="email" required />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="reader-password">Password</Label>
            <div className="relative">
              <Input
                id="reader-password"
                name="password"
                type={reveal ? "text" : "password"}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                minLength={mode === "signup" ? 10 : undefined}
                required
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0"
                aria-label={reveal ? "Hide password" : "Show password"}
                aria-pressed={reveal}
                onClick={() => setReveal((v) => !v)}
              >
                {reveal ? <EyeOff /> : <Eye />}
              </Button>
            </div>
            {mode === "signup" && (
              <p className="text-xs text-muted-foreground">At least 10 characters.</p>
            )}
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {needsCaptcha && (
            <Turnstile key={captchaRun} siteKey={account.turnstile!} onToken={setCaptcha} />
          )}
          <Button type="submit" loading={busy} disabled={needsCaptcha && !captcha}>
            {mode === "login" ? "Sign in" : "Create account"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
