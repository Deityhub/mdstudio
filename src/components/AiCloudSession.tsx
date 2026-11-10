import { useAiCloudSession } from "@/lib/ai/cloud";

/** Forgets an account's AI integrations and keys when it signs out (see `useAiCloudSession`). */
export function AiCloudSession() {
  useAiCloudSession();
  return null;
}
