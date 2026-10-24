# Historical implementation checkpoints

These are retained intermediate observations. See [current acceptance](stage-2.md).

# Stage 2 implementation evidence

Status (2026-10-23): **In progress; 3/29 acceptance tasks closed (11.1, 11.2, 12.1).**
Stage 1's accepted gate and historical evidence remain unchanged. This checkpoint
records implementation progress; it is not standalone-inspector or final-isolation acceptance.

## Current runtime checkpoint

The session-owned bridge and private descriptor service now exist in
`packages/inspector-api/src/connection/`. Authentication, host/origin checks,
project/session identity and generation mutation fencing run before forwarding.
Discovery files use private atomic no-overwrite publication and owner cleanup.
The CLI support service now owns that bridge instead of a Next/UI child. Candidate
credentials are session-local runtime inputs; accepted reloads retain the bridge,
failed candidates leave its target unchanged, and restart rotates credentials.

Observed runtime evidence:

- Private-file and bridge request tests: 15 Vitest cases passed.
- Real Bun bridge binding/forwarding/scope release: one native test passed.
- Real dev session: three native tests passed for disabled resource selection,
  failed/successful reloads, restart rotation and bind-failure degradation.
- The subsequent native dev run including existing backend lifecycle tests passed
  (see `dev-bridge-native-2.log` in the retained temporary log directory below).
- Capture redaction, stable replay/ACK, oversized-record progress, producer-loss
  coalescing, concurrent prefix ACK and current configuration have focused passes.
- The capture/bridge/tool/CLI TypeScript build passes. The latest CLI build also
  passes after removal of the retired UI/storage build entries.

Ordinary and prepared command composition now selects lightweight capture; their
storage startup paths have been removed. Disabled capture binds no ingress and
allocates no retention buffer. CLI ownership of Next, React, DuckDB, UI lookup,
UI child shutdown and persistent telemetry has been removed. A scoped external
packed probe now passes; the final candidate-wide matrix remains outstanding.

## Initial configuration checkpoint

S2.1 C1 was rerun against the current configuration/runtime changes: both files
passed, 22 tests total (`s21-c1-current.log`). This closes configuration task 11.1.
The real generated production test also passes (one case, 11 assertions,
`generated-production-isolation-2.log`): explicit development inspection and
legacy/internal environment overrides cannot emit or expose rich runtime,
actions or history routes. Core liveness and authenticated core graph still work,
the business route responds, and no descriptor or DuckDB file is created. This
closes 11.2. Regenerated-template certification (11.3) and later gates stay open.

## Standalone runtime checkpoint

The private UI is now `@relkit/inspector-ui`; the new publishable
`packages/inspector` is `@relkit/inspector`. Its built `relkit-inspector --help`
works, and its UI assets are produced under `packages/inspector/dist/ui`.
CLI builds no longer invoke the inspector packager. The CLI declares no UI/store
dependencies, and its producer prunes retired generated assets. Distribution
checks pass against these manifests/output; this is not external tarball proof.

The new tool owns discovery, collection, Node UI and the existing isolated DuckDB
worker. Native history testing passed for transaction-key replay deduplication,
competing-writer rejection, restart preservation and foreign-project rejection.
The actual built UI passed a native test which discovers a real bridge, reads its
live graph, reads committed redacted logs, restarts with history retained, and
leaves its application/descriptor alive when the tool stops. The frozen-worker
shutdown test also passes and joins actual process exit within five seconds.
Logs: `standalone-history-native.log`, `standalone-ui-native-2.log` and
`standalone-protocol-test.log` (21 focused tests) in the retained directory below.

The first UI launch failed because dereferencing the Next traced dependency tree
broke Node resolution of `@swc/helpers`. The producer now keeps the existing
flattened server layout and the tool owns its declared runtime dependencies.
That failed observation remains in `standalone-ui-native.log`. The initial frozen
worker test took eight seconds and failed its five-second assertion; the native
worker close path now has a four-second force deadline and joins child exit.
The failed observation remains in `history-shutdown-red.log`.

External tarball relocation, actual browser actions, full numeric-bound coverage,
Docker delivery, remaining fault cases, package/dependency reconciliation and the
full acceptance matrix remain incomplete. These native passes are scoped proof.

## Subsequent ownership and recovery checkpoint

The real generated minimal application now sends records through memory-only CLI
capture and the session bridge to the separate built tool. Its integration test
passes for correlated logs/traces, HTTP info/warning records, stable reload
identity, retained history after tool restart and backend service while the tool
is stopped (`generated-app-standalone.log`, 13 assertions).

- Exactly one MiB per subscriber, one-byte-over rejection, four-MiB aggregate
  backlog and reservation release pass with existing stream regressions
  (`stream-bytes.log`, seven tests). Full boundary matrix remains open.
- Browser controls retain their observed generation and never retry a lost
  mutation response (`ui-generation.log`, two tests).
- Private BFF authorization, server-selected targets, error adaptation, SSE
  invalidation/cancellation and target-origin containment pass
  (`backend-history-probes.log`, ten tests including history type probes).
- Native shutdown now closes response readers before the listener. The original
  abort failures remain in `ownership-shutdown-native-2.log`; the fixed native
  shutdown/drain/bridge run passes (`response-scope-native.log`, three tests).
- Native UI process exit, cancellation/reaping and environment isolation pass
  (`ui-process-native-2.log`). Readiness and CLI strict service probes pass
  (`readiness-service-probes.log`, six tests).
- Storage failures stop retrying after three openings, release partial leases and
  preserve typed failure/defect combinations (`mixed-cause-recovery-green.log`,
  seven tests). The original mixed-cause failure is in `relay-migration-proof.log`.
- Actual producer callbacks retain logger/correlation/metric context
  (`capture-context-native.log`); native JSON dev and remote oversize-loss
  behavior pass (`cli-json-producer.log`, two tests).
- Retired CLI telemetry/UI tests were replaced under their current capture,
  bridge and standalone history/process owners. Their old production modules
  were removed; no `.skip` or compatibility implementation was added.
- Prepared startup import closure, candidate rejection/traffic draining, external
  shutdown, source watch, logging and bridge config pass together
  (`current-prepared-ownership.log`, 15 tests/82 assertions).
- `bun run check` passes (`current-boundary-check-2.log`, 65 roots/5494 TS files).
  The fresh private UI build and standalone UI packager pass. Turbo now orders
  the UI build before packaging and includes both packaging producers in cache inputs.

## First external packed probe

The authoritative archive producer packed 56 packages under
`/tmp/relkit-stage2-probe-20261023-a1/artifacts`. The standalone archive is
`relkit-inspector-0.1.0.tgz`, SHA-256
`235ee3c2273a6b43fedcffd72d40741366ae79c6a021bf5f40a4b7e07677192a`.
The producer validates exact packed manifests, exports, required UI/static assets
and licenses, and rejects retired inspector payloads in the CLI archive.

`scripts/verify-standalone-inspector.ts` passes against those exact archives:
external Bun isolated installation; installed `bunx --no-install` and
`npx --no-install` help; actual packaged UI/native writer; live graph and redacted
history; cache removal/restart preserving identical history; tool uninstall with
the backend still serving. A separately installed CLI has no missing required
dependencies and zero forbidden dependency paths under the final policy with
zero exceptions. Its full physical graph is retained in
`/tmp/relkit-stage2-probe-20261023-a1/external-report/result.json`.
Log: `standalone-external-probe-a1.log` in the retained log directory below.

This is a scoped probe, not the final source candidate or the complete final
four-boundary measurement matrix. Later source edits require fresh final packs.
No registry publication or image publication occurred.

Private/public workspace identity task 12.1 is closed: distribution identity tests,
release binary/runtime/asset policy tests, actual package production, strict root
TypeScript and boundary checks pass. Turbo's scoped dry run verifies the tool's
build depends on `@relkit/inspector-ui#build` (`inspector-build-task-graph.json`).
The package README and Inspector guide now describe the explicit standalone owner.
The broader distribution/process/documentation acceptance tasks remain open.

## Initial configuration implementation

The application and compiler now share one lightweight schema/default owner in
`packages/contracts/src/inspector-config.*`. Omitted/false selection defaults off;
enabled selection defaults to bridge address `127.0.0.1:0`. The public type no
longer exposes a UI port or production inspection switch. Both configuration
boundaries reject obsolete `inspector.port` with correction guidance and reject
malformed selection, host, port and preview limits before session acquisition.
The decoder intentionally reports safe guidance without echoing rejected values.

Minimal/API/agent/fullstack/task template sources and lean sample configurations
omit inspection selection. Commerce explicitly uses `inspector: { enabled: true }`.
Documentation examples and the application README use the new configuration.
The template producer, rather than copied output, owns template regeneration.

Doctor checks backend ports and explicitly selected fixed bridge ports, ignores
standalone UI flags/environment, and leaves ephemeral bridge allocation to its
runtime owner. Native fixed-port checks bind the configured bridge host and join
listener cleanup. Existing CLI UI launch-option readers no longer reinterpret
application bridge ports as UI ports.
