# AGENTS.md

This is the working guide for agents in the RELKIT repository. User instructions
take precedence; a more-specific `AGENTS.md` in a subtree takes precedence
over this file. Read it before editing.

## Repository

RELKIT is a strict TypeScript monorepo managed by Bun `1.3.10` and Turborepo.
The main product topology is:

| Path                    | Role                                                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `apps/docs`             | Searchable Next.js/Fumadocs guides and generated API/CLI reference, normally served on port `3001`.                             |
| `apps/inspector`        | Next.js inspector app, normally served on port `3210`.                                                                          |
| `examples/commerce`     | Canonical executable example and cross-feature acceptance application.                                                          |
| `integrations/catalog`  | Optional side-effect-free `@relkit/integrations` catalog.                                                                       |
| `integrations/packages` | Independently publishable Redis, S3, Docker, local, Cloudflare, AI SDK, telemetry, AWS, and Pulumi integrations.                |
| `packages/`             | Authoring APIs, compiler/graph, engine, runtimes, providers, CLI, generator, and Pulumi deployment.                             |
| `templates/default/v1`  | Generated `minimal`, `api`, and `agent` projects.                                                                               |
| `tests/`                | Type, unit, compiler, contract, integration, restart, inspector, generator, deployment, container, security, and browser tests. |
| `scripts/`              | Boundary, build, release, smoke, performance, and verification tooling.                                                         |
| `docs/`                 | User documentation, technical specifications, decisions, and evidence.                                                          |
| `openspec/`             | Change proposals, tasks, delta specifications, and change evidence.                                                             |
| `repos/effect`          | Vendored Effect reference source; never edit or install in it.                                                                  |

Generated projects run a backend on `PORT=3000` and the real Next inspector on
port `3210` by default. `.relkit/generated` contains graph and manifest outputs;
`.relkit/build` contains server and deployment build output; `.relkit/state` and
`.relkit/observability` contain local runtime data. Preserve user-owned output
and dirty worktree changes.

## Commands

From the repository root:

```sh
bun install --frozen-lockfile
bun run typecheck
bun run check
bun run test:all
bun run build
bun run verify
bun run prepush
```

Use focused scripts such as `bun run test:packages`, `bun run test:compiler`,
`bun run test:integration`, `bun run test:inspector`,
`bun run test:generator`, `bun run test:examples`, `bun run test:docs`, and
`bun run test:deployment` while iterating. Use `bun run test:local-docker` for
the opt-in Redis/MinIO Docker lifecycle.
The repository guardrail suite is `bun test tests/phase0.test.ts`.
`test:all` is fail-fast and local by default. Cloud acceptance requires
explicit `RELKIT_TEST_ALL_CLOUD=1`, `RELKIT_AWS_INTEGRATION_REGION`, and
`RELKIT_AWS_INTEGRATION_IMAGE`; do not incur cloud cost without authorization.
Before any authorized push, run `bun run prepush` with Docker running. It covers
every required CI job that is reproducible locally; dependency review and the
opt-in AWS cloud job remain CI-only.

Generated-project commands are `bun run dev`, `bun run test`, `bun run check`,
`bun run typecheck`, `bun run build`, and `bun run start`. Cloud and deployment
default to `none`; use `--cloud aws --deploy pulumi` when AWS deployment is
required. The CLI package contains the prebuilt inspector;
`RELKIT_INSPECTOR_ROOT` is only for framework contributors testing inspector
source.

## Editing rules

- Use strict TypeScript, double quotes, semicolons, and the shared configs.
- Keep implementation files at or below 200 lines; split by responsibility.
- Prefer existing utilities and standard-library APIs over new abstractions or
  dependencies. Add focused regression coverage for non-trivial behavior.
- Use `apply_patch` for source and documentation edits; do not hand-edit
  generated files.
- Do not stage, commit, push, reset, check out, or delete user-owned work unless
  explicitly requested. Do not modify protected normative documents or
  `repos/effect` during unrelated work.
- Inspect overlapping dirty changes before editing and report unavailable or
  intentionally skipped checks honestly.

Before changing exports, imports, directories, or naming conventions, read
`.agents/skills/konsistent-config/SKILL.md`. For Effect API reference, first
read `repos/effect/.agents/AGENTS.md` and `repos/effect/LLMS.md`.
