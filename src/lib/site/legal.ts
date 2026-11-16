// The privacy policy and the terms of service. Their text, and what they say about themselves (title,
// description, order and dates), are in content/legal/*.md; this is the part the pages, the sitemap
// and the footer share.
import catalogue from "virtual:legal-catalogue";
import type { LegalMeta } from "../../../infra/legal-catalogue";

export type LegalPage = LegalMeta;

export const LEGAL_PAGES: LegalPage[] = catalogue;

export const legalPath = (slug: LegalPage["slug"]) => `/${slug}`;
export const legalBySlug = (slug: string) => LEGAL_PAGES.find((p) => p.slug === slug);
