import { readFile, writeFile } from "node:fs/promises";

// metadata-gen 0.2.2 uses a lettermark for SVG even when faviconSrc is a logo.
// Keep the SVG consistent with its generated PNG/ICO set and legible in both themes.
const root = new URL("../public/metadata/", import.meta.url);
const mark = await readFile(new URL("mark.svg", root), "utf8");
const favicon = mark.replace(
  '<path fill="#171717"',
  '<style>:root { --fg: #171717; } @media (prefers-color-scheme: dark) { :root { --fg: #fafafa; } }</style><path transform="translate(4 4) scale(.8)" fill="var(--fg)"',
);
await writeFile(new URL("favicon.svg", root), favicon);
