/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "true" in pull request preview builds (set in vite.config.ts). */
  readonly VITE_PREVIEW?: string;
}
