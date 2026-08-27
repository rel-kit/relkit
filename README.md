# RELKIT

RELKIT is a Bun and TypeScript monorepo for generating applications whose source
descriptors compile to one graph, local HTTP runtime, inspector protocol, and
Pulumi deployment plan.

## Develop the repository

The repository requires Bun `1.3.10`.

```sh
bun install --frozen-lockfile
bun run typecheck
bun run check
bun test
```

The root package scripts cover focused type, unit, compiler, contract,
integration, restart, inspector, generator, deployment, container, security,
and browser layers. Run the local fail-fast sequence with:

```sh
bun run test:all
```

`test:all` skips cloud mutation by default. Set
`RELKIT_TEST_ALL_CLOUD=1`, `RELKIT_AWS_INTEGRATION_REGION`, and
`RELKIT_AWS_INTEGRATION_IMAGE` only when an AWS acceptance run is explicitly
authorized. `bun run build` builds the workspace and `bun run verify` checks
boundaries, scope, declarations, generated artifacts, and release invariants.

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

From a checkout with Pulumi and AWS credentials configured:

```sh
bunx create-relkit@latest my-app
cd my-app
bun run dev
```

The default is AWS with Pulumi deployment. `bun run dev` starts the generated
backend on `http://localhost:3000` and the real Next inspector on
`http://localhost:3210`; source saves keep the last-known-good backend active.
When the generated project links `@relkit/cli` from this checkout, development
automatically uses `apps/inspector`; published CLI installs use the packaged
inspector instead.
The example route is:

```sh
curl 'http://localhost:3000/hello?name=RelKit'
```

For a local-only project without cloud prerequisites, opt out explicitly:

```sh
bunx create-relkit@latest my-app --cloud none --deploy none
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
