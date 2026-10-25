# Documentation workspace

Read `CONTRIBUTING.md` before changing documentation. Blume 2.2.5 renders the
documentation; `pages/index.astro` hosts the existing React landing as one island.
Keep landing styles and Motion context separate from documentation layouts.

Author pages in `content/docs/learn`, `content/docs/modules`, and `content/guides`.
API and CLI reference, `meta.ts` navigation, and `content/_snippets` are generated
by `scripts/generate.ts`; change their sources instead of editing generated files.

Use installed Blume documentation in `node_modules/blume/docs` for components,
metadata, includes, and configuration. Keep `redirects.json` direct: an old URL
must reach its final destination in one permanent redirect.

Run focused documentation tests and `bun run check` after content changes. Rendering
or configuration changes also require `bun run build` and browser verification.
Use development port 3001. Do not build into the runtime of a running development
server; stop it first or use Blume's `--isolated` build option.
