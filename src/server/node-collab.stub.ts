// What the Workers build uses in place of node-collab.ts (see vite.config.ts).
import type { CollabHost } from "./collab/host";

export type NodeCollabHost = CollabHost & {
  ensureSeeded(docId: string, load: () => Promise<string>): Promise<void>;
  hooks(connection: unknown): unknown;
};
export function nodeCollab(): NodeCollabHost {
  throw new Error("Live editing on Workers runs in a Durable Object, not in the app.");
}
