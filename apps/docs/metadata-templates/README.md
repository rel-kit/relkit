# RELKIT metadata assets

The current `public/metadata/og.png` is a 1200×630 imagegen edit of the supplied
landing-page screenshot. Its editing prompt is saved in `og-image-prompt.md`.
The metadata-gen layout below is an alternative; selecting it replaces that image.
The favicon set continues to use the original four-square mark.

From `apps/docs`, run `npx metadata-gen@0.2.2 --no-open`. The saved configuration
uses the landing page's four-square mark and light monochrome palette. Choose
**Option 4** (the project-local `layout-d.js`), then download the PNG and favicon set.
Ask before overwriting saved assets.

After generating the favicon set, run `bun run scripts/refine-metadata.ts`.
Version 0.2.2 renders PNG/ICO icons from the logo but always writes a lettermark
SVG. This refinement derives the SVG from the same mark and adds light/dark
contrast. Keep `public/metadata/mark.svg` as the editable source.

The canonical website URL is `https://relkit.dev`; update the config,
layout footer, and Next.js `metadataBase` together if the public domain changes.
