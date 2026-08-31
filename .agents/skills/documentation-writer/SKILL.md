---
name: documentation-writer
description: Write and review RELKIT documentation using Relkit, repository-backed examples, and the Next.js/Fumadocs authoring workflow. Use for guides, contributor docs, and API or CLI documentation changes.
---

# RELKIT Documentation Writer

Write clear, task-focused documentation grounded in the current repository.
Use Relkit to separate reader needs, not to reorganize the site's existing navigation.

## Choose the reader's goal

- **Tutorial:** Guide a newcomer through a working outcome, with prerequisites and verification.
- **How-to:** Solve a specific problem for a reader who knows the basics.
- **Reference:** Describe exact APIs, options, defaults, constraints, and errors.
- **Explanation:** Explain concepts and tradeoffs; link to procedures and reference details.

Infer the document type, audience, goal, and scope from the request and neighboring pages.
Ask only when missing information materially changes the result. Make straightforward edits
directly. For substantial restructuring, or when requested, propose an outline and obtain
approval before writing. A review request alone does not authorize edits.

## Establish current behavior

All repository paths below are relative to the repository root.

- Read applicable `AGENTS.md` instructions and inspect overlapping dirty changes before editing.
- Read `docs/README.md`, relevant current guidance, and adjacent pages for terminology and style.
  Verify claims against package source, tests, `examples/commerce`, and `templates/default/v1`.
- Document the current domain-first application layout. Revision-3 POC specifications are
  historical evidence, not the source for current behavior. Do not rewrite protected normative
  documents or OpenSpec artifacts as a side effect of a documentation task.
- Distinguish public application APIs from internal implementation: application authors use
  plain TypeScript descriptors and do not need Effect imports. For internal Effect reference,
  follow the repository's vendored-source instructions in `AGENTS.md`.
- Confirm commands, defaults, paths, and ports from current source. Distinguish repository-root
  commands from generated-project commands and local workflows from cloud deployment.
  Do not incur cloud costs without authorization.
- Use local repository sources freely. Consult external websites only when the user provides
  a link and asks you to consult it; report uncertainty when local evidence is insufficient.

## Edit the source of truth

- **Authored site pages:** Edit MDX under `apps/docs/content/docs`, following neighboring
  Next.js/Fumadocs pages. Use `title` and `description` frontmatter and existing MDX components.
- **Contributor documentation:** Edit the relevant Markdown under `docs/` or the appropriate
  README. Keep contributor internals distinct from application-user instructions.
- **API reference:** Edit package-source JSDoc, not `apps/docs/content/docs/api/*.mdx`.
  Cataloged public APIs require a description, `@category`, `@since`, and an executable
  TypeScript `@example`; see `apps/docs/scripts/check-jsdoc.ts`.
- **CLI reference:** Edit the CLI help model exposed by `@relkit/cli/help`, not
  `apps/docs/content/docs/operations/cli-reference.mdx`.
- **Navigation and related content:** Update `apps/docs/scripts/guide-catalog.ts` and any
  relevant imported catalogs when adding or moving guides. Update
  `apps/docs/scripts/feature-catalog.ts` when capability coverage changes. Navigation
  `meta.json` files and `apps/docs/content/generated` are generated; do not hand-edit them.

Inspect `apps/docs/scripts/generate.ts` and `apps/docs/scripts/generate-guides.ts` when
ownership is unclear. Use the existing generator after generated-input changes; inspect its
diff and preserve unrelated work.

## Keep examples executable

Authored site guides use source includes rather than standalone `ts` or `tsx` fences.
Reuse working code from `examples/commerce` or `templates/default/v1`; do not invent APIs or
duplicate snippets that can drift. Follow the existing include syntax and working-directory
convention, for example:

```mdx
<include cwd lang="ts" meta='title="examples/commerce/src/routes/orders/[orderId]/route.ts"'>
  ../../examples/commerce/src/routes/orders/[orderId]/route.ts
</include>
```

Keep shell commands in `sh` fences with the working directory and prerequisites clear.
For a new example, add or update executable source and focused coverage within the approved
scope. This site-guide rule does not prohibit TypeScript fences in JSDoc API examples.

Keep guides focused on one reader outcome. Include actionable commands or source examples,
describe the expected result, and include the catalog-generated related-content block:

```mdx
<include cwd>content/generated/related/http-routes.mdx</include>
```

Use the filename generated for the actual page, not the example filename above.

## Verify the change

For site, catalog, or generated-reference source changes, run the relevant checks from the
repository root:

```sh
# When generated inputs changed; review generated-file changes afterward.
bun --cwd=apps/docs run generate

# Checks freshness, types, JSDoc, links, search, and documentation tests.
bun run test:docs
```

Run focused example tests when executable examples change. For MDX component or layout
changes, also build the docs app and inspect the affected page. For prose-only contributor
docs or skill edits, use scoped validation rather than rebuilding the application.

Report what changed and which checks passed, failed, or were intentionally skipped.
Do not claim snippets were executed or pages rendered unless those checks actually ran.
