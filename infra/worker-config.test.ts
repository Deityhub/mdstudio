// @vitest-environment node
import { describe, expect, it } from "vitest";
import { isPreview, previewWorkerName, workerConfig } from "./worker-config";

describe("workerConfig", () => {
  it("production claims the custom domain", () => {
    expect(workerConfig({})).toEqual({
      name: "mdstudio",
      routes: [{ pattern: "mdstudio.deityhub.com", custom_domain: true }],
    });
  });

  it("a preview gets its own name on workers.dev and never touches the production domain", () => {
    const config = workerConfig({ PREVIEW_WORKER_NAME: "mdstudio-pr-12" });
    expect(config).toEqual({ name: "mdstudio-pr-12", workers_dev: true });
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

  it("treats an empty name as production", () =>
    expect(workerConfig({ PREVIEW_WORKER_NAME: "" })).toHaveProperty("routes"));
});

describe("previews", () => {
  it("detects a preview build", () => {
    expect(isPreview({ PREVIEW_WORKER_NAME: "mdstudio-pr-3" })).toBe(true);
    expect(isPreview({})).toBe(false);
  });
  it("names the Worker after the pull request number", () =>
    expect(previewWorkerName(42)).toBe("mdstudio-pr-42"));
});
