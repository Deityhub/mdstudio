// The site's fixed facts. Plain data with no build-time imports, so tests outside the build can
// read it too; seo.ts re-exports it.
import { BRAND } from "./seo-content";

export const SITE = {
  url: "https://mdstudio.deityhub.com",
  name: BRAND.name,
  alternateName: BRAND.alternateName,
  tagline: BRAND.tagline,
  description: BRAND.description,
  author: "Chizoba Jude Ojini",
  authorUrl: "https://judeojini.com",
  /** Where privacy requests, account deletion and abuse reports go (see the legal pages). */
  contactEmail: "contact@deityhub.com",
  repo: "https://github.com/Deityhub/mdstudio",
  image: "/og.png",
  imageAlt: BRAND.imageAlt,
} as const;
