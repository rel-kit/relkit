# Task 17.13 recursive synthetic-secret scan

## Result

The exact four-value synthetic set from Section 23.17 was exercised through
the existing observability, HTTP, event, job, agent, inspector, build, and
deployment seams. The recursive matcher reports only safe secret names and
locations; raw values are never written to the report or failure output.

| Surface                                      | Evidence / check                                                                                                             | Result |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------ |
| Terminal capture                             | `bun run test:security` redaction flow                                                                                       | pass   |
| JSON logs                                    | `bun run test:security` redaction flow                                                                                       | pass   |
| NDJSON segments and index                    | `bun run test:security` redaction flow                                                                                       | pass   |
| Request and trace APIs                       | `bun run test:security` redaction flow                                                                                       | pass   |
| SSE messages                                 | `bun run test:security` redaction flow                                                                                       | pass   |
| Inspector HTML and browser network responses | `bun run test:e2e` final scan test                                                                                           | pass   |
| Snapshots, graph, and manifest JSON          | `bun run scripts/secret-scan.ts`                                                                                             | pass   |
| Generated source and package build output    | `bun run scripts/secret-scan.ts`                                                                                             | pass   |
| Production build image                       | `RELKIT_SECURITY_IMAGE=sha256:16fa36766af3f607ed1126490d728c7996597ae4abdfb616b06675f374782e54 bun run scripts/secret-scan.ts` | pass   |
| Provider-neutral deployment plan             | focused deployment plan tests and artifact scan                                                                              | pass   |
| Pulumi reports                               | focused Pulumi mock tests and artifact scan                                                                                  | pass   |
| Cloud evidence                               | recursive scan of `evidence/17.9` through `evidence/17.13`                                                                   | pass   |

The machine-readable artifact report is `secret-scan-report.json`. It records
zero raw matches and the scanned file/image counts without containing any raw
synthetic value.

## Release enforcement

`scripts/verify.ts`, `scripts/release-check.ts`, and the CI security job all
invoke `scripts/secret-scan.ts`. A raw match causes a non-zero exit and names
only the safe synthetic key plus source location.

## Checks

| Command                                                                        | Result                                    |
| ------------------------------------------------------------------------------ | ----------------------------------------- |
| `bun test tests/security`                                                      | exit `0`; 2 tests, 15 assertions          |
| `bun test tests/integration/observability/collector-consumers.test.ts`         | exit `0`; 2 tests, 45 assertions          |
| `bun test tests/deployment/plan.test.ts tests/deployment/pulumi-mocks.test.ts` | exit `0`; 10 tests, 73 assertions         |
| `bun run scripts/secret-scan.ts`                                               | exit `0`; zero matches                    |
| image-enabled `bun run scripts/secret-scan.ts`                                 | exit `0`; zero matches                    |
| `bun run test:e2e` with temporary external type links                          | exit `0`; 6/6 passed, 11.7s               |
| `bun run verify`                                                               | exit `0`; fixed fail-fast pipeline passed |
| `bun run typecheck`                                                            | exit `0`                                  |
| `openspec validate implement-relkit-typescript-poc-v3 --strict`                  | exit `0`                                  |
| focused Prettier and `git diff --check`                                        | exit `0`                                  |

The direct browser startup still has the documented missing external Next type
packages; the successful E2E rerun used temporary links and removed them
without changing the manifest or lockfile. The known Konsistent finding at
`packages/cli/src/index.ts` remains advisory and non-blocking.
