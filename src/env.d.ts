/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "true" in pull request preview builds (set in vite.config.ts). */
  readonly VITE_PREVIEW?: string;
  /** The release version (package.json), used to version the service worker. */
  readonly VITE_APP_VERSION?: string;
}
