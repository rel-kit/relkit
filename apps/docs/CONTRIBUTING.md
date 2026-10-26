# Writing RELKIT documentation

Blume 2.2.5 has a small Bun patch in `patches/blume@2.2.5.patch` that displays existing search breadcrumbs. Keep it until upstream renders section context; browser tests cover the result.

The `@effect/docgen` 4.0.1 patch adds TSX/MTS/CTS discovery and sorts source paths before
TypeScript inference. Keep it until upstream supports those extensions and deterministic
input order; React references and read-only freshness checks depend on it.

Start with the reader's task and choose the page's purpose:

| Section   | Purpose                                     | Shape                                                                   |
| --------- | ------------------------------------------- | ----------------------------------------------------------------------- |
| Learn     | Build the first Orders application          | Ordered steps, a visible result, and one next step                      |
| Modules   | Understand and configure a capability       | Definition, configuration, operations, limits, and links to tasks       |
| Guides    | Complete a specific task in an existing app | Outcome, prerequisites, numbered steps, verification, and related tasks |
| Reference | Look up an API or command                   | Generated signatures, options, errors, and examples                     |

Write in direct, friendly language. Name the file or terminal before asking the
reader to change or run something. Explain the expected result. Define a new term
beside its first use; introduce the application graph after the first working API.
Avoid “simply,” “just,” and unexplained implementation vocabulary. Application
examples use plain TypeScript and public RELKIT APIs. AI is an optional later path.

Keep configuration in Modules and complete workflows in Guides. A guide may link
to deeper explanations, but it must include the installation, files, configuration,
and commands needed to finish its task. Preserve dependency cohorts and migration
history. Do not imply that scaffolding, installing Inspector, or starting the app
automatically enables a separate tool or applies database migrations.

Modules that require configuration must show a visible **Pre-setup** section before their first
API example. Include installation, the entries to merge into `defineApp` in `relkit.config.ts`,
any `defineEnv` fields and safe local values, then startup/verification commands and expected results.
Use local Docker as the default when a service is required. Identify unsupported recipes explicitly;
do not invent `docker(...)` support or replace an existing app's data, dialect, or migration history.
The public helper is `defineApp`, not `defineConfig`. Keep provider connection bindings distinct
from application environment fields. Shared setup prose lives in `content/_setup`, and executable
configurations live in `examples/setup`; materialize them through the existing source include pipeline.
Deep-linked definition pages must link their module's pre-setup before introducing the descriptor.
Deployment documentation must distinguish application hosts, deployment engines, resource adapters,
and job-provider publication; an adapter package is not evidence of hosting support.

Make each module's first working example and exact reference visible in its overview;
do not rely on a collapsed related-links section or sidebar alone. The CLI module
owns terminal workflows, while the CLI reference owns generated command syntax.

When `relkit add` supports the file being introduced, show its copyable command at the creation
step, before the corresponding source example. State prerequisites, generated paths and public
registration, placeholder code to replace, and what still needs manual configuration. Keep the
manual path available and link the exact command reference. Do not make readers run both paths,
rerun scaffolds against existing files, or infer that a generated profile matches a manual sample.
Use explicit flags for copyable examples; reserve omitted values for instructions about prompts.

When a backend declaration generates a client API, show a focused frontend usage example in that
capability's module immediately beside its backend example, and inside its individual API reference
entry. A package-level link or a separate Frontend guide does not satisfy this requirement. Pair the
same route/resource ID, input, and output on both sides. Use a visible frontend section; React and
plain TypeScript callers may be alternative tabs. Link the exact client reference and the
Frontend guide for installation, contract pull, and provider setup. State when a capability has
no generated browser API; never imply that a server descriptor should be imported into the browser.
Keep frontend samples checked against generated declarations rather than handwritten registries.
Frontend samples use source includes. Only `examples/**/*.preview.*` files are standalone Blume
live previews; those must supply their own providers and default component export.

Authored frontend companions live in `content/_frontend`. Native Blume includes reuse them in
module pages and individual reference entries, with declaration identities in
`scripts/frontend-examples.ts`. These partials have no route or navigation entry; their source
includes still participate in generation and freshness checks. Keep private descriptors and legacy
APIs without a generated browser contract distinct from client-exposed declarations.

Write CLI examples without unnecessary quotation marks: `relkit add route /status --mode route`.
Use kebab-case artifact names such as `send-receipt` instead of quoted multiword names.
Escape literal shell wildcards with backslashes, such as `/orders/\*` or a URL's `\?`.
Keep quoting only where shell parsing needs it, including JSON, headers, free-form text with
spaces, and variable expansions. Check that commands preserve their arguments in Bash and zsh.

## Authoring and sources

Pages live in `content/docs/learn`, `content/docs/modules`, and `content/guides`.
Every page needs `title` and `description`. Set `pagination: false` on task guides;
finish with useful related tasks. Use native Blume Markdown, components, heading
anchors, and code titles. Keep an existing anchor when renaming a heading:

```md
## 2. Start the server [#start-the-server]
```

Add the page to `scripts/guide-catalog.ts` or its capability catalog, and record its
installation disposition in `scripts/installation-coverage.json`. The generator
owns native `meta.ts` ordering and related references. Keep old public URLs in
`redirects.json` as direct permanent redirects to the final destination.

Use maintained executable examples for code. The `source` attribute names a
repository file and, optionally, one unique named region. The include body names
its generated copy inside the content root:

```md
<include source="examples/commerce/src/services/assets/buckets/assets.bucket.ts" lang="ts" meta='title="src/services/assets/buckets/assets.bucket.ts"'>/_snippets/source/examples/commerce/src/services/assets/buckets/assets.bucket.ts</include>
```

For `source="file.ts#region-name"`, use `file--region-name.ts` for the copy. Region
markers are `// #region region-name` and `// #endregion region-name`. Missing,
duplicate, incomplete, or conflicting includes fail generation. Never edit
`content/_snippets`, generated API/CLI pages, or generated metadata by hand.

Narrative prose stays authored. Repeated installation facts come from the
installation catalog; API contracts come from source JSDoc; CLI options come from
the command model. Blume uses the expanded content for HTML, search, Markdown,
sitemap, and LLM text.

## Presentation

Use native Blume components to make the existing content easier to follow:

- Give navigation groups, overview cards, and every page sidebar entry meaningful
  Lucide icons. Blume expects lowercase names such as `hard-drive` and `shield-check`;
  the navigation generator converts the catalog's existing icon names.
- Use `CardGroup` for choices and related destinations. Keep tables for comparisons.
  Preserve inline links inside cards without `href`; avoid nesting links in a linked card.
- Wrap sequential walkthroughs in `Steps` and `Step`. Keep their existing numbered
  headings and anchors inside each step; use an icon marker to avoid duplicate numbers.
  For unnumbered headings, let Blume supply the step numbers. Keep reference sections outside steps.
- Keep prerequisites and starting links visible in `Callout`. Reserve `Accordion`
  for optional reference and source links, never required steps or warnings.
- Use `Tabs` only for alternatives, such as provider setups. Required steps stay
  visible in order, and every alternative must remain available in Markdown output.

Preserve prose, commands, examples, and link destinations when changing presentation.

## Public API coverage

The generator reads **every workspace package export map**, then asks TypeScript for
the exported values and types. `documentation-catalog.ts` assigns supported packages
their reference pages; it is not the source of the coverage inventory. New supported
packages without a reference, unresolved declaration targets, and public symbols without
a generated contract fail generation. Named/default aliases and star re-exports resolve
to their original declarations; internal implementation files exposed through a supported
facade are documented through that facade. Packages explicitly described as internal and
`/internal` leaves receive a visible disposition in the public API directory.

For a new capability, add an authored usage page and its relationships to the guide
catalog. Each package needs an explanation with maintained examples. Export tables link
to inline API examples, imported usages in repository examples/tests, or the shared
module walkthrough for companion types and low-level helpers. These links do not claim
that every repository test runs during a docs build. Add a focused executable example
when an existing example does not explain a new operation.

Keep runtime factories, provider configuration, and real task guides distinct. Preserve
declaration identity when an API has a legacy variant with the same name. Generated
source links retain the full path below `src`, including React and runtime subdirectories.

## Verification

From `apps/docs`, run:

```sh
bun run generate
bun run test
bun run check
bun run build
```

`generate:check` verifies freshness without changing generated outputs, including
obsolete files. The strict build validates links, anchors, includes, and rendering.
Stop a running Blume dev server before building, or use `blume build --isolated`.
Preview locally with `bun run dev` on port 3001.

Run the documented commands against the maintained examples and the installation
harness when changing setup. Check both success and applicable rejection paths.
Record the package versions and environment tested. Rendering changes also need
browser checks for keyboard search, code copying, deep links, responsive navigation,
and Markdown output. Landing changes require comparison against its preserved
desktop/mobile, theme, reduced-motion, and animation baseline.
