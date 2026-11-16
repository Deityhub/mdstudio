import { Link, createFileRoute } from "@tanstack/react-router";
import { Eye, EyeOff } from "lucide-react";
import { useEffect, useState } from "react";

import { Standalone, StandaloneBox } from "@/components/site/Standalone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { submitPasswordReset } from "@/lib/account/client";
import { pageHead } from "@/lib/site/seo";

export const Route = createFileRoute("/reset-password")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search["token"] === "string" ? search["token"] : "",
  }),
  head: () =>
    pageHead({
      title: "Reset your password | mdstudio",
      description: "Choose a new password for your mdstudio account.",
      path: "/reset-password",
      noindex: true,
    }),
  component: ResetPassword,
});

function ResetPassword() {
  const { token } = Route.useSearch();
  const [password, setPassword] = useState("");
  const [reveal, setReveal] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  // The link's token is secret: keep it in memory and take it out of the address bar and history.
  useEffect(() => {
    if (token) window.history.replaceState(null, "", "/reset-password");
  }, [token]);
  const [held] = useState(token);

  async function submit() {
    setBusy(true);
    setError("");
    const result = await submitPasswordReset(held, password);
    setBusy(false);
    if ("error" in result) return setError(result.error);
    setDone(true);
  }

  return (
    <Standalone>
      <StandaloneBox>
        {done ? (
          <div className="space-y-4">
            <h1 className="font-display text-[22px] font-semibold">Password changed</h1>
            <p role="status" className="text-sm text-muted-foreground">
              Every device was signed out. Sign in with your new password.
            </p>
            <Button asChild>
              <Link to="/editor">Open the editor</Link>
            </Button>
          </div>
        ) : !held ? (
          <div className="space-y-4">
            <h1 className="font-display text-[22px] font-semibold">This link doesn't work</h1>
            <p className="text-sm text-muted-foreground">
              It's missing its code. Open the link from the email again, or ask for a new one from
              the sign-in dialog.
            </p>
            <Button asChild variant="outline">
              <Link to="/editor">Back to the editor</Link>
            </Button>
          </div>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <h1 className="font-display text-[22px] font-semibold">Choose a new password</h1>
            <div className="grid gap-1.5">
              <Label htmlFor="new-password">New password</Label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={reveal ? "text" : "password"}
                  autoComplete="new-password"
                  minLength={10}
                  maxLength={200}
                  className="pr-10"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
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
              <span className="text-xs text-muted-foreground">
                At least 10 characters. Every device will be signed out.
              </span>
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" size="lg" className="w-full" loading={busy}>
              Change password
            </Button>
          </form>
        )}
      </StandaloneBox>
    </Standalone>
  );
}
