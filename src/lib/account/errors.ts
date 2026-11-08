import { AuthExpiredError, UnverifiedError } from "@/lib/sync/api";
import { accountStore } from "./store";
import { askToConfirmEmail } from "./verify-prompt";

/**
 * What every cloud action does when the account is the problem: an unconfirmed email asks for the
 * confirmation, an ended session refreshes who is signed in. Both close the dialog (`close`) that
 * was making the request. Returns true when it was one of those, so the caller has nothing to show.
 */
export function handleAccountError(error: unknown, close: () => void) {
  if (error instanceof UnverifiedError) {
    close();
    askToConfirmEmail();
    return true;
  }
  if (error instanceof AuthExpiredError) {
    close();
    void accountStore.refresh();
    return true;
  }
  return false;
}
