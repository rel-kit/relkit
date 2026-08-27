# Checkbox 17.9 E2E evidence

## Result

`bun run test:e2e` passed with 6 tests, 1 worker, exit code `0`, and reported
duration `12.0s` on the final run. The run exercised the deterministic commerce
fixture and the versioned inspector backend.

The first direct invocation exposed the existing Bun/Next development-startup
limitation: this repository intentionally has no `@types/react` or
`@types/node` workspace dependency, and Next attempted an automatic Yarn
install before its web-server timeout. For the successful run, a temporary
external-types directory at `/tmp/relkit-e2e-types-17-9` supplied
`@types/react@19.2.18` and `@types/node@26.2.0` through temporary symlinks under
`apps/inspector/node_modules/@types`. The symlinks and directory were removed
after the run; `package.json` and `bun.lock` were unchanged.

## Fixture identity and coverage

| Required flow                  | Evidence observed                                                                                                                                                  |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Active graph identity          | `sha256:commerce-inspector-fixture-v1`; active generation `commerce-generation-1`                                                                                  |
| Required top-level pages       | `/`, `/graph`, `/routes`, `/functions`, `/jobs`, `/events`, `/buckets`, `/cache`, `/tools`, `/agents`, `/requests`, `/logs`, `/traces`, `/env`, `/diagnostics`     |
| Required detail pages          | Route, function, job, event, bucket, cache, tool, agent, request, and live trace detail pages all rendered their semantic headings                                 |
| Live request                   | POST `/orders` appeared without reload as `request-live-0002`; request detail showed `orders.create` and `prices.getOrSet`                                         |
| Live log and trace             | Logs rendered `Order request completed.` with a trace link; traces rendered `trace-live-0002`; its trace detail page rendered                                      |
| Candidate failure preservation | Invalid candidate `commerce-candidate-2` appeared beside the still-visible active generation and graph hash `sha256:commerce-inspector-fixture-v1`                 |
| Event terminology              | Event detail rendered `Listeners`, `Event listeners are generic triggers`, and no text matching `subscription`                                                     |
| Job action                     | Dead-lettered fixture job opened the confirmation dialog and `Retry job` changed state to `available`                                                              |
| Function relationships         | Function detail rendered declared and observed edges, including `cache.get`                                                                                        |
| Agent tool timeline            | Agent detail rendered `Model and tool spans` and `orders.get.tool`                                                                                                 |
| Source links                   | Route detail rendered project-relative `src/routes/create-order.route.ts:3:1` with `vscode://file/src/routes/create-order.route.ts:3:1`                            |
| Responsive/accessibility flow  | At `390x844`, the main region, `Skip to content`, labelled composer controls, and `Send request` were usable; no horizontal overflow was present                   |
| Boundary safety                | Network payloads contained the `relkit.inspector` protocol and no forbidden payload values; bundle scan covered 96 browser and 470 server files with zero violations |

## Implementation notes

- The inspector SSE response now emits an immediate `: connected` comment so
  the browser can establish the live stream before the first event is
  published. The observability unit tests consume that heartbeat explicitly.
- Bucket UI models now translate their singular view kind to the versioned
  `buckets` graph/runtime collection for list and detail requests.
- Bundle scanning accepts the current Next development output layout under
  `.next/dev` while retaining the legacy `.next/static` and `.next/server`
  paths.

## Additional gates

The final `bun run verify` passed in fixed fail-fast order, including typecheck,
inspector API tests, build, generated-file no-diff, and security checks. The
configured Konsistent audit retained its known advisory finding at
`packages/cli/src/index.ts`; it did not fail verification. Focused Prettier,
`git diff --check`, and `bun run typecheck` also passed. The protected v3 source
document checksums remained unchanged.
