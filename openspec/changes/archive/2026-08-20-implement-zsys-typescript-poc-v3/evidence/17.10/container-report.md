# Checkbox 17.10 container evidence

## Result

`bun run test:container` passed with 3 tests, 0 failures, 19 assertions, and
exit code `0` in `1.70s`.

The first real image build exposed that the pinned `oven/bun:1.3.10` base is
Debian and provides `groupadd`/`useradd`, not `addgroup`/`adduser`. The
generated Dockerfile now reuses the base image's existing non-root `bun` user;
this removes a nondeterministic account-creation layer. Docker BuildKit image
timestamps are fixed with `SOURCE_DATE_EPOCH=0` for the reproducibility check.

## Image identity and reproducibility

The production context was built twice with no cache:

```text
docker build --no-cache --build-arg SOURCE_DATE_EPOCH=0 --tag <image-a> --iidfile <id-a> .zsys/build
docker build --no-cache --build-arg SOURCE_DATE_EPOCH=0 --tag <image-b> --iidfile <id-b> .zsys/build
```

Both image IDs were identical:

```text
sha256:16fa36766af3f607ed1126490d728c7996597ae4abdfb616b06675f374782e54
```

The pinned base resolved to
`oven/bun:1.3.10@sha256:b86c67b531d87b4db11470d9b2bd0c519b1976eee6fcd71634e73abfa6230d2e`.
Both images report `Created=1970-01-01T00:00:00Z`.

The lifecycle image used for the signal test was
`sha256:7cb9b4815470e82dc427389888474a660573a33fc1ce0fc8b8bd665e68903f14`.

## Runtime evidence

| Requirement                 | Evidence                                                                                                                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Non-root identity           | `uid=1000(bun) gid=1000(bun) groups=1000(bun)`; image `Config.User=bun`                                                                                                               |
| Contents scan               | `/app` contains only `application.graph.json`, `manifest.json`, `openapi.json`, and `server/index.js`; `.env`, `.zsys/state`, and `.zsys/observability` are absent                    |
| Liveness/readiness ordering | With `ZSYS_PROVIDER_READY_DELAY_MS=1000`, liveness returned `200`, first readiness returned `503` with `providerReady=false`, then readiness returned `200` with `providerReady=true` |
| SIGTERM admission stop      | During an in-flight request, a new request returned `503`                                                                                                                             |
| Drain/cancel                | The in-flight request connection closed with status `000`; the handler wrote `cancelled`                                                                                              |
| Telemetry flush             | The bounded flush hook wrote `flushed`                                                                                                                                                |
| Bounded exit                | Container exit code `0`; measured SIGTERM-to-exit duration `801ms` with a `500ms` drain bound                                                                                         |
| Signal configuration        | Image `Config.StopSignal=SIGTERM`, exposed port `3000/tcp`                                                                                                                            |

The delayed-readiness probe returned graph and manifest hash
`sha256:3bc6d305fcafab6dcb8602961dbaa0cfe3eb030a6b6f0c65900db1c4a7c03e0a`.

## Repository checks

| Command                                                                                      | Result                                                                                                            |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `bun run test:container`                                                                     | exit `0`; 3 pass, 19 assertions                                                                                   |
| `bunx prettier --check packages/cli/src/commands/build.ts tests/container/lifecycle.test.ts` | exit `0`                                                                                                          |
| `bun run verify`                                                                             | exit `0`; fixed fail-fast pipeline passed; one advisory Konsistent finding remains at `packages/cli/src/index.ts` |
| `bun run typecheck`                                                                          | exit `0`                                                                                                          |
| `openspec validate implement-zsys-typescript-poc-v3 --strict`                                | exit `0`                                                                                                          |
| `git diff --check`                                                                           | exit `0`                                                                                                          |

Docker Desktop `29.4.3` was used locally. No cloud registry push or external
deployment was performed.
