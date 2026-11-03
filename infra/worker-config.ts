// Cloudflare Worker settings for the hosted tier, chosen at build time.
//   production: Worker "mdstudio" on the custom domain mdstudio.deityhub.com
//   preview:    one throwaway Worker per pull request on workers.dev (PREVIEW_WORKER_NAME)
// A preview must never carry the production route, or it would take over the real domain.

type Env = Record<string, string | undefined>;

const PREVIEW_NAME = /^mdstudio-pr-\d+$/;

export const previewWorkerName = (pullRequest: number) => `mdstudio-pr-${pullRequest}`;

export const isPreview = (env: Env) => !!env["PREVIEW_WORKER_NAME"];

// Previews share one throwaway database, so a pull request never touches production data.
// migrations_dir is relative to the generated .output/server/wrangler.json.
const d1 = (env: Env, name: string) => {
  const id = env["D1_DATABASE_ID"];
  return id
    ? {
        d1_databases: [
          {
            binding: "DB",
            database_name: name,
            database_id: id,
            migrations_dir: "../../infra/migrations",
          },
        ],
      }
    : {};
};

export function workerConfig(env: Env) {
  const preview = env["PREVIEW_WORKER_NAME"];
  if (!preview) {
    return {
      name: "mdstudio",
      routes: [{ pattern: "mdstudio.deityhub.com", custom_domain: true }],
      ...d1(env, "mdstudio"),
    };
  }
  if (!PREVIEW_NAME.test(preview))
    throw new Error(`PREVIEW_WORKER_NAME must look like mdstudio-pr-<number>, got "${preview}"`);
  return { name: preview, workers_dev: true, ...d1(env, "mdstudio-preview") };
}
