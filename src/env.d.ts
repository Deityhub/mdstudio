/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "true" in pull request preview builds (set in vite.config.ts). */
  readonly VITE_PREVIEW?: string;
  /** The release version (package.json), used to version the service worker. */
  readonly VITE_APP_VERSION?: string;
}

/** Each guide's front matter, in list order (see infra/guide-catalogue-plugin.ts). */
declare module "virtual:guide-catalogue" {
  const guides: import("../infra/guide-catalogue").GuideMeta[];
  export default guides;
}
