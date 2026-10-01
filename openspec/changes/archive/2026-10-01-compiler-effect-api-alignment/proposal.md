## Why

The compiler's current working tree already contains substantial Effect adoption, but several validation paths still throw expected errors through the defect channel, some boundary schemas are unused, and independently callable operations have uneven instrumentation. Completing this work against installed `effect@4.0.0-rc.115` will make composition, dependency injection, failures, and resource ownership reliable while preserving compiler outputs and legacy adapters.

## What Changes

- Review all authored compiler modules against the Effect and use-effect guidance, using the current staged, unstaged, and untracked implementation as the baseline.
- Keep named, lazy Effect operations as the domain implementation and synchronous/Promise functions as compatibility boundaries; eliminate internal execution adapters where composition is possible.
- Decode untrusted records and model applicable compiler contracts with Schema-derived companion types. Replace unchecked validation assertions with explicit success/failure states without changing diagnostic ordering or accumulating fewer issues.
- Return expected validation failures directly through tagged error channels. Preserve unexpected defects, interruption, and the explicitly supported normalization pass-to-diagnostic recovery policy.
- Give native services named operations, explicit implementations, and appropriate layer constructors. Retain scoped evaluator processes, readers, detector restoration, and atomic write ownership.
- Complete operation telemetry for standalone and composed calls, including bounded workload counts, outcomes, and monotonic durations, without capturing candidate output or duplicating adapter counts.
- Finish useful TSDoc contracts, checked examples, spacing, and colocated `.types.ts` companions. Add focused deterministic regression tests for the changed contracts.
- Evaluate each requested API family for actual applicability; retain ordinary finite indexes and pure calculations where appropriate rather than adding unrelated caches, queues, workers, or retries.

## Capabilities

### New Capabilities

None. This change extends the existing compiler and observability capabilities.

### Modified Capabilities

- `compiler-graph`: Define composable compiler Effect operation contracts, decoded boundary failures, and scoped native-operation ownership while retaining ordered diagnostics and legacy compatibility.
- `observability`: Define bounded compiler operation telemetry for standalone calls, composed workflows, and compatibility adapters.

## Impact

- Primary scope: `packages/compiler/src`, `packages/compiler/tests`, and existing compiler acceptance/type checks. Neighboring packages and CLI callers are compatibility consumers, not a broad refactoring target.
- Public compiler exports, legacy thrown/rejected values for supported failures, pass ordering, canonical bytes/hashes, evaluator protocol, activation rules, and content-aware writes remain compatible. Malformed package JSON gains an explicit typed boundary rejection instead of unchecked property access.
- No dependency upgrade, vendor checkout repair, artifact-version bump, new exporter, or cloud operation is planned. The root and compiler pin and installed package agree on `4.0.0-rc.115`.
- `repos/effect` is an incomplete local reference: its core Effect, Schema, Context, Layer, Clock, Metric, Config, Stream and synchronization modules/tests and package manifest are absent. Available upstream usages/tests will supplement the installed version's implementation and documented examples; missing evidence is recorded in the design.
- Existing compiler work remains user-owned and uncommitted. Implementation must inspect overlap before each edit and preserve the working tree.
