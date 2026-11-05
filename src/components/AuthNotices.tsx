import { useEffect } from "react";
import { toast } from "sonner";
import { authMessage } from "@/lib/account/client";

/**
 * Messages that come back in the address after leaving the app: a failed GitHub sign-in or a bad
 * confirmation link (`?auth_error=`), and a confirmed email (`?verified=1`). Read once, from the
 * root, because the editor's own redirect would drop them.
 */
export function AuthNotices() {
  useEffect(() => {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("auth_error");
    if (code) toast.error(authMessage(code));
    if (url.searchParams.get("verified"))
      toast.success("Email confirmed", { description: "You can now store drafts in your cloud." });
    if (code || url.searchParams.has("verified")) {
      url.searchParams.delete("auth_error");
      url.searchParams.delete("verified");
      window.history.replaceState(null, "", url);
    }
  }, []);
  return null;
}
