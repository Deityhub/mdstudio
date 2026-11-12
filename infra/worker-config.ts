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

// Hosted images: the bucket is named by the build, one for production and one shared by previews.
const r2 = (env: Env) =>
  env["R2_BUCKET"] ? { r2_buckets: [{ binding: "IMAGES", bucket_name: env["R2_BUCKET"] }] } : {};

// The real-time hub is a Durable Object in its own Worker (infra/realtime); the app binds to it by
// that Worker's name, one for production and one shared by previews.
const REALTIME_SCRIPT = /^mdstudio-realtime(-preview)?$/;
const realtime = (env: Env) => {
  const script = env["REALTIME_SCRIPT"];
  if (!script) return {};
  if (!REALTIME_SCRIPT.test(script))
    throw new Error(
      `REALTIME_SCRIPT must be mdstudio-realtime or mdstudio-realtime-preview, got "${script}"`,
    );
  return {
    durable_objects: {
      bindings: [{ name: "REALTIME", class_name: "RealtimeHub", script_name: script }],
    },
  };
};

/**
 * Logs and traces, per Worker (a Worker without this block writes none). Every log is kept, so an
 * error is never sampled away; traces are sampled to stay inside the free allowance. The real-time
 * Worker's own config (infra/realtime/wrangler.jsonc) carries the same block, and a test keeps them equal.
 */
export const OBSERVABILITY = {
  enabled: true,
  head_sampling_rate: 1,
  traces: { enabled: true, head_sampling_rate: 0.05 },
};

export function workerConfig(env: Env) {
  const preview = env["PREVIEW_WORKER_NAME"];
  if (!preview) {
    return {
      name: "mdstudio",
      routes: [{ pattern: "mdstudio.deityhub.com", custom_domain: true }],
      ...d1(env, "mdstudio"),
      ...r2(env),
      ...realtime(env),
      observability: OBSERVABILITY,
    };
  }
  if (!PREVIEW_NAME.test(preview))
    throw new Error(`PREVIEW_WORKER_NAME must look like mdstudio-pr-<number>, got "${preview}"`);
  return {
    name: preview,
    workers_dev: true,
    ...d1(env, "mdstudio-preview"),
    ...r2(env),
    ...realtime(env),
    observability: OBSERVABILITY,
  };
}
