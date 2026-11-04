import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestPasswordReset } from "@/lib/account/client";
import { Turnstile } from "./Turnstile";

/** Asks for a reset link. The answer is the same whether or not the address has an account. */
export function ForgotPassword({
  turnstile,
  onBack,
}: {
  turnstile: string | null;
  onBack: () => void;
}) {
  const [sent, setSent] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [captcha, setCaptcha] = useState("");
  const [captchaRun, setCaptchaRun] = useState(0);

  async function submit(form: HTMLFormElement) {
    const email = String(new FormData(form).get("email"));
    setBusy(true);
    setError("");
    const result = await requestPasswordReset(email, captcha || undefined);
    setBusy(false);
    if ("error" in result) {
      setCaptcha("");
      setCaptchaRun((n) => n + 1); // a used token is not good twice
      return setError(result.error);
    }
    setSent(email);
  }

  if (sent)
    return (
      <div className="grid gap-3">
        <p role="status" className="text-sm">
          If an account exists for {sent}, we've sent a link to choose a new password. It works once
          and for an hour.
        </p>
        <Button variant="outline" onClick={onBack}>
          Back to sign in
        </Button>
      </div>
    );

  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        void submit(e.currentTarget);
      }}
    >
      <p className="text-sm text-muted-foreground">
        Enter your email and we'll send a link to choose a new password.
      </p>
      <div className="grid gap-1.5">
        <Label htmlFor="forgot-email">Email</Label>
        <Input id="forgot-email" name="email" type="email" autoComplete="email" required />
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {turnstile && <Turnstile key={captchaRun} siteKey={turnstile} onToken={setCaptcha} />}
      <Button type="submit" disabled={busy || (!!turnstile && !captcha)}>
        Send reset link
      </Button>
      <Button type="button" variant="ghost" onClick={onBack}>
        Back to sign in
      </Button>
    </form>
  );
}
