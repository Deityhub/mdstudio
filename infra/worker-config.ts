// Cloudflare Worker settings for the hosted tier, chosen at build time.
//   production: Worker "mdstudio" on the custom domain mdstudio.deityhub.com
//   preview:    one throwaway Worker per pull request on workers.dev (PREVIEW_WORKER_NAME)
// A preview must never carry the production route, or it would take over the real domain.

type Env = Record<string, string | undefined>;

const PREVIEW_NAME = /^mdstudio-pr-\d+$/;

export const previewWorkerName = (pullRequest: number) => `mdstudio-pr-${pullRequest}`;

export const isPreview = (env: Env) => !!env["PREVIEW_WORKER_NAME"];

export function workerConfig(env: Env) {
  const preview = env["PREVIEW_WORKER_NAME"];
  if (!preview) {
    return {
      name: "mdstudio",
      routes: [{ pattern: "mdstudio.deityhub.com", custom_domain: true }],
    };
  }
  if (!PREVIEW_NAME.test(preview))
    throw new Error(`PREVIEW_WORKER_NAME must look like mdstudio-pr-<number>, got "${preview}"`);
  return { name: preview, workers_dev: true };
}
