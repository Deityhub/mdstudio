// The privacy policy and the terms of service. Their text is in content/legal/*.md; this is the
// part the pages, the sitemap and the footer share.
export type LegalPage = {
  slug: "privacy" | "terms";
  title: string;
  description: string;
  updated: string;
};

export const LEGAL_PAGES: LegalPage[] = [
  {
    slug: "privacy",
    title: "Privacy Policy",
    description:
      "What mdstudio stores and shares: nothing without an account, and only what each feature needs with one. No ads, no analytics.",
    updated: "2026-11-11",
  },
  {
    slug: "terms",
    title: "Terms of Service",
    description:
      "The rules for using the hosted mdstudio: your content, acceptable use, limits and the service's lack of guarantees.",
    updated: "2026-11-11",
  },
];

export const legalPath = (slug: LegalPage["slug"]) => `/${slug}`;
export const legalBySlug = (slug: string) => LEGAL_PAGES.find((p) => p.slug === slug);
