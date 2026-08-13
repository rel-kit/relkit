# AGENTS.md

This file is the working guide for coding agents in the ZSYS repository. Read it
before editing. User instructions take precedence; more-specific instructions
inside a subtree take precedence over this file.

The format follows the open [AGENTS.md](https://agents.md/) convention.

## Repository

ZSYS is an open-source TypeScript monorepo using Bun and Turborepo. The generic
Next.js/React starter has been removed. Phase 0 is still being assembled, so
the repository files and package scripts are current truth; v3 documents and
later task descriptions are intended design, not implemented behavior.

| Path                    | Role                                                                         |
| ----------------------- | ---------------------------------------------------------------------------- |
| `apps/inspector`        | Reserved inspector app root; currently empty.                                |
| `apps/fixture-commerce` | Reserved acceptance fixture root; currently empty.                           |
| `packages/*`            | Reserved ZSys package workspace; package shells are added by tasks 1.4–1.6.  |
| `templates/default`     | Reserved generated-project template root; currently empty.                   |
| `tests/*`               | Phase 0 test-layer roots; `tests/phase0.test.ts` covers current guardrails.  |
| `scripts`               | Phase 0 boundary/scope/export/verification tooling; later checks land later. |
| `docs`                  | Briefs, technical specifications, decision records, and ADRs.                |
| `openspec`              | Change proposals, tasks, and delta specifications.                           |
| `repos/effect`          | Vendored Effect source; reference only, not a ZSYS edit target.              |

The root Bun workspace currently matches `apps/*` and `packages/*`; empty
directories are represented by `.gitkeep`. `repos/effect` is not a workspace
member. No runtime framework or application package is installed in Phase 0.

## Setup and development

Run these commands from the repository root:

```sh
bun install --frozen-lockfile
bun run typecheck
bun run dev
```

The repository pins Bun `1.3.10` through `packageManager`, `devEngines`, and
`bunfig.toml`'s exact install mode. The root tooling versions are Bun types
`1.3.10`, TypeScript `5.9.2`, Turbo `2.10.9`, Prettier `3.9.6`, ESLint
`9.39.5`, and Konsistent `1.0.0-beta.4`. `bun run dev` invokes Turborepo's
workspace development tasks. The current Phase 0 roots have no development
task yet, so it exits after finding no runnable package; the real ZSys
supervisor/CLI development flow belongs to its later owning task.

The v3 application defaults are backend `PORT=3000` and inspector port `3210`.
They are not live services in the current empty-root Phase 0 topology.

The root manifest reserves the v3 Section 23.4 commands:

```sh
bun run check
bun run typecheck
bun run lint
bun test
bun run test:types
bun run test:unit
bun run test:compiler
bun run test:contracts
bun run test:integration
bun run test:restart
bun run test:inspector
bun run test:e2e
bun run test:generator
bun run test:deployment
bun run test:security
bun run test:all
bun run build
bun run verify
```

The commands above become runnable as their owning Phase 0 scripts and test
layers land. Do not describe an unimplemented script as a passing check or
invent another root command. Use `bunx prettier --check <files>` and
`bunx eslint <files>` for focused checks while those scripts are unavailable.

## Test and verification

Phase 0 now has checked-in boundary/scope/export/verification tooling and a
guardrail test suite. Later Section 23.4 test layers remain reserved until
their owning phases land; they are not passing gates yet. The checks currently
runnable against this task's root tooling are:

```sh
bun install --frozen-lockfile
bun run typecheck
bun run dev
bun test tests/phase0.test.ts
bun run verify
bunx prettier --check AGENTS.md package.json turbo.json bunfig.toml tsconfig.base.json tsconfig.json .prettierrc.json eslint.config.mjs
bunx eslint eslint.config.mjs
```

When adding runtime behavior, add a focused test with the owning package and
run that package's declared test command. For Markdown-only changes, check the
changed files with `bunx prettier --check <files>` and inspect links and shell
commands manually.

For a focused workspace task, use Turborepo filters after the owning package
exists, for example:

```sh
bunx turbo run dev --filter=<package>
```

### Effect vendor

Treat `repos/effect` as vendored reference material, not as a ZSYS edit target.
Do not modify, reformat, install dependencies in, or mix vendor maintenance
into a ZSYS change. Use its source and documentation to understand Effect APIs,
then implement ZSYS changes in the root `apps`, `packages`, or project docs.

Before using Effect guidance, read:

- [`repos/effect/.agents/AGENTS.md`](repos/effect/.agents/AGENTS.md)
- [`repos/effect/LLMS.md`](repos/effect/LLMS.md)

Those files describe the upstream Effect repository and are reference material
for this project. Upstream maintenance belongs in the vendor's own workflow,
not in a ZSYS change.

## Code standards

- Keep TypeScript strict and follow the shared configs, ESLint, and Prettier.
- Match the existing format: double-quoted strings and semicolons in TypeScript.
- Keep implementation files at or below 200 lines. Split code by responsibility
  when it exceeds the limit. The limit does not apply to tests, e2e tests,
  documents, fixtures, generated output, or vendored code.
- Prefer the smallest clear change. Reuse existing utilities and dependencies;
  do not add abstractions, configuration, or dependencies without a concrete use.
- Clean code is required: use precise names, small focused functions, explicit
  error handling, and no dead or commented-out code.
- Comments and JSDoc are part of the public quality bar. Add them for public
  APIs, invariants, non-obvious intent, or important trade-offs. Explain why,
  not what the code already says; do not use comments to hide unclear code.
- Do not hand-edit generated files. Keep changes focused and leave unrelated
  worktree changes untouched.

## Structural consistency for agents

Before changing directory, file, export, import, or naming conventions, read
[`konsistent-config`](.agents/skills/konsistent-config/SKILL.md). The pinned
Konsistent CLI and root script now exist, but `konsistent.json` is intentionally
deferred until the complete package-shell cohort provides evidence (task 1.8).
When configuring it, follow the skill's evidence-first workflow rather than
inventing rules, validate the config, then report audit findings separately
from validation success.

## Open-source contribution hygiene

Keep public documentation and examples accurate, avoid secrets and local
environment files, and update the nearest README/spec when behavior changes.
Before handing off, report the checks run, any checks that were unavailable, and
any intentional limitations.
