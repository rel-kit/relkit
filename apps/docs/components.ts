/** Registers the docs index hero while keeping its authored content in searchable MDX. */
import { defineComponents } from "blume";

export default defineComponents({
  mdx: { DocsHero: "./components/docs-hero.astro" },
});
