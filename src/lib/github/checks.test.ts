import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "@/lib/checker/config";
import { publishIssues } from "./checks";

const png = "data:image/png;base64,iVBORw0KGgo=";

describe("publishIssues", () => {
  it("reports what GitHub would not render, but not the images that are added beside the file", () => {
    const text = "# T\n\n![mine](images/pic.png)\n\n![gone](images/missing.png)\n";
    const issues = publishIssues(text, { "pic.png": png }, DEFAULT_CONFIG);
    const local = issues.filter((i) => i.rule === "local-image");
    expect(local.map((i) => i.line)).toEqual([5]); // only the one with no image to add
  });

  it("leaves out notes that are only for information", () => {
    expect(
      publishIssues(`![x](${png})`, {}, DEFAULT_CONFIG).some((i) => i.severity === "info"),
    ).toBe(false);
  });
});
