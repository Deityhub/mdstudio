// Self-hosted image storage: files under `<DATA_DIR>/uploads`. Vite aliases this module to
// node-storage.stub.ts for the Workers build, which keeps node:fs out of the Worker bundle.
import { join } from "node:path";
import { createDiskStore } from "../../infra/storage/disk";

export const createStore = (dataDir: string) => createDiskStore(join(dataDir, "uploads"));
