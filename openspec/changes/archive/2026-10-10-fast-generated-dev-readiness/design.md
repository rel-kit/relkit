## Context

See `proposal.md` for motivation and the six delta specs for the contracts. Current installed creation checks a staged sibling before atomic rename. Development checks in `dev-command-operation.ts` and again in `dev-local-compiler.ts`, then reconciles services and builds a server. Session startup waits for telemetry and inspector work before activation. Fullstack also runs `check` in its generated `dev` script before launching API/web commands.

The existing supervisor already verifies activation cohorts, owns a stable proxy, isolates generations, and drains the previous child. Explicit checking includes TypeScript diagnostics and custom route/event checks. The current pins are Bun 1.3.10, Effect 4.0.1, and TypeScript 5.9.3. Preserve those semantics and pins. The approximately seven-second observation has no reliable stage attribution; no estimated saving constitutes acceptance evidence.

## Goals / Non-Goals

**Goals:** make validated work reusable across creation relocation and process restarts; keep activation ownership and complete graph truth; isolate optional support startup; reject stale input without executing unchecked source; prove the promise with packed artifacts.

**Non-Goals:** a 500 ms promise for unvalidated edits, installation, cold Docker provisioning, arbitrary enlarged applications, or the Next web page; a new production pipeline; Bun upgrades or a Deno implementation; native-provider certification or paid cloud acceptance.

## Decisions

### 1. A single measured serving boundary

Start the external monotonic timer immediately before spawning the project's literal `bun dev` command. Stop after receiving and validating the complete first correct response through the public development address. Include Bun script dispatch, CLI loading, fingerprint validation, provider adoption, child startup, supervisor verification, route execution, and proxy switching. Nothing from command invocation to response is excluded.

Backend Ready follows successful candidate probing and public activation; a separate inspector message follows inspector readiness. A candidate probe alone is not the benchmark endpoint. For fullstack, measure API `/hello`; start web work independently without a blocking precheck. The ordinary printed command remains `bun dev`, so any competing web-process startup overhead remains in the measurement.

Alternative: reporting socket bind or a Next-style early Ready banner is cheaper but does not establish the user's serving contract.

### 2. Prepare after one successful check

Add explicit `relkit dev --prepare`, a finite preparation operation that does not start a session. Installed creation calls the same preparation operation with its existing successful development-check result before rename. For `--no-install`, print and test `bun install`, `bun run check`, `bunx --no-install relkit dev --prepare`, then `bun dev`. Preparation reuses a still-current check receipt when available; otherwise it runs a full development check. Explicit `relkit check` remains a full diagnostic operation with existing outputs and exit semantics.

Persist under `.relkit/dev/` using immutable content-addressed generations and an atomic current pointer. Store a versioned receipt, canonical graph and activation cohort, runnable Bun entrypoint, route import index, artifact digests, and an immutable copy of application execution inputs. Preparation may generate executable output; no bundle or evaluator runs on an unchanged launch. Production `.relkit/build` and user-owned `.relkit/state`/observability are separate.

All references are project-relative, with no staged absolute root, resolved secrets, live clients, or host/process/time-dependent identity. Node module resolution uses the final installed project. Verify preparation across stage rename and another project-root relocation. When package links or authored root-dependent behavior cannot be represented safely, reject snapshot eligibility and use full validation. Only combinations meeting the benchmark can remain offered.

Alternative: preparing on first `bun dev` leaves the first installed launch slow. Changing the meaning of `check` to skip validation would weaken the existing contract.

### 3. Validate bytes and the complete input set

The receipt contains schema/compiler/runtime/protocol versions, pinned Bun and TypeScript versions, normalized platform identity, source/configuration inventory, dependency identity, readiness contract, and composite activation fingerprint. Inventory includes added/deleted paths, imported helpers/assets outside descriptor conventions, app/config/tsconfig inheritance, package manifests, lockfile, patches, and applicable integration versions. Content hashes establish equality; timestamps alone cannot certify a hit.

Dependencies include resolved runtime package/export identity and executable content. Copy mutable application and linked/local dependency inputs into the immutable execution capsule or declare them ineligible. Check all inventoried input and artifact content hashes before accepting the snapshot, including deferred members; recheck deferred executable integrity before its first import to prevent later cache mutation. Lockfile or package/config identity changes invalidate the whole snapshot. A dependency byte mismatch cannot be hidden by an unchanged version label. Files, symlinks, path traversal, missing members, unsupported schemas, size limits, and malformed JSON are validated before using persisted paths or importing code.

Config evaluation that depends on undeclared environment, filesystem, network, time, or randomness is ineligible for reuse. Supported generated configuration uses symbolic environment contracts: resolve and validate current values at runtime without persisting them. No raw secret, secret-derived digest, or `.env` contents enter the receipt. Where private configuration cannot be separated from compilation, conservatively require full checking on each launch.

Hashes detect corruption and divergence, not an attacker who can rewrite the entire project and all receipts coherently. The snapshot is a local optimization under the same project-owner trust as executable source; it is not an authentication boundary for untrusted projects. Test artifact and receipt tampering, including inconsistent recomputed member hashes, before import or activation.

Alternative: mtime/lockfile-only reuse misses additions, preserved timestamps, mutable dependencies, and damaged artifacts. Full validation is the fallback when complete reuse cannot be established.

### 4. Small entrypoint and one validated result

Keep the `dev` dispatch import path small: select snapshot startup before importing evaluator/typechecker/bundler code. One validation operation returns a typed immutable result consumed by child startup, service reconciliation, and supervisor activation. Associate it with an input epoch; establish a watcher and recheck the epoch before switching so edits during validation cannot activate stale work.

The Bun adapter executes the prepared entrypoint directly. The candidate receives only its verified capsule, fresh runtime environment, generation identity, and reconciled override cohort. It cannot lazily import mutable working-tree modules. Mandatory environment, provider, auth/database, and worker registration remain readiness prerequisites. Healthy detached services are adopted using existing ownership/plan/health checks; optional support startup runs concurrently.

The supervisor preserves its state protocol: cached validated compilation occupies the candidate-validation portion, followed by starting, hash/readiness verification, switching, and bounded drain. It checks cohort/protocol identity plus a safe app-route probe before public activation. Generated probe routes are credential-free and side-effect-free, but execute the normal engine. General edited applications without a declared safe route use graph-serving readiness rather than probing a mutating route.

Alternative: spawning a backend outside the supervisor may look faster but loses atomic traffic switching, generation verification, and cleanup guarantees.

### 5. Lazy executable loading, complete eager validation

Prepare the complete canonical route table, contracts, middleware relationships, service ownership, integrations, and collision validation before certifying the snapshot. Partition executable imports using the compiler's verified dependency closure. Load the readiness route and its required middleware/functions/providers before probing; load unrelated route implementations on their first invocation.

Per-generation single-flight loading prevents duplicate initialization. Shared modules retain one module identity. Requests wait on their own route load with cancellation and the existing safe error mapping. Route ordering, auth, rate limits, request mapping, response validation, tracing, jobs/events, and required provider registrations remain unchanged. Retiring a generation owns and terminates pending loads; imports always reference that generation's immutable content. A failed deferred import produces a correlated diagnostic, never a placeholder success.

Alternative: lazily validating source after traffic arrives can admit invalid source. Deferring only executable materialization keeps validation complete and reduces startup imports.

### 6. Support services have independent readiness

Create a redacting in-memory event sink before candidate work. Default early retention is bounded by both 2,048 records and 2 MiB; limits and a five-second support-initialization deadline are declared configuration with bounded accepted ranges. Keep one owner for sequence assignment and persistence handoff. The persistence worker repairs/opens the normal store, drains early records in order, and then consumes live records without duplicates or a drain/live gap. Sampling stays downstream of local retention.

When full, discard the oldest retained record to admit the newest and increment dropped-record/byte counts outside the data queue. Emit one coalesced `RELKIT_DEV_EARLY_TELEMETRY_OVERFLOW` diagnostic with safe counts and incomplete-history status; preserve it until it can reach terminal and persistence/query sinks. Redaction precedes memory admission and size accounting. While storage is unavailable, query/live APIs expose bounded retained state and explicit persistence status.

Launch inspector and persistence as session-owned background fibers. Slow startup cannot gate backend serving; failure/deadline emits safe unavailable diagnostics and bounded retry behavior without restarting the backend. Inspector port conflicts affect its availability separately. Backend port conflicts fail startup with the existing port guidance and owned cleanup. Never print an inspector URL as ready until its probe succeeds.

Shutdown first stops new traffic, drains/cancels application work, then flushes retained telemetry within the existing bounded shutdown deadline. Stop/reap owned support children, watchers, readers, and fibers; preserve detached/user-owned services. Forced exit or exhausted flush reports incomplete telemetry rather than promising durability of unpersisted early events.

Alternative: waiting for storage/Next initialization serializes backend readiness. Dropping all early events would break correlated startup and first-request evidence.

### 7. Effect domain ownership and runtime adapters

Use services for snapshot preparation/validation, candidate execution, and support lifecycle. Bun-specific file/process/listener behavior belongs in injected adapters at the command boundary; domain contracts leave room for Deno without adding an implementation or upgrading Bun. Pure fingerprint/route planning helpers remain pure.

Every source create/update/edit must apply `$use-effect` and repository Effect guidance. Before each relevant pattern, inspect implementation, tests, and examples in read-only `repos/effect` and verify the installed pinned source. Include scoped acquisition/finalization, joined child fibers/processes, typed expected failures, preserved defects/interruption, runtime-configured redacted instrumentation, and deterministic test Layers. Audit each changed source file, not only the primary modules; enforce the skill's headers, documentation, function and file bounds. Do not install or edit inside `repos/effect`.

Alternative: Promise orchestration around native processes introduces duplicate ownership and makes cancellation harder to prove. A new checker does not help a validated fast path with no checking.

### 8. Capability evidence gates creation

Enumerate all valid normalized runtime-affecting combinations using the actual resolver: templates including fullstack, jobs variants, cloud/deploy selections, and examples on/off. Invalid combinations remain usage errors. Runtime-equivalent flags such as Git, JSON, and destination are covered by equivalence/relocation tests; installation mode is separately exercised through the documented post-install workflow. Do not sample combinations or silently discard a slow option.

A versioned packaged capability table maps each normalized tuple to exact release/tool/template evidence. Interactive options are filtered against current partial choices; headless defaults and explicit flags use the same table. Missing, failed, or stale evidence rejects the tuple before staging/install. Diagnostics name the rejected tuple and applicable supported choices. Jobs also retain existing native-certification restrictions; performance evidence never certifies native semantics.

Benchmark every currently valid candidate combination before deciding the shipping table. Each shipped tuple requires a 20-start fresh-created set (one first start per newly installed generated project) and a separate 20-start unchanged-restart set. Prestart required Docker services for both sets. Include install-skipped/post-install preparation equivalence and timing evidence. Default minimal failure blocks release; other failures hide and reject the tuple and require documented support removal. Template, dependency, executable, protocol, or tool changes invalidate affected evidence. Routine generic CI hosts run functional gates; only a controlled reference-host result certifies this timing promise.

Alternative: a median-only claim hides slow launches. Automatically allowing unknown tuples makes the promise impossible to audit.

### 9. Packed measurement and fault evidence

Use packed release packages installed outside the workspace with controlled executable resolution and no contributor inspector override. Run starts sequentially, with fixed tool versions, isolated project state, verified free ports, and process-tree cleanup between samples. Record hardware/OS versions, power/host load, Bun/TypeScript/package versions, lock/artifact hashes, commands, prerequisite health, clock endpoints, expected status/body, every attempt, and median/p95/maximum. Use nearest-rank p95; do not round before comparing `< 500 ms`.

Polling starts after t0 with a bounded interval of at most 5 ms; observed successful-response completion is t1 without subtracting polling, probe, script, or process overhead. Reject responses from prior children using the active generation/cohort proof. No warmup launch is discarded; do not delete required prepared snapshots or silently reuse a running application. Timeouts, early exits, wrong bodies, or cleanup failures fail the set and remain in raw evidence.

With examples, assert the actual generated greeting route; fullstack uses API `/hello`, jobs use their actual safe example route (currently `/health`) unless fullstack requires `/hello`. Without examples, query a protected development graph-serving readiness endpoint returning live generation, graph, route-table and activation identities only after the engine and required registrations are ready. Static JSON/liveness cannot satisfy this check.

Record cold Docker provisioning separately from t0; verify unavailable/changed/unhealthy required services block readiness correctly. Separately measure valid-edit fallback and prove invalid edits keep the previous generation active. Cover the fault matrix below with deterministic Layers and real packed lifecycle tests.

| Case                                                             | Required outcome / evidence                                                   |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Stage rename and second relocation                               | Same portable snapshot serves correct route without full checking             |
| Source add/delete/helper edit with preserved timestamps          | Snapshot miss; full checking; invalid source never activates                  |
| Config/tsconfig/lock/patch/package/runtime change                | Complete invalidation; safe diagnostic or successful new validated generation |
| Missing/corrupt/truncated/mixed snapshot, escaped paths or links | Rejection before executable import; owned safe fallback                       |
| Edit during hashing, rapid saves, concurrent preparation         | Obsolete epochs cannot publish/activate; latest valid state wins              |
| Deferred route concurrent load, failure, cancellation            | Single initialization, safe errors, isolated generation and joined cleanup    |
| Backend/inspector port occupied                                  | Backend fails cleanly; inspector degrades separately; no orphan children      |
| Child exits before/after readiness or reports wrong cohort       | No false Ready; existing active generation survives candidate failure         |
| Cancellation during prepare/start/switch/shutdown                | Atomic publication/switch; all acquired resources finalized                   |
| Delayed/failed inspector or telemetry, early overflow            | Route remains served; bounded redacted records; explicit loss/status          |
| Streaming traffic across reload and termination                  | Existing bounded drain and exactly-once completion preserved                  |
| Prestarted Docker lease/plan mismatch or service death           | Existing ownership/health gates enforced; no improper service adoption        |

## Risks / Trade-offs

- [Required imports or integrity hashing exceed budget] → profile the packed command before optimization, prepare work ahead of launch, and enforce tuple/default shipment gates without weakening verification.
- [Creating a snapshot costs more time and disk] → report preparation as creation work; keep disposable generations bounded while preserving generations still owned by active sessions.
- [Lazy loading changes first use of other routes] → test full route semantics and concurrent load failures; document first-use materialization independently from the readiness promise.
- [Telemetry can be lost before persistence] → expose explicit buffer/drop/persistence state and bounded flush; never claim complete durable history when overflow or forced exit occurred.
- [Control endpoint or route probe falsely reports success] → verify public responses and live cohort identities, exercise ordinary engine execution, and reject stale children.
- [An environment lacks reference hardware or provider prerequisites] → mark required timing evidence blocked; do not promote the capability table or claim the target passed.

## Migration Plan

1. Capture repeatable current packed baselines and the complete option inventory before changing runtime behavior.
2. Implement/test portable preparation, then the minimal startup path and verified lazy execution. Existing projects without snapshots fall back safely; preparation is opt-in outside creation.
3. Move support startup outside backend readiness and verify privacy/lifecycle behavior. Update generated scripts, printed commands, help, and executable guides together.
4. Run fault coverage and packed functional acceptance, then both 20-start sets for every candidate tuple. Package only passing supported tuples; default failure stops shipment.
5. Require focused tests, packed generator acceptance, `bun run prepush`, and strict OpenSpec validation with recorded outcomes before marking implementation complete.
6. Rollback restores the prior safe development path and generator workflow; snapshots can be ignored by older code. No production output or user-owned runtime state is deleted. Revoke timing claims and regenerate capability evidence for a reverted release.
