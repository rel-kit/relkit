# AGENTS.md

This file is the working guide for coding agents in the ZSYS repository. Read it
before editing. User instructions take precedence; more-specific instructions
inside a subtree take precedence over this file.

The format follows the open [AGENTS.md](https://agents.md/) convention.

## Repository

ZSYS is an open-source TypeScript monorepo using Bun and Turborepo. It is an
early implementation scaffold, so treat the code and package scripts as the
current truth and the documents/specifications as the intended design. Do not
describe planned features as implemented.

| Path                         | Role                                                           |
| ---------------------------- | -------------------------------------------------------------- |
| `apps/web`                   | Next.js application on port 3000                               |
| `apps/docs`                  | Next.js documentation application on port 3001                 |
| `packages/ui`                | Shared React components (`@repo/ui`)                           |
| `packages/eslint-config`     | Shared ESLint configurations                                   |
| `packages/typescript-config` | Shared TypeScript configurations                               |
| `docs`                       | Briefs, technical specifications, and decision records         |
| `openspec`                   | Change proposals, tasks, and delta specifications              |
| `repos/effect`               | Vendored Effect source; reference only, not a ZSYS edit target |

The root workspace includes only `apps/*` and `packages/*`. `repos/effect` is
not a root workspace member.

## Setup and development

Run these commands from the repository root:

```sh
bun install
bun run dev
```

The root uses Bun 1.3.10 (`devEngines`) and `bun.lock`. `bun run dev` starts
both Next.js apps through Turborepo. To run one app, use a filter:

```sh
bunx turbo run dev --filter=web
bunx turbo run dev --filter=docs
```

Use the package's own `package.json` for any command not listed here. Do not
invent a root command for a task that the root scripts do not expose.

## Test and verification

There is currently no root `test` script and no checked-in app/package test
suite. Do not claim that `bun test` is a repository gate. For the current root
workspace, run the applicable checks:

```sh
bun run lint
bun run check-types
bun run build
```

For a focused package or app, use Turborepo filters, for example:

```sh
bunx turbo run lint check-types build --filter=web
```

When adding runtime behavior, add a focused test with the owning package and
run that package's declared test command. For Markdown-only changes, check the
changed files with `bunx prettier --check <files>` and inspect links and shell
commands manually.

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
[`konsistent-config`](.agents/skills/konsistent-config/SKILL.md). Check whether
the CLI, dependency, and root script are already set up first; this repository
currently has no root `konsistent` dependency or script. If setup is needed,
follow that skill with Bun and its evidence-first workflow rather than inventing
a `konsistent.json` from guesswork. Once configured, validate the config, then
run the audit and report its findings separately from validation success.

## Open-source contribution hygiene

Keep public documentation and examples accurate, avoid secrets and local
environment files, and update the nearest README/spec when behavior changes.
Before handing off, report the checks run, any checks that were unavailable, and
any intentional limitations.
