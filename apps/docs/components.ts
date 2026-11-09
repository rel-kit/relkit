/** Registers the docs index hero and the Labs badge shown above pages that set `labs: true`. */
import { defineComponents } from "blume";

export default defineComponents({
  mdx: { DocsHero: "./components/docs-hero.astro" },
  layout: { PageHeader: "./components/labs-badge.astro" },
});
