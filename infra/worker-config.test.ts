// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { OBSERVABILITY, isPreview, previewWorkerName, workerConfig } from "./worker-config";

describe("workerConfig", () => {
  it("production claims the custom domain", () => {
    expect(workerConfig({})).toEqual({
      name: "mdstudio",
      routes: [{ pattern: "mdstudio.deityhub.com", custom_domain: true }],
      observability: OBSERVABILITY,
    });
  });

  it("a preview gets its own name on workers.dev and never touches the production domain", () => {
    const config = workerConfig({ PREVIEW_WORKER_NAME: "mdstudio-pr-12" });
    expect(config).toEqual({
      name: "mdstudio-pr-12",
      workers_dev: true,
      observability: OBSERVABILITY,
    });
    expect(config).not.toHaveProperty("routes");
  });

  it("refuses preview names that could overwrite another Worker", () => {
    for (const bad of [
      "mdstudio",
      "mdstudio-pr-",
      "mdstudio-pr-x",
      "other-pr-1",
      "mdstudio-pr-1/../x",
    ])
      expect(() => workerConfig({ PREVIEW_WORKER_NAME: bad }), bad).toThrow(/PREVIEW_WORKER_NAME/);
  });

  it("binds D1 as DB only when a database id is given, with a database per tier", () => {
    expect(workerConfig({})).not.toHaveProperty("d1_databases");
    const bind = (config: ReturnType<typeof workerConfig>) =>
      "d1_databases" in config ? config.d1_databases : undefined;
    expect(bind(workerConfig({ D1_DATABASE_ID: "prod-id" }))).toEqual([
      expect.objectContaining({ binding: "DB", database_name: "mdstudio", database_id: "prod-id" }),
    ]);
    expect(
      bind(workerConfig({ PREVIEW_WORKER_NAME: "mdstudio-pr-1", D1_DATABASE_ID: "prev-id" })),
    ).toEqual([
      expect.objectContaining({ database_name: "mdstudio-preview", database_id: "prev-id" }),
    ]);
  });

  it("binds an R2 bucket as IMAGES only when one is named", () => {
    expect(workerConfig({})).not.toHaveProperty("r2_buckets");
    expect(workerConfig({ R2_BUCKET: "mdstudio-assets" })).toMatchObject({
      r2_buckets: [{ binding: "IMAGES", bucket_name: "mdstudio-assets" }],
    });
    // a preview names its own bucket, so it never writes into production's
    expect(
      workerConfig({ PREVIEW_WORKER_NAME: "mdstudio-pr-4", R2_BUCKET: "mdstudio-preview-assets" }),
    ).toMatchObject({ r2_buckets: [{ bucket_name: "mdstudio-preview-assets" }] });
  });

  it("binds the real-time hub, by script name, only when one is named", () => {
    expect(workerConfig({})).not.toHaveProperty("durable_objects");
    const bound = (env: Record<string, string>) => workerConfig(env);
    expect(bound({ REALTIME_SCRIPT: "mdstudio-realtime" })).toMatchObject({
      durable_objects: {
        bindings: [
          { name: "REALTIME", class_name: "RealtimeHub", script_name: "mdstudio-realtime" },
        ],
      },
    });
    // previews share one hub of their own, so they never touch production's
    expect(
      bound({ PREVIEW_WORKER_NAME: "mdstudio-pr-3", REALTIME_SCRIPT: "mdstudio-realtime-preview" }),
    ).toMatchObject({
      durable_objects: { bindings: [{ script_name: "mdstudio-realtime-preview" }] },
    });
  });

  it("only binds a Worker name that looks like one of ours", () => {
    for (const bad of ["other", "mdstudio-realtime/../x", "mdstudio-realtime-x y", "mdstudio"])
      expect(() => workerConfig({ REALTIME_SCRIPT: bad }), bad).toThrow(/REALTIME_SCRIPT/);
  });

  it("treats an empty name as production", () =>
    expect(workerConfig({ PREVIEW_WORKER_NAME: "" })).toHaveProperty("routes"));
});

describe("observability", () => {
  it("is on for the app Worker in production and in previews: logs, and sampled traces", () => {
    expect(workerConfig({})).toMatchObject({ observability: OBSERVABILITY });
    expect(workerConfig({ PREVIEW_WORKER_NAME: "mdstudio-pr-2" })).toMatchObject({
      observability: OBSERVABILITY,
    });
  });

  it("keeps every log but only a sample of traces", () => {
    expect(OBSERVABILITY).toEqual({
      enabled: true,
      head_sampling_rate: 1,
      traces: { enabled: true, head_sampling_rate: 0.05 },
    });
  });

  it("is the same for the real-time Worker, whose config is a file of its own", () => {
    // a JSONC file: comments on lines of their own, and trailing commas
    const text = readFileSync("infra/realtime/wrangler.jsonc", "utf8")
      .replace(/^\s*\/\/.*$/gm, "")
      .replace(/,(\s*[}\]])/g, "$1");
    expect(JSON.parse(text).observability).toEqual(OBSERVABILITY);
  });
});

describe("the TOML blueprint", () => {
  it("has the same observability, so anyone deploying from it gets logs and traces too", () => {
    const toml = readFileSync("infra/wrangler.toml", "utf8");
    const block = (header: string) => toml.split(header)[1]?.split(/\n\[/)[0] ?? "";
    expect(block("[observability]\n")).toMatch(/enabled = true/);
    expect(block("[observability]\n")).toMatch(/head_sampling_rate = 1\b/);
    expect(block("[observability.traces]\n")).toMatch(/enabled = true/);
    expect(block("[observability.traces]\n")).toMatch(/head_sampling_rate = 0\.05/);
  });
});

describe("previews", () => {
  it("detects a preview build", () => {
    expect(isPreview({ PREVIEW_WORKER_NAME: "mdstudio-pr-3" })).toBe(true);
    expect(isPreview({})).toBe(false);
  });
  it("names the Worker after the pull request number", () =>
    expect(previewWorkerName(42)).toBe("mdstudio-pr-42"));
});
