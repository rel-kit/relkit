# Guided documentation implementation — 25 October 2026

Status: implementation, final review, and local acceptance complete within the boundaries recorded below.

## Scope

Blume 2.2.5 and Astro 7.4.2 now render the documentation and the preserved React landing. The initial migration had 166 pages across Learn, Modules, Guides, and Reference, with 159 direct permanent redirects. The public API follow-up below expands this to 178 pages. Module navigation is contextual, the Orders tutorial is ordered, and practical guides have prerequisites, numbered actions, verification, and curated related tasks.

API and CLI reference, navigation, relationships, installation commands, and source includes remain generated. Narrative prose is authored. Includes are materialized under the excluded `content/_snippets` tree and used by HTML, Markdown, search, and LLM text. Missing or ambiguous source regions fail generation; freshness checks also detect obsolete generated outputs.

The existing checkout and its dirty work were preserved. No OpenSpec proposal, Git commit, push, publication, or deployment was performed. A transitive Inspector build changed `next-env.d.ts`; its original bytes were restored.

## Acceptance evidence

Logs, baseline source, and screenshots are retained in `/tmp/relkit-docs-guided.uSa3BX`. The local production preview is `http://127.0.0.1:3001/docs`.

| Check                                           | Result                                                                                                                                                                                                                                                              |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Blume production build with strict validation   | Passed, 166 pages                                                                                                                                                                                                                                                   |
| Browser suite                                   | 10 passed: all HTML/Markdown routes and internal anchors; redirects; four search queries and section breadcrumbs; keyboard controls; copying; module navigation; mobile menus; landing interactions; metadata; navigation between docs and landing                  |
| Landing comparison                              | Mobile 390 px: identical height, 0.0184% of pixels differ by more than 16/255. Desktop 1440 px: 1 px height difference and 0.4713% differing pixels after replacing Next image optimization. Both light/dark preferences captured; no overflow or hydration errors. |
| Landing lifecycle tests                         | Existing pause, reduced-motion, visibility, cleanup, and topology tests pass within the docs suite                                                                                                                                                                  |
| Published quickstart                            | `bunx create-relkit@latest relkit-orders`, minimal/no jobs; greeting returned HTTP 200 and `{"message":"Hello, RELKIT!"}`                                                                                                                                           |
| Orders tutorial                                 | Endpoint, database migration, sign-in, tests, production build, authenticated requests, and restart passed                                                                                                                                                          |
| Packed installation journeys                    | All seven passed, including standalone Inspector UI, durable history, offline restart, and backend independence                                                                                                                                                     |
| Upload guide                                    | Current candidate: two PNG uploads returned the documented JSON and matching MinIO bytes. Wrong media type and a request over 10 MiB returned 422. A 5,000,001-byte object below the HTTP limit was rejected with 500. None of the rejected objects were stored.    |
| Registration guide                              | Two tests passed, including rollback after membership insertion fails                                                                                                                                                                                               |
| Repository boundaries, lint, consistency config | Passed                                                                                                                                                                                                                                                              |
| Root typecheck and commerce compilation         | Passed, no diagnostics                                                                                                                                                                                                                                              |
| Formatting and diff whitespace                  | Passed, including the final review-link fix                                                                                                                                                                                                                         |
| Docs tests                                      | 113 passed, 3,226 assertions                                                                                                                                                                                                                                        |
| Generated-content freshness                     | Passed; all 515 content files remained byte-for-byte unchanged                                                                                                                                                                                                      |
| Phase 0 repository guardrails                   | Initial full run: 34 passed, two timed out. Both affected checks passed focused retries within unchanged limits: packed exports in 400 seconds; workspace install/typecheck/no-diff check in 17 seconds after compilation ended. No full-suite rerun was needed.    |
| Linux docs container                            | Passed: image build, Node 24.22.1/Bun 1.3.10 runtime, landing, health endpoint, four sections, Markdown, LLM text, and direct 301 redirect. Owned smoke container removed after verification.                                                                       |

## Versions and release boundary

Tests used Bun 1.3.10. The literal published quickstart resolved `create-relkit` and CLI 0.7.11, with app/testing 0.7.10. Blume uses React/react-dom 19.3.0 inside the docs workspace. The Linux smoke container ran Node 24.22.1 and Bun 1.3.10.

The current candidate and published packages are different artifacts despite retaining the same development version strings. The published upload continuation failed at startup because its runtime expected `@relkit/local`; it also retained the earlier Inspector behavior. The upload and lean installation acceptance above applies to the current candidate. Align package publication with these docs before publishing the site; this task changes no product APIs or package release versions.

The existing bucket policy enforces its five-million-byte limit, but the runtime maps that provider rejection to HTTP 500 (`internal-error`). The separate request/schema limits return 422. The guide's documented small-file workflow passes; improving the bucket rejection response is outside this documentation-only API boundary.

## Decisions and review

- Retained the requested checkout instead of creating a worktree, preserving existing dirty work.
- Blume's search index already contains breadcrumbs, but 2.2.5 does not render them. A four-line Bun patch displays the escaped section context. Keep the patch until upstream supports the same behavior; the browser suite covers it.
- Module pages use curated links to avoid automatic pagination into unrelated modules. Learn retains its continuous sequence.
- The retired AI SDK reference redirects to the current native runtime explanation; its removed package cannot supply a truthful generated contract.
- The docs container sets the existing `RELKIT_DOCGEN_CONCURRENCY` option to `1`, reducing simultaneous API compiler processes. The initial parallel build progressed slowly and was canceled for the final-source rebuild. Memory pressure was not established as its cause. Test timeout limits remain unchanged.
- A fresh reviewer found one P2 issue: repository Markdown links still referenced moved files. A regression test failed before the fix and passed afterward (137 link assertions). Active README, setup, and audit links were updated; historical evidence was preserved. No other concrete blocker was identified.

Cloud/provider certification, hosted CI, publishing, and deployment were not run. Local Docker acceptance covers MinIO and the docs container only.

## Configuration API discovery follow-up

`defineEnv` was present in the generated Configuration API, but the Reference overview omitted that package. `defineConfig` is intentionally absent from RELKIT's public exports; the current application constructor is `defineApp`, as verified against the source and removed-export regression test.

The Reference overview now derives its complete package inventory from the documentation catalog. Generated package pages expose direct links to their cataloged authoring APIs before the source sections. Application and environment explanations name `defineApp` and `defineEnv`, preserve existing heading anchors, and are linked from Modules, Core concepts, and Reference. Searches for `defineConfig` reach the explanation of the current API.

Follow-up verification passed: 116 docs tests, 11 browser tests, source generation and freshness, TypeScript, JSDoc for 32 public authoring APIs, strict link validation, search metadata, production build, and repository boundaries. Browser checks exercise the three configuration names and direct navigation to both symbol entries. The preview was rebuilt and restarted on port 3001. The container check above precedes this docs-only follow-up and was not repeated; no product API or container configuration changed.

## Complete public export inventory follow-up

The inventory now starts with all 56 published workspace manifests and 202 export-map paths,
independently of the editorial catalog. It resolves 38 supported packages, 104 supported
import paths, and 2,662 distinct exported declarations through TypeScript. The remaining
packages and internal subpaths have an explicit disposition at `/docs/api/public`; supported
re-exports from their implementation files retain generated contracts through their facade.

Seven package references were missing: provider authoring, local providers, local history,
CLI automation, project generation, the CLI launcher, and integration catalog metadata.
The reference generator also skipped React TSX declarations and lost nested directories
in source links. These gaps are fixed. Export tables preserve aliases and legacy declaration
identities, and link every supported symbol to an existing contract and an example.

Examples are labeled as inline API examples, repository source examples, or shared module
walkthroughs. Companion types and lower-level helpers may share a walkthrough; this is not
a claim that all 2,662 declarations have individual executable tutorials. Four new authored
modules explain provider authoring, local runtime providers, constants/prompts, and tooling
automation, with maintained examples and related workflows. Existing client documentation
uses the actual `RelkitClientProvider`, `useRelkitClient`, and `withRelkit` export names.

Generation fails for an uncataloged supported package, an unresolved manifest source,
a public symbol without a contract, or a package without module examples. The native
docgen patch discovers TSX/MTS/CTS and sorts source paths before TypeScript inference.
The sorted order fixes an observed freshness failure caused by changing inferred member
and union ordering. Narrative pages remain authored; generated outputs are never hand-edited.

Expanded references initially displaced the quickstart for “create app.” Native Blume
frontmatter keywords and a boost of 5 now rank the quickstart first; the browser regression
asserts that position. No additional search implementation or dependency patch was needed.

Logs and screenshots for this follow-up are in `/tmp/relkit-public-docs.eOW5kk`.
The production preview is `http://127.0.0.1:3001/docs/api/public`.

| Check                                       | Result                                                                                                                                                                                        |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Docs tests                                  | 124 passed, 3,473 assertions; includes four executable public API examples                                                                                                                    |
| Browser suite                               | 13 passed, including all HTML/Markdown pages and internal anchors, redirects, API search, first-result quickstart ranking, desktop/mobile navigation, copying, and landing behavior           |
| Generated freshness                         | Full native source generation/check passed; content-only check also passed after the search metadata change                                                                                   |
| Docs typecheck                              | Passed                                                                                                                                                                                        |
| Rich JSDoc                                  | Existing curated check passed for 32 authoring APIs; exhaustive export coverage is a separate generator gate                                                                                  |
| Strict links and production build           | Passed; 178 rendered pages                                                                                                                                                                    |
| Repository boundaries                       | Passed: 65 roots, 5,621 TypeScript files; 10 targeted build-import boundary tests also passed                                                                                                 |
| Lint, consistency configuration, formatting | Passed for the affected scope                                                                                                                                                                 |
| Linux container                             | Passed: frozen install, 52 build tasks, 19 HTTP endpoints, expanded React reference Markdown, search metadata, and a direct redirect; Node 24.22.1/Bun 1.3.10. Owned smoke container removed. |

The docs container excludes root `.relkit` data and scratch output from its context without
deleting it. No product behavior, Git history, publication, deployment, or application data
changed in this follow-up. Linked repository tests, cloud integrations, and the earlier
packed installation/MinIO journeys were not all rerun; their prior evidence and release
limitations above remain applicable.

## CLI module and module discovery follow-up

The CLI now has an authored module at `/docs/modules/cli`. Its overview connects
project creation, scaffolding, checks, development, production builds, local
resources, database migrations, frontend clients, deployment, and programmatic
automation to instructions and the generated command reference. The reference
links back to the module and its new `/guides/cli/create-and-build-an-api`
walkthrough. The four former Tooling pages moved without losing their sections;
old Tooling URLs and the earlier scaffolding URL redirect directly to CLI.

Reviewed all 14 module overviews: services, HTTP, database, authentication,
storage, caching, events, jobs, client, realtime, integrations, operations, CLI,
and AI. Each now exposes an authored starting point and a reference link without
requiring the reader to expand generated related links. Integrations also links
to provider authoring and local provider ownership. Contributor guidance records
this discovery requirement. The landing has no changes in this follow-up.

Executed the new CLI walkthrough in a fresh application outside the workspace,
using the published `create-relkit@latest` command. Tested Bun 1.3.10,
create-relkit 0.7.11, @relkit/cli 0.7.11, @relkit/app 0.7.10, and
@relkit/testing 0.7.10. Route help and `add route /ping --mode route` succeeded;
check, typecheck, and both starter tests passed. `GET /ping` returned HTTP 200
and `{"ok":true}` in development and after build/start. Both owned application
servers were stopped. This verifies the published basic CLI flow, not the
unpublished integration fixes described earlier in this evidence.

Logs are retained in `/tmp/relkit-cli-docs.3e91UB`. Documentation tests passed:
124 tests and 3,489 assertions. All 15 browser checks passed, including the new
CLI module-to-guide-to-reference journey, CLI search, mobile CLI navigation,
all rendered pages and anchors, 163 direct redirects, and existing landing
checks. Native generation/freshness, docs typechecking, rich JSDoc, search
metadata, repository boundaries, lint, consistency configuration, formatting,
and `git diff --check` passed. Strict link validation caught one new link to an
integration navigation group without its own source page; it was corrected to
`/docs/api#integrations`, and strict validation plus content freshness passed.
The final strict production build passed with 179 pages. The rendered-content
and internal-anchor browser check passed again against that final build. The
local preview is `http://127.0.0.1:3001/docs/modules/cli`.

No Docker/container, cloud, or unrelated product suites were rerun for this
content/navigation follow-up. Earlier container and integration acceptance has
the scope recorded above. No publishing, deployment, or Git history changes
were performed.
