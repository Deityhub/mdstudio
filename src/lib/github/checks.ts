import { runChecks } from "@/lib/checker/run";
import type { CheckConfig } from "@/lib/checker/config";
import { pointImagesAt } from "@/lib/storage/archive";

/**
 * What the GitHub profile finds in a draft that is about to be published: problems and warnings,
 * not notes. A local image the draft holds is not a problem, since it is added beside the file.
 */
export function publishIssues(
  content: string,
  images: Record<string, string>,
  config: CheckConfig,
) {
  const lines = content.split(/\r?\n/);
  return runChecks(content, "github", config).issues.filter(
    (i) =>
      i.severity !== "info" &&
      !(i.rule === "local-image" && pointImagesAt(lines[i.line - 1] ?? "", images).used.length > 0),
  );
}
