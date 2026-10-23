# Historical Stage 1 implementation attempts

This retained record predates the current implementation. Its completion and
unstarted-work statements describe those earlier attempts only. Current status
and acceptance results are recorded in [stage-1.md](./stage-1.md).

Status: **implementation resumed; acceptance gate incomplete**. The user explicitly overrode resource admission for this resumed run. Stage 2 has not started. Earlier observations below remain historical evidence.

Implementation began on 2026-10-21 in the requested checkout, initially at
`3ee9e7b6393951ec12ed310233a7d93d24aefba4` on `main`. The only pre-existing dirty
path was the untracked OpenSpec planning directory. No commit, push, publication,
cloud operation, application-data change, or migration operation was performed.

## Completed observations

- OpenSpec `status` and `instructions apply` report the `spec-driven` schema,
  ready state and 0/68 implementation tasks complete. All 16 returned context
  files were read, including all thirteen delta specifications and both stages
  of the design. Planning completeness is not implementation evidence.
- The first ownership inventory recorded 61 root/package/app/starter manifests,
  268 direct third-party declarations, and 74 declarations with references in
  current emitted `.d.ts` files. The collector was subsequently extended to
  include four repository examples and the embedded CLI editor manifest. The refreshed
  inventory records **66 manifests, 293 direct third-party declarations and 74
  declarations with emitted references**. Main/module/types entrypoints are
  retained alongside exports and executable bins.
- The creator-only external fixture installed exact candidate packs through the
  existing release registry and a measuring proxy. Cold and warm observations
  agreed: **18 physical packages, 14,554,325 compressed archive bytes,
  79,525,121 logical installed bytes, 95,551,488 allocated file bytes, zero native
  binaries, and zero missing required edges**. Cold installation took
  4,081.456875 ms and transferred 14,554,325 bytes; warm installation took
  103.660417 ms and transferred zero bytes. These timings are observations,
  not performance certification. Compressed bytes count unique archives;
  allocated bytes use `stat.blocks * 512` and do not establish APFS clone sharing.
- Actual creator closure includes compiler and TypeScript. It is baseline cost,
  not proof of the intended lean creator.
- Raw run reports are indexed by `baseline.json`. Each report records source
  manifests, entrypoints, scripts, dependency roles/owners, emitted declaration
  references, installed versions/physical paths/edges, cache conditions, samples
  and final-policy findings. Source declaration references are not consumed-type
  proof. The production-only install fixture is not relocated production proof.

## Current implementation

`scripts/benchmark-consumer-install.ts` reuses existing release packing and
candidate-registry validation. It separates compressed archives, physical
installations and network transfers, measures cold/warm installs serially, and
retains failed/incomplete evidence. Successful owned installation/cache trees
are released after measurement; failed roots are retained for diagnosis.

`scripts/check-consumer-dependencies.ts` requires independent installation,
evaluation, declaration and artifact evidence. Missing boundaries fail. The
Stage 1 policy accepts only exact measured legacy-inspector paths; the final
policy ignores temporary exceptions. Merely listing an agent SDK as an exception
cannot admit it. Selected capability admissions also require exact paths.

The installed-closure collector uses importer-context native package search
paths, rejects external symlinks, records shared incoming edges, measures each
canonical directory once, excludes nested `node_modules` from parent file bytes,
and retains native binary filenames. It reports representative full paths plus
the complete encountered physical edge graph; it does not enumerate every
combinatorial path through shared/cyclic graphs.

## Resource limits and retained failures

The host has 10 logical CPUs and 16 GiB memory. Before the first heavy operation,
load was approximately 5 and reported free memory was 34%, with substantial
compressed memory. The incremental TypeScript package build ran serially at
lower scheduling priority with a supported Node 768 MiB heap ceiling and passed.
Bun package-manager native memory is not bounded by `NODE_OPTIONS`; its install
network and script concurrency are explicitly limited to one and native pressure
is monitored separately.

The wrapper baseline began at 2026-10-21 02:49:45 UTC. During that installation,
macOS `kern.memorystatus_vm_pressure_level` reached **2 (warning)**. The benchmark
parent and its owned install child were terminated gracefully; both were verified
absent afterward. The original raw log is retained. The interrupted aggregate
report was not written by the initial implementation. A regression fix now masks
only final report publication while restoring cancellation during measurement;
tests verify interruption and mixed typed-failure/defect evidence survives.

The admission check now defers new heavy work on warning pressure, CPU load at
or above available capacity minus one, or less than 4 GiB available disk space.
No unrelated process was stopped and no system-wide setting was changed.

## Verification executed so far

| Command                                                                                                                                              | Observed result                                                                              |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `openspec status --change lean-installation-and-standalone-inspector --json`                                                                         | Ready planning artifacts; implementation 0/68                                                |
| `openspec instructions apply --change lean-installation-and-standalone-inspector --json`                                                             | Read all returned context                                                                    |
| `node node_modules/typescript/bin/tsc -b --pretty false` with `NODE_OPTIONS=--max-old-space-size=768`, `nice -n 10`                                  | Passed incremental package build                                                             |
| Scoped `tsc --noEmit --strict --module esnext --moduleResolution bundler --target es2022 --types bun --skipLibCheck` over new executable entrypoints | Passed again after final runtime edits; external strict declarations remain unverified       |
| Vitest single worker: consumer accounting, physical-install, ownership, independent-boundary, resource-admission suites                              | 26 passed in a final combined single-worker run                                              |
| `bun test scripts/tests/consumer-registry.test.ts`                                                                                                   | 1 passed, including metadata URL routing through measurement                                 |
| `bun test scripts/tests/consumer-report.test.ts`                                                                                                     | 3 passed: cancellation, mixed Causes and original failure retained when report writing fails |
| `bun scripts/benchmark-consumer-install.ts --stage baseline --inventory-only`                                                                        | Initial source inventory retained                                                            |
| `bun scripts/benchmark-consumer-install.ts --stage baseline --fixtures creator-only`                                                                 | 2 measured samples; gate explicitly false                                                    |
| Wrapper/minimal/API/production/client/agent baseline batch with reused artifacts                                                                     | Stopped during wrapper install for warning pressure; remaining rows incomplete               |

## Source authority and use-effect review

The OpenSpec apply skill, use-effect entrypoint and all four binding references,
its required Effect/code-simplification prerequisites, repository Effect and
konsistent guidance, and applicable services/errors/concurrency/lifecycle/testing/
documentation references were read before their corresponding work.

The installed Effect version is **4.0.1**, matching the root catalog. The read-only
`repos/effect` checkout is sparse: core `Effect.ts`, `Context.ts`, `Layer.ts`,
`Data.ts` and their core tests, plus `.agents/AGENTS.md`/`LLMS.md`, are absent.
Installed implementations and examples were inspected instead; version-matched
[Context tests](https://raw.githubusercontent.com/Effect-TS/effect/effect@4.0.1/packages/effect/test/Context.test.ts),
[Layer tests](https://raw.githubusercontent.com/Effect-TS/effect/effect@4.0.1/packages/effect/test/Layer.test.ts)
and [Effect tests](https://raw.githubusercontent.com/Effect-TS/effect/effect@4.0.1/packages/effect/test/Effect.test.ts)
provide the disclosed upstream fallback for service/layer construction, finite
Promise adapters, serial traversal, acquisition/finalization and interruption
masking. Installed compatibility remains authoritative.

Pure accounting/policy/classification code stays pure. Filesystem and package
manager work is lazy Effect work; the measuring registry is a scoped native
HTTP adapter. The benchmark captures existing process authority through its
Context service and Layer. Actual configured operation logging was observed in
the baseline. The final per-file review and service substitution checks are recorded below.
The incomplete fixture matrix and other required boundaries prevent task completion.

## Reproduction and pending gate

Build required candidate output before packing. The benchmark deliberately does
not trigger a broad build itself. The initial run used current incremental
TypeScript output and existing CLI-packaged UI assets; it does not certify a
fresh inspector UI build. Reuse exact packs with `--artifacts <directory>` from
the retained report. Narrow cost with `--fixtures creator-only` or another
listed fixture; omitted rows remain explicit. Managers are selected explicitly
with `--manager bun`, `bun-isolated`, `npm`, or `pnpm`; no manager is downloaded.
Observed installed manager versions are Bun 1.3.10, npm 11.19.0 and pnpm 11.9.0;
Bun creator and generic-client measurements have completed; other layouts remain incomplete.

No temporary legacy-inspector path is admitted yet: the exception set remains
empty until actual transitive installed and packed paths are enumerated and
versioned. Intended roots remain exactly those listed in design S1.1: CLI UI
Next/React/React DOM, exact traced `dist/inspector/` files, and explicit CLI to
local-store to DuckDB ownership after extraction. App observability, generic
client frontend paths and agent execution in tooling are never exemptions.

S1.1 is incomplete. S1.2–S1.10 have not started. SDK ownership moves, requirement
metadata/preflight, runtime lifecycle/storage extraction, creator isolation,
strict external declarations, relocated native production, the complete manager
and functional matrix, docs/examples/skills/release reconciliation and final
per-file review remain required. The active release-readiness change is
untouched; functional acceptance and strict performance certification remain
independent. Stage 2 remains unchecked and inadmissible.

Drizzle patch SHA-256 remains
`10ea188b9409dd19aac7bf27f4b12911ae4844c063362b9c2bd11d6a3d936374`.

## Final observations for this partial implementation

The latest creator run used refreshed candidate packs and the corrected hardlink
accounting. Cold and warm observations agree on **18 physical packages,
14,554,330 compressed bytes, 79,525,134 logical installed bytes and 95,551,488
allocated file bytes**. Cold installation took 4,396.713625 ms and transferred
14,554,330 bytes. Warm installation took 117.208417 ms and transferred zero bytes.
Earlier pack measurements remain retained; their small differences are not
reported as a size reduction.

The generic server client measured **32 physical packages, 10,998,014 compressed
bytes and 60,734,255 logical installed bytes** in both conditions. Cold/warm
installation took 23,382.43575/81.400333 ms and transferred 10,998,014/zero bytes.
Its actual closure includes React 19.3.1 and TanStack query-core/react-query
5.104.5 through existing broad peers. The allocated-byte field in this historical
report precedes the hardlink correction; logical/archive counts are retained as
observed. This is evidence of the current unwanted graph, not a corrected client.

The first production-only attempt failed because stale packed creator templates
requested app/testing 0.7.9 and CLI 0.7.10, while the candidate registry served
app/testing 0.7.10 and CLI 0.7.11. The registry refused unrelated-version fallback.
The failure remains recorded. The existing template producer regenerated derived
bytes, and exact release packs were regenerated. The refreshed production-only
attempt reached warning pressure and was gracefully interrupted. Its aggregate
failure report was saved by the corrected reporter. Parent and install-child
PIDs were verified absent. Raw logs are `wrapper-interrupted.log` and
`production-interrupted.log`.

The actual recorded client report was checked with:

```sh
bun scripts/check-consumer-dependencies.ts --stage baseline --evidence docs/evidence/lean-install/baseline-relkit-consumer-install-coOZwk.json
```

The command exited **1**, retaining forbidden installation paths and marking
evaluation, declarations and artifact evidence incomplete. It did not convert
baseline failure into Stage 1 success.

The final scoped TypeScript check included both new executable entrypoints and
all eight new test files, after the last runtime edits. It passed with the
supported Node 768 MiB heap limit. Vitest ran 26 focused cases with one worker;
Bun ran four registry/report cases. The actual fixture service was exercised
through substitutable process and resource Layers, including real filesystem
and report writes with no downloads, and rejected resource admission that never
calls the process adapter. A separate live resource-monitor invocation produced
the configured Info completion log and actual native headroom data.

All **36 added authored TypeScript files** were reviewed through EOF by their
implemented responsibility: pure policy/accounting/classification, schema/type
contracts, finite native filesystem/registry adapters, serial fixture/report
workflows, executable boundaries and tests. Final AST checks found maximum
**162 physical file lines** and **49 nonblank/non-comment function-body lines**.
No authored `unknown`/`any` annotations or unchecked type assertions remain.
Generated JSON/log evidence, package build/template output, dependencies and
read-only vendor source are excluded from authored-source limits and retain
their producer provenance. Headers, callable/error contracts, E/R propagation,
bounded ownership and original outcome preservation were reviewed. Source
observations and focused checks do not establish the unrun stage requirements.

The generic client, source inventory, registry accounting and creator repeats
are local evidence. Root-wide acceptance, strict external declaration
consumption, the remaining fixture/manager matrix, relocated native production,
browser/Docker acceptance, hosted CI, publication and registry certification are
not established. No SDK ownership changes from S1.2 onward have started. All
39 Stage 1 and 29 Stage 2 tasks remain unchecked. The active separate
release-readiness change, application data/migrations/history, Drizzle patch
and tracked source files remain unchanged. Elapsed work for this partial run
was approximately 33 minutes.

## Resumed implementation on 2026-10-21

The previous resource-stopped runs remain retained. With explicit operator admission override, the remaining original baseline matrix completed: `baseline-relkit-consumer-install-hnfF3B.json` contains 30 successful samples across 15 fixtures, and `baseline-relkit-consumer-install-dw05Jq.json` contains six successful samples for Inngest, Trigger and Effect MQ. Combined with the prior creator and generic-client observations, every original baseline fixture has cold/warm observations. These use the retained `591XCt/artifacts` archives, not newly built implementation packages. Later source inventories can differ from those historical archives; actual packed manifests identify the installed candidate.

The old minimal development fixture installed 380 physical packages and 731,050,304 logical bytes. Its production-only fixture installed 55 packages and 251,481,777 logical bytes cold; its warm observation differed slightly (251,490,410 bytes) and is retained without normalization. Both contained native DuckDB. Wrapper, API, agent and individual integration raw observations retain paths, versions and native files. All 36 resumed samples report no installation failure. This is baseline evidence, not a passing isolation gate.

Accounting/policy C1 passed again (10 tests). S1.1 tasks 1.2 and 1.3 are now checked. Source ownership reconciliation and exact Stage 1 inspector-path admission remain open.

Current implementation checks: shared dependency metadata nine tests passed; metadata producer three tests passed; selected dependency service four tests passed; graph agent/deep selection four tests passed. Client strict declaration cases six passed, owning client suite 34 passed and six Bun transport/hydration cases passed. Lifecycle implementation and tests moved from CLI to engine; all 28 existing lifecycle tests passed. These focused checks do not yet close their whole task groups or Stage 1.
