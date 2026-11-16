// The editor choices kept on this device. Studio reads the same keys when it loads.
import { type Profile, parseProfile } from "@/lib/markdown/profiles";

type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;
export type Prefs = { profile: Profile; normalize: boolean };

export const loadPrefs = (storage: Storage = localStorage): Prefs => ({
  profile: parseProfile(storage.getItem("md:profile")) ?? "gfm-extended",
  normalize: storage.getItem("md:normalize") === "1",
});

export function savePrefs(prefs: Prefs, storage: Storage = localStorage) {
  storage.setItem("md:profile", prefs.profile);
  storage.setItem("md:normalize", prefs.normalize ? "1" : "0");
}
