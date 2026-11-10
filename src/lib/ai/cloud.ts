import { useEffect } from "react";
import { toast } from "sonner";
import { accountStore, cloudReady, useAccount } from "@/lib/account/store";
import { AuthExpiredError, HttpError, UnverifiedError, call } from "@/lib/sync/api";
import { ai, type Integration, type Remote } from "./integrations";
import { integrationSchema } from "./protocol";

const url = (id: string) => `/api/ai/integrations/${encodeURIComponent(id)}`;

/** The account's AI integrations over the API. Only the setup travels, never an API key. */
export const aiCloud: Remote = {
  async list() {
    const { integrations } = await call<{ integrations: unknown[] }>("/api/ai/integrations");
    return integrations.flatMap((i): Integration[] => {
      const parsed = integrationSchema.safeParse(i);
      return parsed.success ? [parsed.data] : [];
    });
  },
  put: (item) =>
    call(url(item.id), {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(item),
    }),
  async remove(id) {
    try {
      await call(url(id), { method: "DELETE" });
    } catch (error) {
      // already gone is what was wanted
      if (!(error instanceof HttpError && error.status === 404)) throw error;
    }
  },
};

function report(error: unknown) {
  if (error instanceof AuthExpiredError || error instanceof UnverifiedError)
    void accountStore.refresh();
  else toast.error("Couldn't save to your account", { id: "ai-cloud-save" });
}

/**
 * For whatever shows the integrations: while the account may use the cloud, switch the list to the
 * account's. It reads the list when something asks for it, not in the background, and tries again
 * the next time if it could not.
 */
export function useAiCloud(active = true) {
  const account = useAccount();
  const on = active && cloudReady(account) && !!account.user;
  useEffect(() => {
    if (!on || ai.get().cloud !== "off") return;
    ai.joinCloud(aiCloud, report).catch((error) => {
      if (error instanceof AuthExpiredError || error instanceof UnverifiedError)
        void accountStore.refresh();
      else
        toast.error("Couldn't load your AI integrations from your account", {
          id: "ai-cloud-load",
        });
    });
  }, [on, account.user?.id]);
}

/**
 * Mounted once at the root: when the account goes away or changes, its integrations and the keys
 * typed for them are forgotten, so the next person on this browser sees only this browser's own.
 */
export function useAiCloudSession() {
  const account = useAccount();
  const id = cloudReady(account) ? account.user?.id : undefined;
  useEffect(() => {
    if (!id) return;
    return () => ai.leaveCloud();
  }, [id]);
}
