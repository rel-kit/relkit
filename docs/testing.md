# Testing

RelKit tests exercise the same function engine and canonical graph used by
development, the inspector, and deployment. Keep tests deterministic and use
the smallest layer that proves the behavior.

## Generated project commands

Run these from a generated project:

```sh
bun run test
bun run test:unit
bun run test:integration
bun run check
bun run typecheck
bun run build
```

The generated scripts map to `bun test`, `bun test tests/unit`,
`bun test tests/integration`, `relkit check`, `tsc --noEmit`, and `relkit build`.

Unit tests invoke a function descriptor directly through `invokeFunction`:

```ts
import { expect, test } from "bun:test";
import { invokeFunction } from "@relkit/testing";
import hello from "../../src/functions/hello.function.js";

test("hello returns a greeting", async () => {
  await expect(invokeFunction(hello, { name: "Mustafa" })).resolves.toEqual({
    message: "Hello, Mustafa!",
  });
});
```

Application code can use the same standalone boundary directly with
`await hello.invoke(input)`. It validates input/output and runs through the
isolated common kernel without borrowing another application's providers.

Integration tests use `createTestApplication` and its in-process HTTP client:

```ts
import { afterAll, expect, test } from "bun:test";
import { createTestApplication } from "@relkit/testing";
import app from "../../src/app.js";

const testApp = await createTestApplication(app);

test("GET /hello", async () => {
  const response = await testApp.http.request("/hello?name=Mustafa");
  expect(response.status).toBe(200);
});

afterAll(() => testApp.close());
```

`@relkit/testing` replaces every graph-required provider binding with deterministic
in-memory fakes by default, so configured S3, Redis, queue, event, model, and
observability credentials are unnecessary. Explicit protocol integration tests
may opt into configured adapters. Agent tests use the AI SDK v7 `ai/test` surface
and never call live model providers by default. Tests that exercise restart
and recovery should use a disposable state directory and assert durable
duplicate behavior rather than relying on timing or arbitrary sleeps.

## Repository checks

From the RelKit repository root, the shipped focused commands are:

| Concern                          | Command                         |
| -------------------------------- | ------------------------------- |
| Frozen dependency install        | `bun install --frozen-lockfile` |
| Boundaries and scope             | `bun run check`                 |
| TypeScript project references    | `bun run typecheck`             |
| Lint                             | `bun run lint`                  |
| All Bun tests                    | `bun test`                      |
| Type fixtures                    | `bun run test:types`            |
| Unit and schema tests            | `bun run test:unit`             |
| Compiler and graph tests         | `bun run test:compiler`         |
| Provider contracts               | `bun run test:contracts`        |
| Runtime integration              | `bun run test:integration`      |
| Restart and recovery             | `bun run test:restart`          |
| Inspector API                    | `bun run test:inspector`        |
| Packed generator                 | `bun run test:generator`        |
| Canonical examples               | `bun run test:examples`         |
| Documentation and doctests       | `bun run test:docs`             |
| Browser E2E                      | `bun run test:e2e`              |
| Deployment plan and Pulumi tests | `bun run test:deployment`       |
| Release-gated AWS integration    | `bun run test:aws-integration`  |
| Container lifecycle              | `bun run test:container`        |
| Redaction and security           | `bun run test:security`         |
| Build                            | `bun run build`                 |
| Merge-blocking pipeline          | `bun run verify`                |

`bun run verify` is fail-fast and includes frozen-install/no-diff, formatting,
lint, boundaries, type checks, compiler and runtime layers, restart,
inspector, packed generator smoke, build reproducibility, and security scans.
Browser, container, and real AWS checks are separate commands because they
need external runtimes or credentials.

For a packed generator smoke run and the reproducible performance baseline:

```sh
bun run scripts/pack-and-smoke-create-relkit.ts
bun run scripts/performance.ts
```

For the release-wide synthetic-secret artifact scan, optionally set
`RELKIT_SECURITY_IMAGE` to the locally built image reference so its saved bytes
are scanned too:

```sh
RELKIT_SECURITY_IMAGE=<image-reference> bun run scripts/secret-scan.ts
```

Release acceptance additionally uses:

```sh
bun run scripts/release-check.ts
```

That command expects a clean worktree except for the intentional local
iterator skill. Run it from a clean checkout or after committing the change.

## Verification of these guides

From the repository root, check the documentation and OpenSpec change with:

```sh
bunx prettier --check docs/getting-started.md docs/testing.md docs/deployment.md docs/architecture.md docs/troubleshooting.md
git diff --check
openspec validate make-relkit-developer-first --strict
```

The final release reproduction follows the getting-started flow verbatim in a
fresh temporary project, then runs the project test, check, build, start, graph
and inspector checks before cleanup.
