# Troubleshooting

Start with the first failing command and preserve its diagnostic code. ZSys
uses exit code `0` for success, `1` for an operation failure, `2` for usage,
`130` for `SIGINT`, and `143` for `SIGTERM`.

## First checks

From a generated project, run:

```sh
zsys --version
zsys --help
zsys --json doctor
zsys --json check
```

`--json` is a global option and must appear before the command. Every command
and nested subcommand owns contextual help, for example `zsys create --help`
and `zsys graph diff --help`. Check output is also written to
`.zsys/generated/diagnostics.json`; it contains stable codes, severity,
messages, source locations, descriptor IDs, and suggestions. Do not delete
generated output to hide a diagnostic. Fix the source and run `zsys check`
again.

## Common failures

| Symptom                                      | Inspect                                                                                              | Fix                                                                                                                                                            |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The CLI rejects an option                    | `zsys <command> --help` or `zsys <group> <command> --help`                                           | Put global `--json` before the command and use the exact contextual options; follow the suggested command or flag when available.                              |
| A project will not compile                   | `zsys --json check` and `diagnostics.json`                                                           | Fix the first `ZSYS_CONFIG_*`, `ZSYS_EVALUATOR_*`, `ZSYS_DUPLICATE_ID`, `ZSYS_MISSING_TARGET`, `ZSYS_ROUTE_COLLISION`, or schema diagnostic, then rerun check. |
| Environment is incomplete                    | `zsys env check`, `zsys env list`, `zsys env explain NAME`                                           | Add the missing non-secret value for the selected environment. Use `zsys env example` to see names and `--write` only when writing the example is intended.    |
| The dev port is busy                         | `zsys doctor --port 3000 --inspector-port 3210`                                                      | Stop the process using the port or choose unused ports in the dev command/configuration.                                                                       |
| A candidate cannot activate                  | `zsys --json check`, then the dev diagnostic                                                         | Fix the reported graph, health, provider-readiness, or generation error. The last known good candidate remains active while a replacement fails.               |
| Graph and manifest disagree                  | `zsys graph check --hash <expected-hash>`                                                            | Rerun `zsys check`, then `zsys build` or `zsys start`; do not edit `.zsys/generated` or `.zsys/build`.                                                         |
| `zsys start` rejects the build               | `bun run build`, then inspect the reported hash or manifest code                                     | Start only the current build. A stale or hand-edited manifest must be regenerated.                                                                             |
| The route is unavailable                     | `curl http://localhost:3000/_zsys/v1/health/live` and the route URL                                  | Confirm `bun run dev` is still running, the project root is correct, and the route target compiled into the graph.                                             |
| The inspector graph is stale or disconnected | `curl http://localhost:3000/_zsys/v1/graph`                                                          | Use the active backend's versioned API and verify its `graphHash`; restart the inspector client against that backend if needed.                                |
| Deployment preview fails                     | `zsys --json doctor --pulumi` and `zsys --json deploy preview --stack development --non-interactive` | Fix the first deployment code, Pulumi/backend configuration, AWS capability, or required environment value. Preview must succeed before `up`.                  |
| A secret appears in output                   | Stop and redact the artifact or log before sharing it                                                | Use `zsys env explain` for metadata, `--config-secret` for deployment config, and never paste secret values into source, graph, plan, or issues.               |
| A test is flaky                              | Run the smallest test command, then `bun run verify`                                                 | Use test providers, deterministic IDs/clock, isolated state, and explicit completion/recovery assertions; do not add arbitrary sleeps.                         |

## Diagnostic codes worth checking

Compiler and graph failures commonly include `ZSYS_DUPLICATE_ID`,
`ZSYS_MISSING_TARGET`, `ZSYS_ROUTE_COLLISION`, `ZSYS_SCHEMA_UNAVAILABLE`,
`ZSYS_MAPPING_INCOMPATIBLE`, and `ZSYS_GRAPH_MANIFEST_MISMATCH`.

Development activation failures include
`ZSYS_CANDIDATE_GRAPH_HASH_MISMATCH`, `ZSYS_CANDIDATE_HEALTH_TIMEOUT`,
`ZSYS_CANDIDATE_PROVIDER_NOT_READY`, and
`ZSYS_CANDIDATE_GENERATION_MISMATCH`.

Deployment failures include `ZSYS_DEPLOY_CHECK_FAILED`,
`ZSYS_DEPLOY_GRAPH_INVALID`, `ZSYS_DEPLOY_BUILD_FAILED`,
`ZSYS_DEPLOY_CONFIGURATION_MISSING`, `ZSYS_DEPLOY_AWS_CAPABILITY_UNSUPPORTED`,
and `ZSYS_DEPLOY_SECRET_UNSUPPORTED`.

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
`.zsys/state`, `.zsys/observability`, `.zsys/generated`, or `.zsys/build`
directories. They are regenerated by the shipped commands, but deployment
state is separate and must be cleaned with the matching Pulumi stack command:

```sh
zsys deploy refresh --stack development
zsys deploy destroy --stack development
```

Use `zsys deploy destroy --non-interactive` only for an explicitly isolated
stack after reviewing the target. Verify cleanup independently.

## When asking for help

Include the command, exit code, diagnostic code, project-relative source
location, Bun version, and whether the failure is in development, tests, build,
or deployment. Share `zsys --json` output only after removing values that are
not already redacted. Do not share `.env`, Pulumi state, generated secrets, or
credential files.
