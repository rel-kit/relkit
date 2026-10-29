/** Configures the documentation shell; the custom homepage owns its existing React layout. */
import { defineConfig } from "blume";
import { node } from "blume/deploy";
import { Schema } from "effect";
import { blogCategories, blogIllustrations } from "./components/blog/posts.js";
import redirects from "./redirects.json";
import { documentationSidebar } from "./scripts/generate-navigation.js";

const sans = { name: "Geist", variants: [{ src: "./public/fonts/geist-latin.woff2" }] };
const mono = { name: "Geist Mono", variants: [{ src: "./public/fonts/geist-mono-latin.woff2" }] };

export default defineConfig({
  title: "RELKIT",
  logo: "/logo.svg",
  agents: {
    llmsTxt: true,
  },
  description:
    "Build TypeScript backends with guided examples, module documentation, and API reference.",
  content: {
    root: "content",
    exclude: ["generated/**"],
    types: {
      // `featured` leads /blog, `category` drives its tabs, `illustration` picks the line art.
      blog: {
        facets: ["category"],
        frontmatter: {
          featured: Schema.toStandardSchemaV1(Schema.UndefinedOr(Schema.Boolean)),
          category: Schema.toStandardSchemaV1(
            Schema.Literals(Object.keys(blogCategories) as [keyof typeof blogCategories]),
          ),
          illustration: Schema.toStandardSchemaV1(
            Schema.UndefinedOr(Schema.Literals(blogIllustrations)),
          ),
        },
      },
    },
  },
  // Backend-dependent source snippets must not become standalone live previews.
  examples: "examples/**/*.preview.*",
  github: { owner: "rel-kit", repo: "relkit", dir: "apps/docs" },
  react: { compiler: false },
  theme: {
    accent: { light: "#111216", dark: "#f7f7f8" },
    background: { light: "#fafafa", dark: "#0d0e10" },
    mode: "system",
    fonts: { display: sans, body: sans, mono },
  },
  navigation: {
    // The root tab owns every group the other tabs do not: Learn, Core concepts and Modules.
    tabs: [
      { label: "Docs", path: "/", href: "/docs" },
      { label: "Guides", path: "/guides" },
      { label: "Reference", path: "/docs/api" },
      { label: "Blog", path: "/blog" },
    ],
    actions: [{ label: "GitHub", href: "https://github.com/rel-kit/relkit" }],
    sidebar: { display: "flat", items: documentationSidebar },
  },
  search: {
    indexing: { includeCodeBlocks: true },
    popular: [
      { label: "Create and run an API", href: "/docs/learn/create-an-app" },
      { label: "Buckets", href: "/docs/modules/storage" },
      { label: "Upload product images", href: "/guides/storage/upload-product-images" },
    ],
  },
  feedback: false,
  redirects: redirects.map(({ from, to }) => ({ from, to, status: 301 })),
  deployment: node({ site: "https://relkit.up.railway.app" }),
});
