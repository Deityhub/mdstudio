import { useEffect } from "react";
import { toast } from "sonner";
import { authMessage } from "@/lib/account/client";

const GITHUB_ERRORS: Record<string, string> = {
  github_unavailable: "Publishing to GitHub isn't set up on this server.",
  signed_out: "Sign in first, then connect GitHub.",
  email_unverified: "Confirm your email address before connecting GitHub.",
  too_many: "Too many attempts. Try again a little later.",
  github_denied: "GitHub access wasn't allowed, so nothing was connected.",
  github_scope: "GitHub didn't allow access to repositories, so nothing was connected.",
  github_failed: "Couldn't connect GitHub. Try again.",
};

/**
 * Messages that come back in the address after leaving the app: a failed GitHub sign-in or a bad
 * confirmation link (`?auth_error=`), a confirmed email (`?verified=1`), and the result of
 * connecting GitHub to publish (`?github=connected` or `?github_error=`). Read once, from the root,
 * because the editor's own redirect would drop them.
 */
export function AuthNotices() {
  useEffect(() => {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("auth_error");
    if (code) toast.error(authMessage(code));
    if (url.searchParams.get("verified"))
      toast.success("Email confirmed", { description: "You can now store drafts in your cloud." });
    if (url.searchParams.get("email_changed"))
      toast.success("Email changed", { description: "Sign in with the new address from now on." });
    const linked = url.searchParams.get("linked");
    if (linked === "github" || linked === "google")
      toast.success(`${linked === "github" ? "GitHub" : "Google"} linked`, {
        description: "You can sign in with it from now on.",
      });
    const github = url.searchParams.get("github_error");
    if (github) toast.error(GITHUB_ERRORS[github] ?? GITHUB_ERRORS["github_failed"]!);
    if (url.searchParams.get("github") === "connected") toast.success("GitHub connected");
    const names = ["auth_error", "verified", "email_changed", "linked", "github_error", "github"];
    if (names.some((n) => url.searchParams.has(n))) {
      for (const n of names) url.searchParams.delete(n);
      window.history.replaceState(null, "", url);
    }
  }, []);
  return null;
}
