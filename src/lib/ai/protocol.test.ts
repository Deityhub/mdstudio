import { describe, expect, it } from "vitest";
import { MAX_CLOUD_INTEGRATIONS, integrationSchema } from "./protocol";

const ok = {
  id: "abc123xyz",
  name: "Work",
  provider: "openai",
  baseUrl: "https://api.openai.com/v1",
  models: ["gpt-5"],
  updatedAt: 1,
};

describe("an integration as the cloud stores it", () => {
  it("accepts a well-formed one", () => {
    expect(integrationSchema.parse(ok)).toEqual(ok);
    expect(MAX_CLOUD_INTEGRATIONS).toBeGreaterThan(1);
  });
  it("never carries a key, even if one is sent", () => {
    expect(integrationSchema.parse({ ...ok, apiKey: "secret" })).not.toHaveProperty("apiKey");
  });
  it("rejects odd ids, unknown providers, insecure endpoints and oversized lists", () => {
    expect(integrationSchema.safeParse({ ...ok, id: "../x" }).success).toBe(false);
    expect(integrationSchema.safeParse({ ...ok, provider: "nope" }).success).toBe(false);
    expect(integrationSchema.safeParse({ ...ok, baseUrl: "http://ai.example/v1" }).success).toBe(
      false,
    );
    expect(
      integrationSchema.safeParse({ ...ok, baseUrl: "https://u:p@ai.example/v1" }).success,
    ).toBe(false);
    expect(integrationSchema.safeParse({ ...ok, name: "x".repeat(61) }).success).toBe(false);
    expect(
      integrationSchema.safeParse({ ...ok, models: Array.from({ length: 101 }, (_, i) => `m${i}`) })
        .success,
    ).toBe(false);
  });
  it("allows a local Ollama endpoint", () => {
    expect(
      integrationSchema.safeParse({
        ...ok,
        provider: "ollama",
        baseUrl: "http://localhost:11434/v1",
      }).success,
    ).toBe(true);
  });
});
