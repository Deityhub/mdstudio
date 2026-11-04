// Lets any part of the studio (a library menu, say) ask for the "confirm your email" dialog, which
// the account menu owns. A counter, so asking twice in a row opens it twice.
import { useSyncExternalStore } from "react";

let asked = 0;
const listeners = new Set<() => void>();

export const askToConfirmEmail = () => {
  asked++;
  for (const l of listeners) l();
};

export const useConfirmEmailAsked = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
    () => asked,
    () => 0,
  );
