# Getting started

ZSys projects are TypeScript applications managed by Bun. The generated
project is the supported starting point; its `zsys` commands compile the
application graph, run the local supervisor, and build deployment artifacts.

## Prerequisites

- Bun `1.3.10`.
- A working TypeScript toolchain from the generated project.
- Pulumi CLI and AWS credentials for the default AWS/Pulumi project. Use the
  explicit `--cloud none --deploy none` options for local-only development.

Check the local toolchain from a generated project with:

```sh
zsys doctor
```

The doctor command reports missing tools and configuration without printing
secret values. Use `zsys --json doctor` when a script needs structured output.

## Create a project

The release-supported generator command is:

```sh
bunx create-zsys@latest my-app
cd my-app
```

When testing changes from a ZSys checkout, use its source-backed CLI after
building the workspace; this does not publish packages:

```sh
bun run build
bun run zsys:local -- create my-app --cloud none --deploy none
```

The equivalent CLI form is `zsys create my-app`. The generator supports three
templates:

| Option                    | Values                            | Default         |
| ------------------------- | --------------------------------- | --------------- |
| `--template`              | `minimal`, `api`, `agent`         | `minimal`       |
| `--cloud`                 | `aws`, `none`                     | `aws`           |
| `--deploy`                | `pulumi`, `none`                  | `pulumi`        |
| `--install`               | install dependencies              | enabled         |
| `--no-install`            | skip dependency installation      | —               |
| `--git`                   | initialize Git                    | enabled         |
| `--no-git`                | skip Git initialization           | —               |
| `--examples`              | include examples                  | enabled         |
| `--no-examples`           | omit examples                     | —               |
| `--directory`             | destination path                  | positional path |
| `--force-empty-directory` | allow an existing empty directory | disabled        |
| `--json`                  | print structured output           | disabled        |

The default command creates the AWS/Pulumi project and runs its install,
doctor, and check steps. For a project that does not need cloud prerequisites,
opt out explicitly:

```sh
bunx create-zsys@latest my-app --cloud none --deploy none
```

For example, an API project is:

```sh
bunx create-zsys@latest my-api --template api
```

Generation validates the destination before writing. A failed generation does
not leave a partial project.

## Run the first route

Install dependencies if generation was run with `--no-install`, then start the
development supervisor:

```sh
bun install
bun run dev
```

The minimal project exposes:

```sh
curl "http://localhost:3000/hello?name=ZSys"
```

The response is:

```json
{ "message": "Hello, ZSys!" }
```

The generated configuration starts the real Next.js inspector on port `3210`.
The portable development check is the versioned graph API on the active backend
port:

```sh
curl "http://localhost:3000/_zsys/v1/graph"
```

The graph response includes the active `graphHash`. The inspector at
`http://localhost:3210` uses the same versioned API and displays that active
graph, not a separately reconstructed source model. Stop both processes with
`Ctrl-C`.

The published CLI includes the prebuilt inspector. Framework contributors can
set `ZSYS_INSPECTOR_ROOT` to run a compatible `apps/inspector` checkout instead.

## Check, test, and build

Generated projects ship these scripts:

```sh
bun run test
bun run test:unit
bun run test:integration
bun run check
bun run typecheck
bun run build
bun run start
```

Run `bun run start` only after `bun run build`. The built server validates the
generated graph and manifest hash before serving traffic. Build output is
written under `.zsys/build` and includes the server, manifest, graph, OpenAPI
document, and production Dockerfile.

Print or compare graph artifacts with:

```sh
bun run graph
zsys graph print
zsys graph check
zsys graph diff before-graph.json after-graph.json
```

`zsys graph check --hash <hash>` verifies an expected graph hash. Graph files
and generated manifests are derived outputs; edit the source descriptors and
run `bun run check` to regenerate them.

## Environment configuration

Inspect configuration without exposing values:

```sh
zsys env check
zsys env list
zsys env explain PORT
zsys env example
```

`zsys env example` prints the generated example. Add `--write` when it should
write the example file; the command does not overwrite an existing file by
default. Production-required fields are reported by `zsys env check`; set
their values through the environment or the deployment configuration rather
than committing secrets.

## Authoring model

Application source uses public ZSys descriptors. A function is the executable
unit and routes target function descriptors:

```ts
import { defineFunction, defineRoute } from "@zsys/app";
import { z } from "@zsys/schema";

const hello = defineFunction({
  input: z.object({ name: z.string().default("world") }),
  output: z.object({ message: z.string() }),
  handler: async ({ name }) => ({ message: `Hello, ${name}!` }),
});

// src/routes/hello/route.ts
export const GET = defineRoute({
  target: hello,
});
```

The `route.ts` location supplies `/hello`, its `GET` export supplies the method,
and the object input is inferred as query parameters. Source-scoped IDs are
derived from file/export/member structure; add an explicit ID when a source
move must preserve graph identity. Descriptors are pure metadata. The compiler
discovers them, validates the canonical graph, and emits the runtime manifest.
Use `target.invoke(input)` for nested calls; managed resources remain explicit
dependencies. Do not put executable closures in graph mappings or edit
`.zsys/generated` by hand.

## Project directories

- `src/` contains application descriptors and handlers.
- `.zsys/generated/` contains checked graph, manifest, OpenAPI, client, and diagnostics output.
- `.zsys/build/` contains production build output.
- `.zsys/state/` and `.zsys/observability/` contain local development state and telemetry.

Keep `.env`, local state, and generated output out of commits. The generated
templates use local providers in development, deterministic test providers in
tests, and the configured AWS provider set in production.
