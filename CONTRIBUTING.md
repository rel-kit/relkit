# Contributing to RelKit

## Quickstart

Needs Bun 1.3.10 and Node.js 24.

```sh
git clone https://github.com/rel-kit/relkit && cd relkit
bun install --frozen-lockfile
bun run build
bun run test:unit   # fast loop
bun run prepush     # what CI runs; use it before opening a pull request
```

## Before you start

Thank you for improving RelKit. Please open an issue before substantial design work so maintainers
can confirm scope and avoid duplicate effort. Use the focused scripts listed in `AGENTS.md` while
iterating.

## When a change needs an OpenSpec change

Open an OpenSpec change under `openspec/changes/` and link it from the pull request when the change:

- adds a public API or a descriptor kind;
- breaks existing behavior;
- adds a provider family;
- changes the application graph or a protocol format; or
- is security-sensitive.

Other changes — bug fixes, hardening, documentation, tests and internal refactors — do not need one.
Architecture decisions that should outlast a change still go in an ADR under `docs/adr`.

## Writing

Every word users read — the README, docs, CLI help, error messages and the changelog — follows the
[writing standard](WRITING.md). Run `bun scripts/user-text.ts` to check spelling and banned terms.

## Core and Labs

Every package declares a tier in the `relkit.maturity` field of its `package.json`. Core features
are covered by the stability promise; Labs features can change in any release, carry the
`@experimental` TSDoc tag on every export, and set `labs: true` on their docs pages. The
[maturity table](https://relkit.dev/docs/maturity) lists every feature; its source is
`scripts/maturity.ts`. Run `bun scripts/maturity.ts` after changing a tier, an export of a Labs
package or a Labs docs page.

## Stop-doing rules until 1.0

Until Core reaches 1.0, review rejects a change that:

- adds a new feature area — a descriptor kind, a provider family or an integration — that no
  approved OpenSpec change lists; open the OpenSpec change first and link it from the pull request;
- refuses to create a project on an untested setup; warn instead, and keep refusal behind `--strict`;
- commits raw evidence or bug-fix report files; attach full reports to CI runs and releases, keep a
  short summary under `docs/evidence`, and link the GitHub issue;
- adds a fast path that only one example application uses; make the general path fast instead; or
- presents AWS as the lead deploy target; lead with Railway, then Vercel and Cloudflare, and keep AWS
  in Labs.

Bug fixes and hardening remain welcome in both Core and Labs. The pull request template repeats these
rules as the review checklist.

## Development

RelKit is experimental, interfaces may change, and current consumers are the repository samples.
Update affected samples directly within a scoped change; preserve data and applied migration
history. Do not add legacy upgrade commands or compatibility layers merely to retain an experimental
sample's old layout. Do not run the AWS acceptance suite unless a maintainer explicitly authorizes the
cost and provides an isolated environment.

Pre-release and patched dependencies are listed with an owner and an exit plan in the
[dependency policy](docs/dependencies.md).

## Rules and their checks

Every mandatory rule in this file and in `AGENTS.md` is enforced by a check that `bun run prepush`
and CI run. Rules without a check are advisory and say so.

| Rule                                                                                 | Enforced by                                                 |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| Strict TypeScript with the shared configs                                            | `bun x tsc -b` and package `typecheck` (prepush, CI)        |
| Double quotes, semicolons and Prettier formatting                                    | `bun x prettier --check` and `bun run lint` (prepush, CI)   |
| Implementation files have at most 250 lines; older oversized files may only shrink   | `bun scripts/file-size.ts` in `bun run check` (prepush, CI) |
| Package boundaries and import directions                                             | `bun scripts/check-boundaries.ts` in `bun run check`        |
| Naming, export and directory conventions                                             | `bun run konsistent -- validate` (prepush, CI)              |
| User-facing text follows the writing standard                                        | `bun scripts/user-text.ts` in `bun run lint`                |
| Package tiers, `@experimental` tags and Labs docs flags agree                        | `bun scripts/maturity.ts` in `bun run check`                |
| No committed bug-fix reports, raw evidence or machine-specific paths; `docs/` < 5 MB | `bun scripts/repository-hygiene.ts` in `bun run check`      |
| Agent skills apply to packages, tools or paths this repository uses                  | `bun scripts/agent-skills.ts` in `bun run check`            |
| Pre-release and patched dependencies are listed with an owner and an exit plan       | `bun scripts/dependency-policy.ts` in `bun run check`       |
| `Bun.*` and `node:` code stays in runtime adapters; older call sites may only shrink | `bun scripts/portability.ts` in `bun run check`             |
| Publishable changes carry a Changeset                                                | **Changeset coverage** job (CI)                             |
| Pull requests pass `CI Gate` before merge                                            | Branch protection on `main`                                 |
| This quickstart works from a clean checkout                                          | **Contributor quickstart** job (CI)                         |
| OpenSpec scope and the stop-doing rules                                              | Review, using the pull request template checklist           |
| Add focused regression coverage for non-trivial behavior                             | Advisory                                                    |
| Prefer existing utilities over new abstractions or dependencies                      | Advisory                                                    |
| Do not hand-edit generated files                                                     | Advisory                                                    |
| Coding agents follow the Effect, `use-effect` and `konsistent-config` skills         | Advisory                                                    |
| No cloud spend, destructive actions or Git operations without authorization          | Advisory                                                    |

When a change adds a mandatory rule, it adds the check in the same pull request or labels the rule
advisory here.

## Pull requests

Keep changes focused, add the smallest regression check that proves non-trivial behavior, and update
public documentation when the contract changes. Pull requests must pass `CI Gate`; maintainers
squash-merge approved work. Versioning, release certification and publishing are described in the
[maintainer release guide](docs/maintainers/releasing.md).

By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
