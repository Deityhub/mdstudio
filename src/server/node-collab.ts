// Live editing on a self-hosted server. Imported only on Node: the Workers build swaps in
// node-collab.stub.ts, so Yjs stays out of the app Worker (it runs in the Durable Object instead).
export {
  nodeCollab,
  type NodeCollabHost,
  type NodeConnection,
  type NodeHooks,
} from "./collab/node-host";
