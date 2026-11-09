# relkit

The core RelKit package: everything an application imports at runtime, and the `relkit`
command.

```sh
bun add relkit
bun add --dev @relkit/cli
```

Write functions, routes, events, jobs, agents and services with the root export and its
subpaths:

```ts
import { defineFunction } from "relkit";
import { s } from "relkit/schema";

export default defineFunction({
  input: s.object({ id: s.string() }),
  output: s.object({ id: s.string(), status: s.string() }),
  handler: async (input) => ({ id: input.id, status: "ready" }),
});
```

`relkit/schema` exports the small built-in builder `s`. Any Standard Schema library, such
as Zod 4, also works for function, event, task and error contracts.

A production install needs only `relkit` and the integrations the application selects. The
compiler, development server and generators live in `@relkit/cli`, a development
dependency; the Inspector is `@relkit/inspector`; tests use `@relkit/testing`.

## The `relkit` command

```sh
bunx relkit create my-app
bunx relkit --help
```

`relkit create` runs `create-relkit`. Inside a project, `relkit` runs the project's
installed `@relkit/cli` at the same release version, and prints installation guidance
when it is missing or at a different version. `npx relkit create my-app` also works when
Bun 1.3.10 or newer is on `PATH`; Bun is the application runtime.
