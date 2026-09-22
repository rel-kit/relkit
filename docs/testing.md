# Testing

RELKIT tests exercise the same function engine and canonical graph used by
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
import hello from "@app/hello/functions/hello.function.js";

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

Run `bun run check` after changing event contracts or publications. The application
harness validates and loads the generated registry so direct and nested function
calls receive their declared event contracts.

```ts
import { afterAll, expect, test } from "bun:test";
import { createTestApplication } from "@relkit/testing";
import config from "../../relkit.config.js";

const testApp = await createTestApplication(config);

test("GET /hello", async () => {
  const response = await testApp.http.request("/hello?name=Mustafa");
  expect(response.status).toBe(200);
});

afterAll(() => testApp.close());
```

Provider-backed applications must replace every graph-required capability/profile
explicitly through the `providers` option. For example, the commerce suite supplies
separate fakes for cache profiles `requests` and `timeline`, bucket profiles
`assets` and `receipts`, and its realtime and agent-state profiles. Missing
replacements fail before the test application becomes ready; `RELKIT_ENV=test`
does not change provider selection.

Use `createTestCacheFake` and `createTestBucketFake` for deterministic resource
behavior, `createTestJob` and `createTestEvent` for async delivery contracts, and a
scripted native LangChain model for agents. Explicit protocol integration tests
may instead opt into configured adapters. Tests that exercise restart and recovery
should use a disposable state directory and assert durable duplicate behavior
rather than relying on timing or arbitrary sleeps.

## Repository checks

From the RELKIT repository root, the shipped focused commands are:

| Concern                          | Command                         |
| -------------------------------- | ------------------------------- |
| Frozen dependency install        | `bun install --frozen-lockfile` |
| Boundaries and scope             | `bun run check`                 |
| TypeScript project references    | `bun run typecheck`             |
| Lint                             | `bun run lint`                  |
| Type fixtures                    | `bun run test:types`            |
| Package and integration packages | `bun run test:packages`         |
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
| Optional real-AWS integration    | `bun run test:aws-integration`  |
| Container lifecycle              | `bun run test:container`        |
| Redis/MinIO Docker lifecycle     | `bun run test:local-docker`     |
| Redaction and security           | `bun run test:security`         |
| All local test layers            | `bun run test:all`              |
| Build                            | `bun run build`                 |
| Full local verification          | `bun run verify`                |
| Fast local pre-push gate         | `bun run prepush`               |
| Complete local acceptance        | `bun run prepush:full`          |

GitHub's merge-blocking `CI Gate` runs frozen install, formatting, lint,
boundaries, TypeScript compilation, and focused unit, compiler, contract, and
security tests in parallel jobs. It does not run a full build, browser,
container, scaffold, Pulumi, or cloud acceptance. The separate release workflow
starts only after successful main-branch CI.

`bun run prepush` mirrors the merge-blocking CI checks without Docker.
`bun run verify` remains the full local fail-fast sequence. It includes
co-located package tests, runtime layers, restart, inspector, packed generator
smoke, build reproducibility, and release readiness. Run `bun run prepush:full`
with Docker available for the remaining container, Redis/MinIO, local deployment,
browser, and end-to-end acceptance. Real AWS acceptance requires explicit local
authorization and is not scheduled or required by GitHub Actions.

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

That full command expects a clean worktree and includes packed export and
scaffold smoke. The automated release uses `--ci-pack` to validate the exact
archive manifest and checksums without those long smoke tests; the full command
remains available from a clean checkout or after committing the change.

## Verification of these guides

From the repository root, check the documentation and OpenSpec change with:

```sh
bunx prettier --check docs/getting-started.md docs/testing.md docs/deployment.md docs/architecture.md docs/troubleshooting.md
git diff --check
openspec validate define-app-provider-architecture --strict
```

The final release reproduction follows the getting-started flow verbatim in a
fresh temporary project, then runs the project test, check, build, start, graph
and inspector checks before cleanup.
