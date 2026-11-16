// The guide catalogue: metadata only, so lists, the sitemap and structured data can use it without
// loading the Markdown engine. The article text lives in content/guides/<slug>.md and is rendered
// with mdstudio's own pipeline.

import catalogue from "virtual:guide-catalogue";
import type { GuideMeta } from "../../../infra/guide-catalogue";

/**
 * A guide: what its own front matter says (slug, title of at most 60 characters, a description of
 * 110 to 160, the order in the lists, and when it first went out and last changed as UTC moments,
 * 2026-11-02T09:00:00Z). Adding a guide is adding its file.
 */
export type Guide = GuideMeta;

export const GUIDES: Guide[] = catalogue;

export const guidePath = (slug: string) => `/guides/${slug}`;

export const guideBySlug = (slug: string) => GUIDES.find((g) => g.slug === slug);

/** About 200 words a minute, never less than a minute. */
export const readingMinutes = (md: string) =>
  Math.max(1, Math.ceil(md.split(/\s+/).filter(Boolean).length / 200));
