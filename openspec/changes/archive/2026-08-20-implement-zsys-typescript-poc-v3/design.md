## Context

See `proposal.md` for motivation and `specs/*/spec.md` for behavioral contracts. The repository currently contains an unmodified Bun/Turborepo starter: `apps/web`, `apps/docs`, `packages/ui`, shared starter lint/TypeScript packages, root Turbo scripts, and the two approved v3 source documents under `docs/`. There is no ZSys compiler, runtime, public package, fixture, inspector, test harness, or deployment implementation to preserve.

The approved baseline is unusually broad and tightly coupled: public descriptors feed a compiler; the compiler emits a canonical graph and executable manifest; a pure planner feeds one invocation engine and multiple materializers; supervisor, inspector, generated clients, tests, and deployment must all agree with the same graph. A locally plausible implementation in one layer is insufficient if it bypasses that chain. The design therefore fixes package ownership, dependency direction, artifact identity, phase order, and review evidence before implementation begins.

The two v3 documents remain the normative source for detailed fields, file responsibilities, commands, required tests, and rejection conditions. `AGENTS.md` is the normative repository workflow while implementation is in progress and must be refreshed as soon as Phase 0 changes repository topology, commands, or verification truth. This design resolves how those requirements fit together; it does not modify the two approved v3 documents.

## Goals / Non-Goals

**Goals:**

- Give an implementer a single dependency-ordered architecture with no choice points that would change public contracts.
- Make the canonical graph the shared contract for runtime registration, inspector data, generated OpenAPI/client output, and deployment planning.
- Keep public application code portable and plain TypeScript while concentrating Effect, Hono, Next.js, Pulumi, and AWS in owned internal packages.
- Make every durable, security-sensitive, or generated behavior self-verifying through deterministic tests and phase-gate evidence.
- Allow a failed development candidate, provider startup, generation, project creation, deployment preview, or phase implementation to fail without corrupting the last known good state.
- Make every checklist item independently handoff-safe for a fresh Luna (max) implementation task without relying on chat history.

**Non-Goals:**

- Preserve starter `@repo/*`, `apps/web`, `apps/docs`, or their sample UI APIs; Phase 0 replaces them after retaining the approved `docs/zsys-*-v3.md` inputs.
- Collapse the v3 package topology into fewer packages or introduce extra abstraction packages; the approved ownership boundaries are fixed for this POC.
- Support multiple runtime, deployment, cloud, schema-default, or inspector implementations in the POC beyond the explicitly approved public compatibility seams.
- Start later phases against mocks of an unmerged prerequisite. Parallel work is allowed only inside one phase and only where file ownership does not overlap.
- Treat benchmark targets as acceptance thresholds before the first reproducible baseline exists.

## Decisions

### 1. Replace the starter in one Phase 0 topology change

Phase 0 removes the generic example apps/packages and creates all approved ZSys package shells, app shells, root test directories, scripts, template root, strict TypeScript references, export maps, boundary checks, CI, and ADRs. It preserves the approved v3 documents unchanged. Creating all shells at once makes dependency rules mechanically testable before runtime code exists and prevents later phases from inventing package ownership.

Alternative considered: evolve `apps/web`, `apps/docs`, and `packages/ui` incrementally. Rejected because none represents an approved ZSys responsibility, retaining their names creates ambiguous ownership, and workspace links could mask missing published-package dependencies.

### 2. Fix package and file ownership before coding

Ownership is as follows; a phase may edit another owner's public surface only when its task explicitly names the coordinated change and reruns both owners' tests.

| Owner                  | Paths                                                                                                                                                                  | Responsibility                                                                                                 |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Public foundation      | `packages/contracts`, `packages/schema`, `packages/config`, `packages/diagnostics`                                                                                     | JSON/IDs/locations/versions, Standard Schema bridge/default builder, value-free env DSL, diagnostics/reporting |
| Public descriptors     | `packages/app`, `packages/functions`, `packages/routes`, `packages/jobs`, `packages/events`, `packages/buckets`, `packages/cache`, `packages/tools`, `packages/agents` | Pure branded descriptor values, references, public clients/types, common re-exports                            |
| Compiler and graph     | `packages/compiler`, `packages/graph`                                                                                                                                  | Discovery/evaluator, normalization/validation, canonical graph/hash/diff, manifest and generated artifacts     |
| Execution              | `packages/runtime-effect`, `packages/engine`                                                                                                                           | Internal Effect services/scopes/logging/trace bridge and the single invocation/planning/materialization engine |
| HTTP contracts/runtime | `packages/runtime-hono`, `packages/openapi`, `packages/client-generator`                                                                                               | Hono materialization, internal HTTP endpoints, OpenAPI 3.1, generated TypeScript client                        |
| Local providers        | `packages/providers-local`                                                                                                                                             | Local/test bucket, cache, job, event, and scripted model implementations and opaque durable state              |
| Observability          | `packages/observability`                                                                                                                                               | Redaction, records, collector, bounded NDJSON storage/index/query/SSE                                          |
| Development control    | `packages/supervisor`, `packages/inspector-api`                                                                                                                        | Candidate generations, stable proxy/drain, versioned graph/runtime/control APIs                                |
| Inspector              | `apps/inspector`                                                                                                                                                       | Next.js API/SSE client and all required pages; no runtime/provider imports                                     |
| Fixture                | `apps/fixture-commerce`                                                                                                                                                | Complete cross-capability acceptance application; public imports only                                          |
| Developer tooling      | `packages/cli`, `packages/create-zsys`, `templates/default`                                                                                                            | `zsys`, `create-zsys`, atomic templates, packed artifact generation                                            |
| Deployment             | `packages/deploy`, `packages/deploy-pulumi`, `packages/cloud-aws`                                                                                                      | Provider-neutral plan, Automation API adapter, AWS components/runtime providers                                |
| Testing/release        | `packages/testing`, `tests/**`, `scripts/**`, `.github/workflows/**`, release/docs files                                                                               | Public harness, cross-package tests, deterministic verification and release evidence                           |

Alternative considered: one framework package with internal folders. Rejected because public/internal dependency leakage would be harder to prevent and the approved spec explicitly assigns independent package responsibilities.

### 3. Enforce a one-way dependency graph

The allowed direction is:

```text
public descriptors
  -> contracts / schema / config / diagnostics
  -> compiler + graph + generated manifest
  -> planner + engine
  -> runtime-effect + materializers + providers
  -> CLI / supervisor / inspector APIs / deployment
```

Package manifests and source imports are both checked. Public descriptor packages cannot import runtime packages; graph cannot import Hono/Pulumi; providers cannot mutate graph; deployment receives a plan rather than source; inspector consumes versioned HTTP/SSE protocols rather than live objects. Application/fixture/template source is denied direct imports from Effect, Hono, Next.js, Pulumi, cloud SDKs, and internal ZSys packages.

Alternative considered: rely on code review and TypeScript path aliases. Rejected because aliases do not prevent undeclared or deep source imports and the failure would recur across 17 phases.

### 4. Separate pure authoring metadata from runtime values

Every `define*` factory creates a deeply frozen, globally branded value with explicit stable ID/ref and serializable metadata. Functions alone carry authored handlers. Environment descriptors record rules, not resolved values. Property access such as `env.AWS_REGION` returns a branded `EnvRef<"AWS_REGION", Value>` token; provider configuration accepts only literals or those tokens, the graph records only the referenced non-secret variable name, and generation startup resolves the token from the immutable validated environment.

`localProviders`, `testProviders`, and `awsProviders` are pure provider-set declaration builders introduced with the public app contract. Their compiler snapshot separates JSON-safe capability/profile metadata from stable internal recipe tags. The graph receives only the metadata; the generated manifest contains deterministic factory slots, which Phase 7 binds to local/test factories and Phase 15 binds to AWS production factories. No provider builder imports a runtime, reads process values, or creates a client during application evaluation.

Route middleware preserves the function-only rule. `defineMiddleware` creates pure metadata with a stable `MiddlewareRef`, a normal target `FunctionRef`, and serializable request/decision mappings; it never accepts a handler. The target function receives a framework-neutral validated value and returns a declared continue-or-respond decision through `engine.invoke`, never a Hono context. A respond decision must select a response declared on the route and have schema-compatible data, so runtime, OpenAPI, and client output remain aligned. The compiler stores ordered middleware refs and target IDs in HTTP trigger config and generates manifest adapters from existing function handlers.

A named route transform is a stable ID bound to a Standard Schema-compatible validator/transform, not an arbitrary mapping closure. The graph stores the ID plus deterministic input/output schema projection; the manifest contains the executable validator in a `requestTransforms` registry. Duplicate IDs, missing refs, or unavailable deterministic schema projection are compile errors.

The Standard Schema boundary accepts compatible validators, while `@zsys/schema` owns the default familiar builder and deterministic JSON Schema projection. Unsupported third-party schema projection is a compile diagnostic rather than a fallback guess.

Alternative considered: registration side effects or global descriptor arrays. Rejected because evaluation order becomes observable, isolated compilation becomes unreliable, and tests can leak registration state. Alternative considered: expose Effect Schema as the primary contract. Rejected by the public plain-TypeScript boundary.

### 5. Use a two-stage isolated compiler and two output representations

The compiler first uses the TypeScript compiler API to find candidates without execution. A Bun child process then evaluates only candidates using a structured protocol, timeout, fixed project root, captured output, generation ID, source maps, and the subset of side-effect restrictions feasible in the POC. Evaluation returns descriptor snapshots plus executable-reference instructions.

Normalization/validation follows the 17 ordered passes in v3 Section 11.4. It emits:

- canonical, serializable `application.graph.json` for planning, UI, diffing, and deployment input;
- executable `runtime.manifest.ts` for handlers, provider factories, function-backed middleware adapters, and named request transforms;
- `diagnostics.json`, `openapi.json`, and `client.ts`;
- `deployment.plan.json` only when requested.

Canonical serialization removes ephemeral fields, normalizes source paths to project-relative `/` paths, sorts all keyed collections, and hashes the resulting bytes. Generated files are content-addressed writes and contain versions but no timestamps. Runtime activation verifies graph/manifest versions, hash, and handler/middleware/transform completeness.

Alternative considered: put closures in the graph. Rejected because JSON, inspector, hashing, and deployment would become unsafe/non-portable. Alternative considered: import all application modules in the main CLI process. Rejected because a bad module could corrupt compiler/supervisor state.

### 6. Compile routes and event listeners to generic triggers

Routes and `onEvent` bindings remain distinct authored descriptors and inspector views, but compilation emits generic `trigger` nodes with trigger-specific serializable config and one target function ID. Event `match`/`anyOf`/restricted `all` selectors expand against known event descriptors at compile time; providers route explicit ID/version pairs. There is no subscription descriptor, package, suffix, graph kind, navigation item, or generated file.

Alternative considered: provider-time wildcard matching. Rejected because providers could disagree, future unknown events would change runtime behavior without a graph change, and typed unions could not be generated deterministically.

### 7. Make planning pure and execution singular

A pure planner converts graph nodes to a sorted `RegistrationPlan`. Materializers construct providers and registrations only after plan creation. Every executable source calls `engine.invoke`; HTTP, job, event, tool, and agent code never calls a user handler directly.

The materialization sequence follows v3 Section 12.6: verify versions/hash; resolve env; construct providers; register functions; resources; queues; events; tools/agents; event bindings; schedules/consumers; routes; inspector APIs; readiness; activate. Shutdown reverses dependencies and stops admissions before release.

Alternative considered: let each materializer implement validation/error/telemetry around handlers. Rejected because behavior would drift across transports and fixes would need duplication.

### 8. Keep Effect inside one managed generation boundary

`packages/runtime-effect` owns Effect runtime construction, service tags, scope, failure algebra, loggers, tracing, clock, and fiber/AbortSignal bridging. `packages/engine` exposes plain Promise-facing invocation/context clients. A context operation re-enters the already active invocation bridge; it does not start an unrelated runtime/root trace.

Phase 1 implements the plain environment parsing/resolution contract and a private Effect Config adapter under an unexported `packages/config` internal path, matching the v3 Phase 1 dependency list. Phase 4 reuses the same pinned Effect version in `packages/runtime-effect`; neither the adapter nor any Effect type enters the public `@zsys/config` exports or declarations.

Handler sync return, Promise resolution/rejection, thrown declared error, cancellation, timeout, and defect are normalized once. Fiber interruption aborts the public signal. Child calls inherit the trace, earliest deadline, cancellation, scope annotations, and get a new invocation ID. Public declaration scans reject Effect symbols.

Alternative considered: `Effect.runPromise` per context method. Rejected because it loses parent scope/cancellation/trace and makes provider lifetime unmanageable.

### 9. Construct one global provider set per generation

`src/app.ts` selects development/test/production provider sets and logical profiles. After environment validation, the engine validates every referenced profile, constructs each provider once in generation scope, checks safe capabilities/readiness, and registers release. Descriptor identities and graph metadata remain provider-neutral.

Local providers use explicit state roots beneath `.zsys/state` and `.zsys/observability`. Bucket commits use temporary sibling files plus atomic rename. Cache keys use canonical JSON plus cache ID/schema version; per-key single-flight is generation-local. Jobs/events use append-only records plus atomic metadata transitions, leases, deterministic-clock retry scheduling, quarantine, and documented acknowledgement gaps. Reusable contract suites assert common semantics and explicit unsupported capability results.

Alternative considered: provider instance per function/resource. Rejected because readiness, lifecycle, caches, connection bounds, and durable ownership become inconsistent. Alternative considered: claim exactly-once using local locks. Rejected because process failure between handler success and acknowledgement necessarily permits redelivery.

### 10. Derive HTTP, OpenAPI, and client behavior from the graph

`packages/runtime-hono` sorts and registers HTTP triggers, applies framework/middleware guards, executes the serialized request mapping, calls `engine.invoke`, maps declared failures, records telemetry, and validates responses in development/test. Hono internals are never scanned for OpenAPI and never enter public handler context. Most tests use Hono's in-memory path; real Bun listeners are reserved for disconnect/stream/proxy cases.

`packages/openapi` and `packages/client-generator` consume the same graph contracts, so runtime route behavior, OpenAPI, client types, and inspector metadata can be compared directly in golden/integration tests.

Alternative considered: generate OpenAPI from live route registrations. Rejected because it makes Hono the source of truth and cannot represent target function/error/mapping contracts reliably.

### 11. Redact once before observability fan-out

All runtime components emit versioned records into one collector. Redaction and capture policy run before the collector admits data to memory; terminal/JSON sinks, append-only NDJSON segments, indexes, queries, SSE, inspector server rendering, and browser payloads receive only redacted records. Default bodies, authorization, cookies, binary content, env secrets, and model prompt/results are absent rather than merely hidden in the UI.

Storage is segmented by signal/day, rotated atomically, bounded by age/bytes, and repaired/quarantined on startup. SSE uses monotonic cursors with retained replay and bounded buffers/drop counters.

Alternative considered: redact independently in each sink. Rejected because one forgotten sink leaks secrets and tests must reason about many inconsistent policies.

### 12. Activate development generations through a stable proxy

The supervisor owns the stable developer port. Each source batch compiles to and starts from a generation-specific directory and dynamic backend port. Only a candidate that passes graph/manifest hash, internal protocol version, and readiness becomes the atomic active proxy target. Existing requests remain on the old generation until completion or drain timeout; candidate failure leaves the prior target untouched. A monotonically ordered source/generation token prevents stale candidates from winning after rapid saves.

Alternative considered: kill/restart the active backend on every save. Rejected because invalid source or provider startup would make development unavailable and erase the last valid inspector state.

### 13. Keep the inspector read-oriented and protocol-only

`packages/inspector-api` owns versioned graph, runtime state, observability, diagnostics, and carefully checked local actions. `apps/inspector` owns a generated/typed protocol client, cursor-based SSE reconnect, and the exact page set from v3 Section 20. It never reads application/provider files or imports runtime objects. Production disables or protects internal endpoints and disables local controls by default.

Alternative considered: Next.js server actions importing the active application. Rejected because it creates a second runtime, leaks executables/secrets, and can disagree with the active generation.

### 14. Build CLI and projects atomically from packed artifacts

CLI commands share compiler/runtime reporting and structured exit codes. `packages/create-zsys` stages a bundled, versioned template in a temporary sibling directory, substitutes a fixed allowlist, writes exact compatible versions, optionally installs/initializes Git, runs project doctor/check, and only then atomically renames to the destination. A failure before rename leaves the destination untouched.

Release smoke tests invoke the packed tarball outside the workspace, run frozen install/check/typecheck/test/build/dev, call the route/graph API, shut down, and scan source. This detects workspace-resolution success that would fail for users.

Alternative considered: write directly into the destination and clean up on error. Rejected because cleanup after package-manager/Git failure cannot reliably restore pre-existing content.

### 15. Insert a provider-neutral deployment plan before Pulumi

`packages/deploy` converts graph plus production image/config metadata into a pure versioned plan. `packages/deploy-pulumi` converts that plan to an inline or deterministic generated Pulumi program and drives the explicit stack with Automation API. `packages/cloud-aws` owns all production runtime providers and AWS components for this AWS-first POC. Graph and plan contain no Pulumi `Input`/`Output` or resolved secret.

The selected managed cache topology is ElastiCache Serverless for Valkey, accessed through the pinned Bun runtime's native `RedisClient`. The production model profile uses the v3 OpenAI configuration through a small `fetch`-based adapter owned by `packages/cloud-aws/src/runtime/models`. No Redis/model vendor SDK or extra provider package is added. A production graph that uses either capability fails planning before preview when its region/configuration is unsupported or incomplete.

Stable logical names derive from app ID, descriptor ID, and stack; source paths never contribute. Pulumi owns state through a user-selected supported backend. Preview performs checks/build/plan and writes a redacted report without cloud mutation. Update applies confirmation policy. Release-gated AWS runs must use unique ephemeral stacks and guaranteed destroy/cleanup evidence.

Alternative considered: generate raw CloudFormation/Terraform or keep parallel deploy adapters. Rejected because Pulumi is the sole POC decision and another engine/state path multiplies acceptance work.

### 16. Make checklist tasks and phase gates explicit iterator boundaries

Every checkbox ID in `tasks.md` is one bounded implementation unit and runs in a fresh same-directory Codex task using Luna with max reasoning. Before the first dispatch, the iterator creates and thereafter reads `PROGRESS.md`, `DECISIONS.md`, and `BLOCKERS.md` beside the change. Each handoff includes the exact task ID, relevant source sections, current diff/files, decisions, blockers, and checks; chat history is never evidence. A task records the smallest relevant runnable check before its checkbox is completed. Cross-owner edits rerun both owners' affected checks.

The iterator keeps `fix/implement-zsys-typescript-poc-v3` visible in the normal workspace and leaves unit edits uncommitted unless the user explicitly authorizes Git publication actions. This operational default does not weaken the v3 merge boundary: the last task of each phase is a fresh read-only gate review against a committed phase candidate, runs the corresponding review-gate reproduction from a clean worktree, records the candidate/base commit IDs and final `git status --short`, and assembles the required packet. The next phase cannot start until that evidence and candidate are merged into its baseline.

If the candidate is still uncommitted, commit/PR authority is absent, the gate worktree is not clean, or the prerequisite is not merged, the iterator records the concrete condition in `BLOCKERS.md` and stops instead of approving or chaining into the next phase. After user-owned or explicitly authorized commit/PR/merge work completes, a fresh coordinator verifies the merged prerequisite and resumes. This is the explicit reconciliation between the iterator's visible-uncommitted default and the source documents' clean-checkout/merged-prerequisite rule.

Every implementation unit also applies the repository quality contract: implementation files remain at or below 200 lines, public APIs and non-obvious invariants receive useful JSDoc/comments, the nearest README/spec and `AGENTS.md` stay accurate, and Prettier, ESLint, boundary, and configured structural checks are run where affected.

Alternative considered: one long uncommitted implementation branch with a final integration pass. Rejected because it cannot reproduce phase gates, prove merged prerequisites, or isolate failures across compiler/runtime/provider/inspector/deployment boundaries.

## Risks / Trade-offs

- [The approved POC is large enough for cross-phase drift] → Treat every gate as a merge boundary, keep one canonical graph contract, and require generated/runtime/inspector/deploy consistency assertions at the phases that add each consumer.
- [Many packages add setup overhead] → Create only the fixed approved shells, keep each export minimal until its owning phase, and forbid additional speculative abstraction packages.
- [Bun/Effect/Hono/Next/Pulumi version incompatibility] → Phase 0 selects compatible pinned versions in `bun.lock`; each dependency is introduced only by its owning phase and verified through clean frozen installation.
- [Child-process evaluation is not a perfect security sandbox] → Treat it as fault/side-effect isolation, restrict what is practical, time out and kill candidates, never run it with production secrets, and document detected versus unsupported side effects.
- [Promise-to-Effect cancellation can lose work or leak resources] → Centralize the bridge, cover every completion/interruption race, use one parent scope, and require cancellation plus release tests before any transport materializer lands.
- [Append-only local providers can corrupt state around crashes] → Use atomic boundaries, checksummed/versioned records where defined, quarantine malformed data, named failure injection, and child-process restart suites.
- [At-least-once delivery surprises users with duplicates] → Never claim exactly once; expose attempts/state/idempotency metadata and prove acknowledgement-gap duplicates in tests and inspector views.
- [Secret redaction can miss a newly added sink] → Admit only pre-redacted records to the collector and maintain one recursive synthetic-secret test that scans every sink and generated/deployment artifact.
- [Hot switching can route to an obsolete candidate] → Use generation/source tokens and one atomic target reference; candidates verify identity/readiness immediately before compare-and-switch.
- [Inspector scale or live streams can become unbounded] → Bound API pages, retention, graph rendering fixtures, SSE buffers/replay, and record the 1,000-node/stream latency baseline before optimization.
- [Generator passes only because of workspace links] → Pack first and test in a temporary external directory with frozen reinstall and source scan.
- [Cloud acceptance leaks cost/resources] → Use deterministic unique stack names, least privilege, time limits, `finally`-style destroy workflow, and a separate cleanup-verification record required by Gate 15/16.
- [Replacing the starter deletes sample files] → Phase 0 limits deletion to identified starter apps/packages/config, preserves normative docs, and makes rollback a single phase commit/revert before later work depends on it.
- [Fresh tasks lose implementation context] → Treat each checkbox as one unit and make the three change-note files plus exact commands/files the complete handoff contract.
- [Iterator Git defaults conflict with clean merged gates] → Stop at every phase boundary until a committed candidate is reviewed cleanly and its prerequisite merge is verified; never infer commit/PR authority.

## Migration Plan

This is a repository construction migration, not an in-place production rollout. Execute only through the dependency-ordered tasks and stop at the first failing gate.

1. Preserve and checksum the two approved v3 source documents; inventory the starter files, initialize the iterator change notes, and verify a clean worktree for implementation scope.
2. Phase 0 replaces starter apps/packages/config with the fixed workspace shells, lockfile, boundaries, quality/structural checks, CI, ADRs, fixture shell, accurate `AGENTS.md`, and placeholder ordered verification. Gate 0 proves the new baseline from a clean checkout.
3. Phases 1–3 establish public contracts/descriptors and the deterministic compiler/graph/manifest before any live runtime is introduced.
4. Phases 4–6 introduce the internal lifecycle, single function engine, Hono materializer, OpenAPI, and client. No later provider is allowed to bypass `engine.invoke`.
5. Phases 7–11 add global resources, durable jobs/events, tools/agents, and centralized observability in dependency order, including provider contracts and restart/failure evidence.
6. Phases 12–13 add last-known-good supervision, versioned inspector APIs, and the API-only Next.js UI.
7. Phase 14 adds CLI/scaffolding and proves the packed generated-project path.
8. Phase 15 adds the provider-neutral plan, Pulumi/AWS implementation, container verification, ephemeral AWS acceptance, no-op update, and destroy evidence.
9. Phase 16 reruns all product paths from clean/packed artifacts, records baselines/checksums, verifies docs verbatim, produces release notes, scans secrets/public boundaries/scope, and collects required sign-offs.

Each numbered step above is composed of fresh single-checkbox tasks. After each phase's implementation tasks, commit/review/merge authorization and the clean gate are explicit transaction steps before the next numbered step begins.

Rollback before cloud deployment is `git revert` of the failing phase while retaining earlier gate-approved phases; generated `.zsys/generated`/`.zsys/build` and local state roots are disposable and regenerated. Cloud rollback uses Pulumi preview/update against the last approved plan or destroys the explicit ephemeral stack; ZSys never edits Pulumi state directly. A failed candidate, project generation, preview, or pre-activation phase must leave the prior repository/runtime/destination/cloud state unchanged by construction.
