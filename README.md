# RELKIT

[![CI](https://github.com/rel-kit/relkit/actions/workflows/ci.yml/badge.svg)](https://github.com/rel-kit/relkit/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/%40relkit%2Fapp.svg)](https://www.npmjs.com/package/@relkit/app)
[![MIT license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

RELKIT is a Bun and TypeScript monorepo for generating applications whose source
descriptors compile to one graph, local HTTP runtime, inspector protocol, and
Pulumi deployment plan.

## Install

Create a project with the supported bootstrap command:

```sh
bunx create-relkit@latest my-app
cd my-app
bun run dev
```

For an existing Bun project, install the primary authoring API:

```sh
bun add @relkit/app
```

Application code can import the root API or focused typed paths:

- `@relkit/app/schema`
- `@relkit/app/config`
- `@relkit/app/routes`
- `@relkit/app/functions`
- `@relkit/app/events`
- `@relkit/app/agents`
- `@relkit/app/jobs`
- `@relkit/app/cache`
- `@relkit/app/tools`
- `@relkit/app/buckets`
- `@relkit/app/services`

Optional integrations such as `@relkit/client`, `@relkit/drizzle`,
`@relkit/better-auth`, providers, testing, and the CLI remain separate so the
core API does not install the full AWS, Pulumi, Next.js, or testing stack.

## Develop the repository

The repository requires Bun `1.3.10`.

```sh
bun install --frozen-lockfile
bun run typecheck
bun run check
bun run verify
```

The root package scripts cover focused type, package, integration-package, unit,
compiler, contract, integration, restart, inspector, generator, deployment,
container, security, and browser layers. Run the local fail-fast sequence with:

```sh
bun run test:all
```

`test:all` skips cloud mutation by default. Set
`RELKIT_TEST_ALL_CLOUD=1`, `RELKIT_AWS_INTEGRATION_REGION`, and
`RELKIT_AWS_INTEGRATION_IMAGE` only when an AWS acceptance run is explicitly
authorized. `bun run test:local-docker` runs the Redis/MinIO lifecycle acceptance
against a local Docker daemon. `bun run build` builds the workspace and `bun run
verify` checks package tests, boundaries, scope, declarations, generated
artifacts, and release invariants.

Before pushing, run the complete local CI equivalent with Docker running:

```sh
bun run prepush
```

It runs `verify` followed by the container, Redis/MinIO, local deployment,
Inspector browser, and end-to-end acceptance checks. GitHub dependency review
and the explicitly authorized AWS cloud acceptance remain CI-only.

To exercise the current checkout without publishing packages, use the local
launcher. It quietly syncs framework packages, links the generated project's
`@relkit/*` dependencies to this checkout, and restarts local development after
successful framework changes:

```sh
bun run relkit:local -- create my-app --cloud none --deploy none
```

## Repository layout

- `apps/docs` is the searchable Next.js/Fumadocs documentation application on
  port `3001`.
- `apps/inspector` is the Next.js inspector served on port `3210` by a project
  development session.
- `examples/commerce` is the canonical executable, cross-feature example.
- `integrations/catalog` contains the optional side-effect-free integration
  catalog; `integrations/packages` contains independently publishable
  standalone integrations.
- `packages/` contains the public authoring APIs, compiler, graph, engine,
  runtime, inspector API, providers, CLI, generator, and Pulumi deployment
  packages.
- `templates/default/v1` contains the `minimal`, `api`, and `agent` project
  templates.
- `tests/` and `scripts/` contain the focused test layers and verification
  tooling.
- `repos/effect` is vendored reference source, not a RELKIT edit target.

Run `bunx turbo run dev --filter=@relkit/docs` for documentation development and
`bun run test:docs` for generated-reference, doctest, link, and search checks.

## Generate and run an application

Create a cloud-free application:

```sh
bunx create-relkit@latest my-app
cd my-app
bun run dev
```

Cloud and deployment both default to `none`. `bun run dev` starts the generated
backend on `http://localhost:3000` and the real Next inspector on
`http://localhost:3210`; source saves keep the last-known-good backend active.
When the generated project links `@relkit/cli` from this checkout, development
automatically uses `apps/inspector`; published CLI installs use the packaged
inspector instead.
The example route is:

```sh
curl 'http://localhost:3000/hello?name=RelKit'
```

Add AWS hosting through Pulumi only when you intend to deploy it:

```sh
bunx create-relkit@latest my-app --cloud aws --deploy pulumi
```

Useful generated commands are `bun run test`, `bun run check`, `bun run
typecheck`, `bun run build`, and `bun run start` after a build. Stop a dev or
start process with `Ctrl-C`. Generated graph, manifest, build, state, and
observability files live under `.relkit/` and should not be edited by hand.

## Current limitations

AWS deployment uses Pulumi as its engine and requires explicit credentials and
authorization; local deployment tests use mocks. Production internal runtime
endpoints are disabled unless `RELKIT_INTERNAL_ENDPOINTS=1` is set. The CLI ships
the inspector; `RELKIT_INSPECTOR_ROOT` remains available when a different source
checkout must be selected explicitly.

## Releases and support

All public packages ship together on one fixed version. Repository pull
requests that change publishable paths receive an automatic patch Changeset;
forks and minor or major releases use `bun run changeset`. Automation opens the
release pull request, auto-merges it after `CI Gate`, and publishes through npm
trusted publishing. Documentation and internal chores outside release paths
merge without a release.

`@relkit/app`, `create-relkit`, and the explicitly documented optional
integrations are supported public entry points. Packages described as
unsupported internals are published only so workspace dependencies remain
resolvable; application code should not depend on them directly.

See [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), and the
[MIT license](LICENSE).
