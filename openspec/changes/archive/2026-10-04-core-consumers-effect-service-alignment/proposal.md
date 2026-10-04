## Why

The core client, Inspector API, development supervisor, and testing utilities still own substantial asynchronous work through imperative state, Promise chains, timers, and manual cleanup. Aligning these packages with the existing Effect execution services will make ownership, cancellation, failure handling, and standalone operation telemetry consistent while preserving their public contracts.

## What Changes

- Apply `use-effect` to every authored TypeScript file under `packages/client`, `packages/inspector-api`, `packages/supervisor`, and `packages/testing`, including TSX, tests, helpers, declarations, and configuration. Review pure leaves and compatibility adapters as part of the scope; exclude generated output, dependencies, binaries, and vendor code.
- Group capabilities into cohesive Context Services with live and substitutable test Layers, named Effect operations, schema-derived models, tagged failures, scoped resources, structured concurrency, meaningful logs/metrics/traces, and complete TSDoc/type companions.
- Evaluate all 25 skill capability families against actual ownership and behavior. Use RcMap for shared resource leases and Cache for memoized values only where their pinned semantics preserve the existing contract.
- Preserve browser-safe client entry points, oRPC Promise/AsyncIterable and React APIs, Inspector authorization/cursors/redaction, last-known-good activation and public proxy origin handling, and deterministic testing helpers.
- Use one isolated implementation worktree, freeze shared contracts first, then run independent package lanes where useful. Integrate and validate in the requested order: client → inspector-api → supervisor → testing. Every phase ends with independent review of every TypeScript file changed in that phase, followed by fixes and re-review.
- Replay the existing regression demo and retained offline agent fixture tests against the actual candidate package builds, including origin handling, invalid-input status mapping, realtime iterator cleanup, and the complete commerce browser suite. Preserve historical demo evidence and record fresh outcomes.

## Capabilities

### New Capabilities

None. The services are an internal architecture change, not a new public authoring model.

### Modified Capabilities

- `observability`: Require independently callable client, Inspector API, supervisor, and testing domain operations to emit bounded, contextual execution telemetry and usable structured logs, with caller-owned sinks, fiber-local log levels, and preserved failure/interruption semantics.

Existing typed-client, development-inspector, and acceptance requirements remain compatibility gates; their transport, authorization, lifecycle, and persistence contracts are unchanged.

## Impact

Primary scope is the four packages and their tests. Necessary integration changes may include package manifests/exports, test-runner discovery, type fixtures, browser dependency checks, and shared browser-safe instrumentation. Add direct Effect dependencies only at the existing `4.0.0-rc.115` pin where required; do not upgrade Effect or oRPC or repair the reference checkout.

Implementation acceptance includes repository verification, focused real transport/lifecycle tests, bundle and performance comparison, and isolated replays sourced from `/Users/mustafaelsayed/Workspace/relkit-regression-demo`. Paid model calls and cloud deployment require separate authorization. This proposal creates planning artifacts; implementation and test execution follow through `openspec-apply-change`.
