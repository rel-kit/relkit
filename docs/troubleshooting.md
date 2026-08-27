# Troubleshooting

Start with the first failing command and preserve its diagnostic code. RelKit
uses exit code `0` for success, `1` for an operation failure, `2` for usage,
`130` for `SIGINT`, and `143` for `SIGTERM`.

## First checks

From a generated project, run:

```sh
relkit --version
relkit --help
relkit --json doctor
relkit --json check
```

`--json` is a global option and must appear before the command. Every command
and nested subcommand owns contextual help, for example `relkit create --help`
and `relkit graph diff --help`. Check output is also written to
`.relkit/generated/diagnostics.json`; it contains stable codes, severity,
messages, source locations, descriptor IDs, and suggestions. Do not delete
generated output to hide a diagnostic. Fix the source and run `relkit check`
again.

## Common failures

| Symptom                                      | Inspect                                                                                              | Fix                                                                                                                                                            |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The CLI rejects an option                    | `relkit <command> --help` or `relkit <group> <command> --help`                                           | Put global `--json` before the command and use the exact contextual options; follow the suggested command or flag when available.                              |
| A project will not compile                   | `relkit --json check` and `diagnostics.json`                                                           | Fix the first `RELKIT_CONFIG_*`, `RELKIT_EVALUATOR_*`, `RELKIT_DUPLICATE_ID`, `RELKIT_MISSING_TARGET`, `RELKIT_ROUTE_COLLISION`, or schema diagnostic, then rerun check. |
| Environment is incomplete                    | `relkit env check`, `relkit env list`, `relkit env explain NAME`                                           | Supply the same declared keys from the active pipeline. Do not add provider branches or declare the reserved `RELKIT_ENV` key.                                  |
| An external R2/Redis binding is being provisioned | Provider ownership in the inspector and deployment preview                                       | Wrap the adapter with `external(...)`; only `managed(...)` bindings may create resources or IAM statements.                                                  |
| The dev port is busy                         | `relkit doctor --port 3000 --inspector-port 3210`                                                      | Stop the process using the port or choose unused ports in the dev command/configuration.                                                                       |
| Restart fails with `generation-1` already exists | `lsof -nP -iTCP:3000 -sTCP:LISTEN` and `.relkit/generated`                                         | Stop the old dev process and rerun; current CLI runs use isolated `.dev-*` generation directories, so future restarts do not reuse stale candidates.          |
| A candidate cannot activate                  | `relkit --json check`, then the dev diagnostic                                                         | Fix the reported graph, health, provider-readiness, or generation error. The last known good candidate remains active while a replacement fails.               |
| Graph and manifest disagree                  | `relkit graph check --hash <expected-hash>`                                                            | Rerun `relkit check`, then `relkit build` or `relkit start`; do not edit `.relkit/generated` or `.relkit/build`.                                                         |
| `relkit start` rejects the build               | `bun run build`, then inspect the reported hash or manifest code                                     | Start only the current build. A stale or hand-edited manifest must be regenerated.                                                                             |
| The route is unavailable                     | `curl http://localhost:3000/_relkit/v1/health/live` and the route URL                                  | Confirm `bun run dev` is still running, the project root is correct, and the route target compiled into the graph.                                             |
| The inspector graph is stale or disconnected | `curl http://localhost:3000/_relkit/v1/graph`                                                          | Use the active backend's versioned API and verify its `graphHash`; restart the inspector client against that backend if needed.                                |
| Inspector UI changes are not visible         | `ps`, `lsof -nP -iTCP:3210 -sTCP:LISTEN`, and the generated app's linked `@relkit/cli`                  | Run a source-backed local CLI; linked checkouts prefer `apps/inspector`, while published installs use the packaged inspector.                                |
| Deployment preview fails                     | `relkit --json doctor --pulumi` and `relkit --json deploy preview --stack development --non-interactive` | Fix the first deployment code, Pulumi/backend configuration, AWS capability, or required environment value. Preview must succeed before `up`.                  |
| A secret appears in output                   | Stop and redact the artifact or log before sharing it                                                | Use `relkit env explain` for metadata, `--config-secret` for deployment config, and never paste secret values into source, graph, plan, or issues.               |
| A test is flaky                              | Run the smallest test command, then `bun run verify`                                                 | Use deterministic binding fakes, isolated state, and explicit completion/recovery assertions; do not add arbitrary sleeps.                                    |

## Diagnostic codes worth checking

Compiler and graph failures commonly include `RELKIT_DUPLICATE_ID`,
`RELKIT_MISSING_TARGET`, `RELKIT_ROUTE_COLLISION`, `RELKIT_SCHEMA_UNAVAILABLE`,
`RELKIT_MAPPING_INCOMPATIBLE`, and `RELKIT_GRAPH_MANIFEST_MISMATCH`.

Development activation failures include
`RELKIT_CANDIDATE_GRAPH_HASH_MISMATCH`, `RELKIT_CANDIDATE_HEALTH_TIMEOUT`,
`RELKIT_CANDIDATE_PROVIDER_NOT_READY`, and
`RELKIT_CANDIDATE_GENERATION_MISMATCH`.

Deployment failures include `RELKIT_DEPLOY_CHECK_FAILED`,
`RELKIT_DEPLOY_GRAPH_INVALID`, `RELKIT_DEPLOY_BUILD_FAILED`,
`RELKIT_DEPLOY_CONFIGURATION_MISSING`, `RELKIT_DEPLOY_AWS_CAPABILITY_UNSUPPORTED`,
and `RELKIT_DEPLOY_SECRET_UNSUPPORTED`.

The code identifies the failure class; the message and source location identify
the repair. JSON output is safe to attach only after checking that external
tool output contains no local secret or credential value.

## Recovery and cleanup

After correcting source or environment:

```sh
bun run check
bun run test
bun run build
bun run start
```

For a disposable local test project, stop its process before removing its
`.relkit/state`, `.relkit/observability`, `.relkit/generated`, or `.relkit/build`
directories. They are regenerated by the shipped commands, but deployment
state is separate and must be cleaned with the matching Pulumi stack command:

```sh
relkit deploy refresh --stack development
relkit deploy destroy --stack development
```

Use `relkit deploy destroy --non-interactive` only for an explicitly isolated
stack after reviewing the target. Verify cleanup independently.

## When asking for help

Include the command, exit code, diagnostic code, project-relative source
location, Bun version, and whether the failure is in development, tests, build,
or deployment. Share `relkit --json` output only after removing values that are
not already redacted. Do not share `.env`, Pulumi state, generated secrets, or
credential files.
