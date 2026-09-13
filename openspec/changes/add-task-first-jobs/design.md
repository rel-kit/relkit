## Context

See [proposal.md](proposal.md) for motivation. The implementation baseline is `ebae8ff03ef6fb306d7384eef69eba2d3ec3838a` (inspected 2026-09-13), not the older cloud checkout. Only the supplied plan was dirty at proposal start. This change is the sole implementation contract; the source plan is provenance and is not required to implement, test, or review it.

The complete behavioral and technical contract is incorporated below. Sections 1–18 retain stable section numbers for traceability. The specifications retain TJ-001–TJ-045; the fault matrix retains F01–F28. All ten phases are tasks within this one change. The requirement to create a separate OpenSpec change per phase is superseded by the user's request for one authoritative change.

## Goals / Non-Goals

**Goals:** Freeze public names, ownership, serialization, native semantics, compatibility, and acceptance gates before implementation. Use existing compiler, invocation, provider, client, Inspector, local-service, and release systems. A capability rejection is preferable to a different meaning for the same API.

**Non-Goals:** No provider operations during proposal creation. No workflow/checkpoint engine, cross-provider migration, second job-state binding, wholesale Effect upgrade, replacement of event delivery, or replacement of agent persistence. Optional direct-native browser transport remains an extension; the authenticated server proxy is the required release path.

## Decisions

### 0. Repository resolutions and API freeze

The decisions in this section close gaps in the supplied brief. They are normative refinements of the numbered contract below, not optional suggestions. Implementation may split internal files to respect the 200-line limit, but MUST NOT choose alternate public packages, API names, schema semantics, or ownership. Native verification can mark a capability unsupported; it cannot silently weaken a required release gate. If no native mapping satisfies a mandatory guarantee, record a blocker and revise this change explicitly before changing the contract.

#### 0.1 Repository findings and exact integration points

| Current source | Finding | Required resolution |
| --- | --- | --- |
| `packages/jobs/src/define-job.ts`, `client.ts`; `packages/functions/src/{types,clients}.ts` | Jobs currently own input/retry and function target; the client only exposes enqueue and returns instanceId/profile/status. | New task/job contracts and trigger path coexist with explicitly gated legacy descriptors; do not relabel the old receipt. |
| `packages/engine/src/materialize-jobs*.ts`, `job-client.ts` | Old execution invokes the function engine, owns retries/leases, and uses local admission. | Keep it exclusively for legacy jobs/events; native task adapters enter a task engine with no outer retry loop and no local-only concurrency claim. |
| `packages/contracts/src/{id,descriptor}.ts`; `packages/compiler/src/discovery/{ast-prefilter-utils,evaluator-snapshot,extract}.ts` | Kind tables and evaluator snapshots need task support; exported source bindings already exist. | Add task kind, handler/schema snapshots, canonical export origin, and descriptor identity deduplication end to end. |
| `packages/compiler/src/normalize-reference-index.ts`; `packages/graph/src/{model,graph-validation,registration-plan}.ts` | A global ID index rejects equal task/job IDs; edges currently carry bare graph IDs. | Use separate task/job reference indexes and distinct graph IDs, as fixed in 0.2. |
| `packages/app/src/{define-app-types,define-app,app-validation}.ts`; `packages/provider/src/{protocol-types,binding-normalization}.ts` | Provider capability and public key are singular job. | Normalize plural jobs/defaults.jobs to existing job/profile metadata once. |
| `packages/functions/src/function-descriptor-types.ts`; `packages/invocation/src/dispatcher-{scope,types}.ts`; `packages/engine/src/dependencies.ts` | Managed dependencies omit tasks; events use publishes/EventRegistry; AsyncLocalStorage already owns execution scope. | Add task/job submission to this scope, preserve publishes, recreate worker context and detach accepted lifetime. |
| `packages/services/src/{define-service,types,guards}.ts`; compiler `normalize-domains.ts`, `normalize-boundaries.ts`, `normalize-reference-index.ts`, `normalize-graph-services.ts` | Domain services flatten function/event members and enforce source-domain ownership. | Add task/job members across every map, guard, identity binding, domain pass and graph projection. |
| `packages/schema/src/{schema-impl,json-schema,standard-schema,schema-metadata}.ts` | transform drops projection metadata; generated contract validators are type witnesses, not security validators. | Preserve input/output projection provenance and require a real identity-preserving canonical validator; see 0.5. |
| `packages/compiler/src/{generate-manifest,generate-manifest-format,generated-artifacts,context-registry}.ts`; `packages/contracts/src/version.ts` | Compiler outputs and executable manifests are versioned/cohort-checked. | Add jobs artifacts to the same write/hash/activation cohort, not a loose second manifest loader. |
| `packages/client-generator/src/{generate-contract,generate-registry,generate-agent-procedures}.ts`; `packages/client/src/{index,react/procedure,react/finite-hooks,react/keys,react/pending}.ts` | Nested agent entries exist; route helpers look up only root string keys. Any ORPCError currently clears pending writes. | Add nested jobs and explicit selector paths; preserve unknown job submissions even when represented as ORPCError. |
| `packages/runtime-hono/src/{rpc,rpc-websocket,client-contract,client-identity,rpc-identity,transport-security,client-authorization}.ts` | Existing /rpc, client handshake, identity and transport protections are shared. | Add jobs procedures to both transports and handshake without changing agent protocol or route keys. |
| `packages/inspector-api/src/runtime.ts`; `apps/inspector/app/jobs/{jobs-client,job-detail-client}.tsx`; `apps/inspector/lib/jobs-model.ts` | Jobs UI already exists and loads an unpaged runtime list to compute queue counts. | Replace new-job list/run paths with bounded jobs queries; keep legacy display separate. |
| `packages/local-service/src/recipe.ts`; `integrations/packages/local/src/runtime/{reconciler,lease,service-state}.ts`; `integrations/packages/docker/src/runtime/docker-materializer.ts` | Existing recipe represents one container and one optional volume; reconciler and lease ownership are already present. | Extend those owners to a versioned composite DAG; do not add a competing compose daemon or lease store. |
| `scripts/boundary-directions.ts` | Integration protocol allowlist does not include jobs or engine. | Add jobs as a protocol owner; integrations import jobs/adapter, never engine. Generated workers inject the engine executor. |
| `packages/runtime-effect/package.json` and installed Effect source | Bun is 1.3.10, TS 5.9.3, Effect 4.0.0-beta.107; installed duration API is fromInput/fromInputUnsafe/toMillis. | Use installed Effect after strict public validation; do not paste Effect v3 decode APIs. |
| `apps/docs/{package.json,docgen.examples.json,scripts/generate.ts}`; `packages/create-relkit/src/{options,scaffold-catalog,provider-planning-definitions}.ts`; `.changeset/config.json` | Generated docs, add/scaffold catalog, fixed package versions and existing job pages are already present. | Extend generators/catalog/fixtures and fixed release cohort; preserve current no-cloud defaults and redirect old jobs pages. |

All paths in this table are repository-relative. The application conventions are `src/<domain>/tasks/*.task.ts`, `src/<domain>/jobs/*.job.ts`, and `src/<domain>/service.ts`; task/job files outside recommended directories remain discoverable with warnings. Task named exports are valid and required for implicit naming; do not warn that every task must only default-export. A named local binding also exported as default is one origin. A service facade alone does not invent a missing canonical task export. Ordinary cross-domain consumers import through service facades; route files retain the existing `src/routes/**/route.ts` convention.

#### 0.2 Durable identity is distinct from graph identity

Task `id` and explicit job effective `id` are stable contract IDs; a task and a job MAY have the same durable ID. Two distinct tasks with equal task IDs, two distinct jobs with equal job IDs, and two jobs with equal API names are errors. Source re-exports of the same branded descriptor are deduplicated before uniqueness validation.

For new nodes, set `TaskNode.id = "task." + taskId` and `JobNode.id = "job." + jobId`; retain raw `taskId` and `jobId` fields separately. These prefixes are graph-only and MUST NOT enter native idempotency, public run handles, authorization, schedules, or job names. Edges and UI lookup use graph IDs through one shared mapping helper. An unrelated existing node colliding with either graph ID is a source-located compilation error, never a silent overwrite or automatic suffix. Legacy job graph nodes retain their old identity under their explicit legacy mode.

Apply this distinction to schema indexes as well as node indexes. `normalize-utils.ts: schemaKey`, `normalize-compat.ts: schemaEntries`, `normalize-schema-validation.ts`, and `normalize-graph-node.ts` currently write/read `${descriptor.id}:${field}`. New task-owned schema keys use the task graph ID plus field/direction; job schema views reference their target task's entries. Keep existing non-task schema keys unchanged and diagnose synthetic collisions. For example, a function, task and job can share durable `orders.export` without either function input or task canonical input overwriting the other. Carry caller/canonical projections and hashes through `discovery/evaluator-snapshot.ts` and `evaluator-protocol.ts`; the current single `{ $relkit: "schema", jsonSchema }` marker loses that distinction. Do not restore an executable validator from a snapshot marker.

New JobNode carries `executionModel: "task"`, `name`, `jobId`, `taskId`, `taskVersion`, `buildId`, `profile`, `serviceGeneration`, `implicit`, `default`, schedules, client projection, canonical policy and compatibility metadata. The legacy union uses `executionModel: "legacy-function"` and retains targetFunctionId/retry/schedule. New RegistrationPlan collections are `tasks` and `jobs`; `queues` and legacy schedules stay legacy. New jobs MUST NOT pass through the current queues/function materializer.

Add graph edge kinds `targets-task`, `triggers-job`, `triggers-task` (authored intent before binding), `exposes-task`, and `exposes-job` in `packages/graph/src/graph-edges.ts`. Reuse the existing `calls-function`, `invokes-agent`, and `publishes-event` kinds. Observed submission edges point to the resolved job and retain an optional authored task reference. Edges never cause a second submission.

Extend HookNode as an owner-discriminated union: existing function/tool owners keep phases `before`/`after`; task owners use `start`/`success`/`failure` for onStart/onSuccess/onFailure. Task hook graph IDs are the task graph ID plus `.` and phase, and ownerId is that task graph ID. Extend uses-hook phases, compiler `normalize-graph-nodes.ts`/`normalize-graph-edge-helpers.ts`, graph validation/serialization, and Inspector hook rendering together. Validate the owner/phase combination and synthetic ID collisions. Do not route task hooks through transforming function onBefore/onAfter hooks.

#### 0.3 Public exports and dependency direction

| Export | Owner and fixed contents |
| --- | --- |
| `@relkit/app/tasks` | `packages/app/src/tasks.ts`: defineTask and task authoring/context/policy types from jobs; no new tasks package. |
| `@relkit/app/jobs` | Existing jobs.ts: defineJob, job authoring types, RunHandle, safe run/control/schedule types. |
| `@relkit/app` | Re-export the new authoring API following current facade conventions. |
| `@relkit/jobs` | Task/job descriptors, validators and typed descriptor clients. Reuse contracts/schema/invocation primitives. |
| `@relkit/contracts/jobs` | New browser-safe leaf export for schema-parameterized task/job references, run snapshots/frames, pages, error and control envelopes, and protocol constants. No imports of jobs/functions/schema runtime, Effect, Node, SDKs or handlers. |
| `@relkit/jobs/adapter` | JobsAdapterRuntime, TaskExecutionBinding, TaskExecutor and serializable native envelopes/capability validation, for runtime adapter authors. |
| `@relkit/jobs/server` | runWithJobs and scoped runtime access. Server-only; rejected from browser bundles. |
| `@relkit/jobs/legacy`, `@relkit/app/jobs/legacy` | Deprecated defineJob export retaining the old function-target options and receipt semantics for the one-release window. |
| `@relkit/client/jobs` | Browser-safe JobRegistry, job contract types, watchJobRun and controller/snapshot types; no React dependency. |
| `@relkit/client/react` | useJobTrigger, useJobRun, useJobCancel, useJobRetry; JobRegistry is re-exported from client/jobs, not separately declared. |
| `@relkit/{inngest,trigger,effect-mq}` | Pure factories named inngest, trigger, effectMq respectively. |
| Each new integration's `./runtime`, `./local-recipe`, `./deployment` | Native clients/executable registration, composite recipe, and staged native publication descriptor respectively, with relkit.integration metadata. |

Move the minimal structural TaskRef/JobRef and serializable client result types to contracts/jobs; use schema type parameters there without importing the schema package. Functions may derive schema input/output through their existing schema dependency. Jobs may reuse declared function error/context types, but functions MUST NOT import jobs implementation. Temporary legacy type re-exports preserve package resolution. Do not add integration dependencies to app/engine/contracts/client. Native SDKs exist only in their integration packages. Server-only authoring is not browser-safe merely because generated schemas are.

Metadata uses existing `relkit.integration.id`, `exports.authoring: "."`, runtime registration `{ capability: "job", adapterId: "<provider>", protocolVersion: 1 }`, `localRecipe: "./local-recipe"` and the existing deployment export shape. Provider IDs/adapter IDs are `inngest`, `trigger`, `effect-mq`. Recipe references use these integration IDs, `recipeId: "jobs"`, `recipeVersion: 2`. The jobs adapter protocol separately declares `JOBS_PROTOCOL_VERSION = 1`; do not bump the generic provider protocol just to add a jobs feature. Add exports, TS project references, integration metadata validation, browser/declaration boundary checks, catalog entries and release cohort coverage together.

#### 0.4 Complete authoring surface

The names in sections 2–7 are binding, not illustrative alternatives. Add no task .invoke(), job handler/target-function overload on the new entry point, workflow API, or browser service selector.

- `defineTask({ id, version, input, inputWire?, output, errors?, execution?, dependencies?, publishes?, progress?, streams?, observation?, retry?, resources?, concurrency?, maxDuration?, maxElapsed?, logging?, onStart?, onSuccess?, onFailure?, handler, title?, description?, tags? })`.
- `id` is explicit and validated by the existing stable ID contract. `version` is an explicit nonempty stable string, not a mandatory semver triplet; examples "1" and "2" remain valid. Changes to schemas/wait structure require an intentional version change.
- `dependencies` supports `tasks`, `jobs`, `agents`, `buckets`, `cache`. `publishes` is the existing readonly tuple of exact EventRegistry IDs; there is no new dependencies.events or dependencies.functions API. Functions are called through descriptor .invoke(). Task managed aliases use the job-name grammar.
- Context is mode-specific and schema-inferred. In addition to section 4.3 it exposes the existing registered `database`, `auth`, `constants`, and `prompts`. Worker auth never carries the original request/session/token. Task log/time/trace use @relkit/invocation contracts. Task publication obeys the same narrowed EventRegistry contract as functions.
- Progress emit takes InferInput of the declared progress schema and emits its validated canonical value; streams do the same per stream schema. Streams use the same safe-name validation as job aliases. `observation: { progress?: "live" | "durable"; streams?: { [declaredStreamName]: "live" | "history" } }`; omission means live. Requiring a guarantee without a corresponding schema is an authoring error. `history` requires native retained content cursors, not merely persisted latest progress.
- `defineJob({ name, id?, task, service?, default?, schedules?, admission?, client?, title?, description?, tags? })`. The readonly descriptor exposes task-derived `input`, `output`, `errors`, `progress` and `streams` as views for client inference; these cannot be supplied or overridden in options. It carries literal Name independently of resolved Id.
- For the one-release migration window, the new job options additionally accept deprecated `profile?: string` as an exclusive alias of `service`; both spellings together fail, even if equal. Normalize it to `service` and diagnose its use. This spelling alias does not enable function targets or require `compatibility.legacyJobs`; that flag gates legacy execution only.
- `service` omission uses defaults.jobs; a configured single `default` profile also resolves without an explicit defaults entry. Other single named profiles require defaults.jobs or job.service. Multiple jobs permit at most one `default: true` per task. Binding ambiguity is diagnosed statically where a call is known, and at runtime for dynamic calls.
- `admission: { pastAt?: "run" | "reject"; idempotency?: { key?: keyof CanonicalInput & string; retention?: DurationInput } }`. Defaults: pastAt run, no payload-derived key. Key fields must be string/finite-number canonical scalar fields. If a declared field key and an explicit trigger key disagree, reject before submission. Requested retention is a minimum native guarantee, not a new TTL store. Scheduling and browser access never override execution policy.
- Trigger options are exactly section 4.2 plus optional `operationId?: string` for caller-stable ambiguous-operation recovery. Server descriptor/context options additionally accept `signal?: AbortSignal`; task.trigger additionally accepts typed `job?: JobDescriptorForThisTask`. Neither belongs in browser payload options. The operation ID is not itself an idempotency guarantee. A missing operation ID is created once per submission and returned in unknown-outcome diagnostics; client retries retain it.
- `client` is an exclusive public/authorize union with required nonempty `operations` and optional `fields`. Operations are exactly section 12.2. Fields are `"status" | "input" | "progress" | "output" | "error"`; omission exposes only base identity/status. status is always present. Selecting undeclared progress/streams or unsupported operations fails before activation. Stream access additionally requires operation stream and the schema-name allowlist `streams?: readonly (keyof TaskStreams & string)[]`; omission exposes no named streams.
- Hooks have the exact section 4.7 signatures and Promise<void> return; their context omits sleep/sleepUntil and value-transform hooks. Hook timing never owns native completion or retries. Use service `hookTimeout` with default "5 seconds" and a maximum "30 seconds"; per-task hooks cannot increase it.
- `runWithJobs(config, callback)` accepts `{ projectRoot, environment?, manifestPath? }`, defaults the path to the compiled jobs manifest in 0.7, activates only required service bindings, runs the callback in invocation-local scope and closes clients in finally. It never compiles source or starts Docker automatically. Plain imports do not create a runtime.
- Existing new-task `runs.result(runId, { timeout, signal? })` requires a finite timeout, defaults to none only by making timeout mandatory, returns validated output on retained completed state and throws safe typed terminal/availability/observer errors otherwise. It is prohibited anywhere under task execution ancestry, including indirect calls through function.invoke(), not just in the immediate task handler.

#### 0.5 Wire encoding and schema validation

Use `canonicalJson`/`assertJsonValue` from contracts for accepted JSON, with an internal tagged envelope `{ kind: "json", value }` or `{ kind: "void" }` for top-level void only. Object keys with undefined, sparse arrays, Date, bigint, File, Uint8Array, streams, cycles, functions, accessor/symbol properties, non-finite numbers and arbitrary class instances are rejected as they are by existing canonical serialization. Authors explicitly transform dates to RFC3339 strings, bigint to decimal strings and binary to bucket references. Do not silently stringify values or introduce an arbitrary custom-codec registry. The built-in void envelope is versioned and maps back to undefined; it is distinct from expired/redacted output.

Caller input and canonical worker input need separate validators and hashes. Preserve the original schema's input projection through built-in transform metadata, and extend `getJsonSchema(schema, { direction?: "input" | "output" })` without changing its existing no-options behavior. The new direction path consults Standard JSON Schema input/output hooks where faithful. An input projection alone never proves output validity. Every input transformation needs an executable identity-preserving inputWire validator unless a faithful canonical validator is demonstrably available from existing schema metadata. inputWire has equal input/output types compatible with InferOutput<input>, does not transform, and the engine verifies canonical bytes do not change under validation. A type assertion or generated `schema<Value>().validate` witness is never sufficient.

`packages/runtime-hono/src/rpc.ts` currently validates a function's input in oRPC before engine invocation. New jobs RPC must not copy `.input(task.input)` and then call the submission pipeline that validates it again. Validate the transport envelope independently and run the business input validator once in shared admission; authorization receives that validated canonical input. Output transport validation likewise checks canonical values without rerunning the task output transform. Hash executable canonical-validator/projection identity as well as the visible JSON Schema so refinements/default semantics cannot change without a contract/build change.

Validate input with its business transform once for the accepted canonical payload; duplicates may validate independently. Native replay validates only canonical input. Validate output once before terminal success, then retain it under the pinned output hash. Progress/stream schemas validate their own items. Input/output contract failure is terminal and cannot be retried as a business failure. Existing declared errors keep `retry: "never" | "later"` / `afterMs` internally; the task's new policy/delay fields use readable strings. Do not break existing event/function error contracts merely to rename afterMs.

Plain application exceptions are retryable under the declared task policy unless classified as validation, output-contract, authorization, missing build/version, cancellation or deadline failures. Declared error retry metadata remains authoritative (omitted means never). Native suspension/continuation is a third control-flow path and is tested before ordinary error normalization or hooks.

The value directions are fixed: trigger input and authored schedule input use `InferInput<Task.input>`; handler input, onStart input, selected `RunSnapshot.input` and retained retry input use `InferOutput<Task.input>`. A successful handler returns `InferInput<Task.output>`; output validation produces `InferOutput<Task.output>` for onSuccess and run results. Progress/stream emitters accept their schema input and observers receive its output. Use the existing declared-error instances and `FunctionFailure`/`fail` recognition before output validation; returned or thrown declared errors are failures, never successful JSON output. Task handlers accept plain values/promises of these results; direct Effect-returning task handlers are not a new public requirement. Existing functions invoked from tasks keep their current result contract.

Preserve faithful projection and canonical-validator provenance through nested object/array/union schemas, optional/nullable/default wrappers and refinements, not just a top-level transform. Do not execute default callbacks to guess schema metadata. Output/progress/stream reads validate the retained canonical shape without rerunning business transforms; if a faithful canonical validator cannot be produced for one of those schemas, reject that declaration with a source diagnostic (there is no new outputWire/stream codec API). Never replace a refined executable validator with a weaker JSON Schema projection merely because their TypeScript types match.

Manual retry and native schedule ticks enter the same admission pipeline using an internal, verified canonical-input path. They MUST NOT call public `trigger(storedCanonicalInput)` and reapply the caller schema. Retry reauthorizes, validates the retained schema/hash, chooses the original build, creates a fresh run/attempt budget/deadline and clears the original initial delay; it retains the original scope and sets retryOfRunId. A missing/expired original schema or input fails. Static schedule input is validated in the isolated evaluator while its executable schema is available; dynamic input is validated at authorized upsert. Store the canonical value and schema hash with the owned native schedule; each tick validates that value, assigns its own scheduledFor and fresh run identity, and never reevaluates an input default/transform. Static authored schedule input is configuration, not an accepted run payload; exclude it from public client metadata unless explicitly projected. No browser payload can select the canonical-input path.

#### 0.6 Frozen run, scheduling and controller details

RunHandle is exactly section 4.6. Runtime-only nativeRunId and credentials do not leak into it. RunSnapshot has base identity fields from the handle plus buildId, service, status, observedAt and optional attempt/start/completion/nextEligible timestamps, parentRunId, retryOfRunId, scheduledFor, cancellation receipt and native diagnostic code when authorized. Native-unavailable fields are omitted rather than guessed. Keep selected optional data under `input`, `progress`, `output`, `error`.

Expose `resultAvailability: "pending" | "available" | "redacted" | "expired" | "not-selected" | "version-incompatible" | "unavailable"`. Only completed + available + selected output has a required typed output property; other union branches have no output key. Failed/cancelled/timed-out branches expose selected safe error data; connection errors stay outside the run. Server raw history can access an old schema only by pinned decoder; current generated clients return version-incompatible, never reinterpret old bytes.

RunPage is `{ items, nextCursor?, hasMore, availability: { service, state: "available" | "unavailable", reason? }[], count?: { value, accuracy: "exact" | "approximate" } }`. Default limit 25/max 100 or lower native limit; tags default AND, a binding advertising only OR rejects the unsupported query until explicitly selected with `tagMatch: "any"` (default `"all"`). Accepted range is inclusive from/exclusive to. Unsupported filters fail with a capability error instead of being dropped.

Cancel options require operationId and optionally reason (bounded). Receipt is `{ runId, operationId, outcome: "requested" | "already-terminal" | "unsupported", requestedAt?, run? }`; ambiguous writes throw the typed unknown-outcome envelope retaining operationId. Retry requires operationId and terminal original run, returns `{ ...RunHandle, retryOfRunId }`, and never changes the original run. Schedule methods are server/Inspector/CLI-only: `list({limit?,cursor?})`, `get(id)`, `upsert(definition,{operationId})`, `pause(id,{operationId})`, `resume(id,{operationId})`, `delete(id,{operationId})`; writes return a native-confirmed or requested/unknown receipt, not invented completion.

ScheduleDefinition is `{ id, input, overlap?: "allow" | "skip", misfire?: "skip" | "latest" | "all" }` intersected with exactly one of `{ cron, timezone, every?: never }` and `{ every, cron?: never, timezone?: never }`. Cron is five-field, timezone explicit IANA; intervals are fixed positive durations. latest submits one most-recent missed tick; all submits every missed tick; skip submits none. Each is accepted only if native behavior matches; omitted policies expose native semantics. Static declarations cannot overwrite operator-owned dynamic schedules; upsert refuses conflicting ownership. Task versions/builds are deployment targets, not caller-selectable schedule input.

watchJobRun(client, name, { runId, after? }) returns one controller with `getSnapshot()`, `subscribe(listener): () => void`, `connect(): Promise<void>`, `disconnect(): Promise<void>`, `dispose(): Promise<void>` and `refetch(): Promise<void>`. State contains run?, connection, isStale, lastObservedAt?, connectionError?, continuity and source. connect resolves after the first authorized snapshot or rejects; concurrent calls share it. A completed controller can refresh the retained terminal state. A disposed controller rejects connect/refetch with RELKIT_JOB_WATCH_DISPOSED. subscribe never opens a connection and returns immediate state notification; one listener throwing is isolated and diagnosed. State/frame immutability prevents subscribers changing other observers' data.

Named stream frames are a separate discriminated union: `start` (runId/name/attempt/generation/schemaVersion), `chunk` (same identity, sequence, item, optional native cursor), `reset` (same identity plus reason), `end` (same identity), or a safe typed error. Content sequence is generation-local. End closes content only; run completion is independently verified.

#### 0.7 Generated artifacts, protocol and routing

Canonical jobs manifest path is `.relkit/generated/jobs.manifest.json`, alongside existing compiler output. This deliberately replaces the brief's isolated `.relkit/jobs.manifest.json` path to match the repository artifact owner. The executable `.relkit/generated/runtime.manifest.ts` contains task/job descriptor and authorization resolver maps, and native entries build under `.relkit/build/jobs/<buildId>/<serviceGeneration>/`. Historical immutable manifests/builds live in the owned jobs build directory with references in activation metadata. Local lifecycle secrets/state use existing ignored local-service state paths, never public manifests.

Manifest protocol is `relkit.jobs-manifest`, version 1, with app/environment, graphHash, publicFingerprint, jobsProtocolVersion, tasks, jobs, nameToId, serviceGenerations, workerEntries, schemaHashes, policies, schedules, recipe references and compatibility report hashes. It contains no run database, secrets, arbitrary callbacks or user payloads. Canonical serialization/order and writeIfChanged ensure no-op compilation is byte-identical. Add the artifact to build cohorts, activation fingerprints, packing and last-known-good checks. Bump existing graph/manifest formats when adding incompatible node/registration data; negotiate old/new versions deliberately rather than accepting unknown documents.

Run locator v1 is an opaque bounded HMAC-authenticated base64url envelope with key ID, application/environment namespace hash, service-generation reference, durable job/task/build/schema identity and native locator kind/value. Use node:crypto in server-only code, constant-time MAC comparison and native or recipe-persisted signing keys. No key comes from an ephemeral process default. Native metadata mapping is allowed only if it survives restart. Retained manifests/key rings route old locators; names never authorize or redirect them. A locator maximum of 4096 bytes and all decoded-field limits are enforced before any SDK call. Public errors make invalid and unauthorized locators indistinguishable where necessary.

Generated contract has one nested root `jobs` whose keys are job.name. Raw procedures live at /rpc using the existing oRPC router/path-array mechanism. Root `jobs` is reserved against an existing root route selector collision; compilation reports both locations. Existing route IDs/HTTP selector aliases and agents/realtime entries remain unchanged. Generate the same job contract from both graph and serialized client-contract documents.

Generate canonical procedure selectors `jobs.<name>.trigger`, `jobs.<name>.runs.get`, etc., with an explicit path array in registry metadata. Extend procedureUtils/procedureCall to resolve this generated path after exact root-key lookup; never split arbitrary existing dotted route IDs. useRoute/useRouteMutation accept these generated selectors; useJobTrigger/useJobRun accept only the literal job name. Private/omitted operations have no generated entry and are rejected in forged calls.

Augment the sole JobRegistry in @relkit/client/jobs; React imports/re-exports it. The existing client identity/sessionEpoch/publicFingerprint handshake gains jobs protocol/version/capability data without overwriting agent capability negotiation or websocket selection. Job cache keys extend relkitKey with environment, durable job ID, run ID, projection/schema version and jobs protocol. Pending job unknown errors MUST survive the current finite-hooks ORPCError path and retain original input/key/operationId for explicit recovery. Disabling automatic retry is insufficient if pending state is deleted.

#### 0.8 Runtime SPI and bounded operations

Use the JobsAdapterRuntime and TaskExecutionBinding in section 16.2 with `protocolVersion: 1` on runtime creation. Expose `createJobsRuntime` at jobs/server for internal materialization and `TaskExecutor.execute(envelope, binding)` at jobs/adapter as an injected callback contract; implementation remains in engine. Integration packages never call engine.invoke or import engine. Browser or raw request metadata cannot construct a verified binding.

Wire this through the existing `runtimeIntegration.registrations[].create(context)` contract in `packages/provider/src/runtime.ts`, returning `RuntimeProviderGeneration` whose `value` is the adapter, whose ready/readiness verifies native health, and whose release delegates to adapter.close. Mark its value `kind: "jobs-adapter-runtime"`, `protocolVersion: 1`; validate these and its capability report before use. `createJobsRuntime` consumes already acquired provider handles, not a second SDK client registry. New jobs cannot use a legacy value exposing only createQueue; legacy jobs cannot bind a task adapter merely because both register capability `job`. Diagnose both mismatches before activation.

The actual dev/start/production entry is generated by `packages/cli/src/commands/build-server.ts` and `build-server-{runtime,invocation,registration,shutdown}.ts`. Wire the new runtime, task/job dependency sources, jobs RPC/Inspector, readiness and shutdown there as well as in engine. Only opted-in legacy queues may reach queueProvider/startJobWorker and its tick/runNext interval. New workers use separate immutable native entries and worker-safe context setup; API shutdown releases submission/observation clients without cancelling accepted native runs. Registry release owns adapter close once; scoped bootstrap releases only handles it acquired. A generated source smoke check and a packed dev/build/start execution must cover this wiring.

`packages/invocation/src/handler-bridge.ts` currently normalizes every throw/rejection. Do not pass native suspension through that bridge unchanged: the task binding supplies a runtime-only `isSuspension(cause)` classifier for SDKs that park by throwing/rejecting, and task execution tests it before handler/error/hook normalization on both synchronous and asynchronous exits. Preserve the original native control value for the outer SDK. A native callback finishing a park is not validated as task output; ordinary failures still reuse existing declared-error guards and redaction. Keep function invocation behavior unchanged.

OperationContext includes trusted app/environment/scope, service generation, abort/deadline and producer trace. Submission seals canonical payload/hash, task/job/version/build, scope, correlation/parent IDs, policy and idempotency identity. Validate callback authentication, target and manifest hashes before context materialization; native park signals return to the native SDK untouched. Workers are independent runnable programs with native lease/fencing protection, not detached promises in an HTTP server.

Service common options are nested `limits`, `workers`, `observation`, plus `maxElapsed`, `hookTimeout` and `shutdownGrace`, with these exact shapes:

```ts
interface JobsServiceOptions {
  limits?: {
    inputBytes?: number;
    outputBytes?: number;
    progressItemBytes?: number;
    streamItemBytes?: number;
  };
  workers?: {
    classes: readonly {
      id: string;
      cpu: number;
      memory: MemoryInput;
      nativeClass?: string;
    }[];
  };
  observation?: { pollInterval?: DurationInput; readTimeout?: DurationInput };
  maxElapsed?: DurationInput;
  hookTimeout?: DurationInput;
  shutdownGrace?: DurationInput;
}
```

Factories expose these optional plain serializable settings alongside their provider connection fields; provider-native extensions stay in the integration's documented `native` option. Connection values use existing env.secret/binding refs. Byte overrides are positive integers that can only lower the default/native maximum. Poll interval is at least 2 seconds; readTimeout is finite, positive and at most 10 seconds. Worker class IDs are unique stable strings; CPU/memory follow task resource validation. Classes are the application-approved finite allowlist, not an automatic native catalog search: Docker maps CPU/memory to isolated worker limits; a discrete native machine mapping requires nativeClass and verifies actual minima against the pinned native catalog. The adapter refuses a claimed class it cannot enforce. Without a configured matching class, an explicit task resource request fails; tasks omitting resource requests use a reported native default. maxElapsed supplies a service default when omitted by the task and a service ceiling otherwise; an explicit task exceeding it fails instead of being silently shortened. Remaining watch/page/concurrency bounds below are internal protocol limits, not an invitation to invent more public configuration. Defaults below are upper bounds; adapters may enforce stricter published limits.

| Boundary | Default / hard maximum |
| --- | --- |
| input/output JSON | 1 MiB each; native smaller limit wins; overrides cannot exceed native limits |
| progress or named-stream item | 64 KiB; native smaller limit wins |
| pending observation frames | 128 and 1 MiB per shared watch, whichever is reached first |
| named content per observer connection | 16 MiB; reconnect/resume or explicit overflow error at the bound |
| run list | 25 rows / 100 rows |
| unique watches per authenticated identity | 100; same-key local subscriptions share one lease |
| upstream watches per service process | 100, with bounded queue/rejection beyond capacity |
| concurrent native reads per service process | 8, including polling and aggregate Inspector reads |
| observer poll interval / individual read timeout | 2 seconds / 10 seconds; no overlapping reads for one key |
| outer reconnect budget | 10 consecutive failures, full jitter from 500 milliseconds to 30 seconds; reset after a confirmed snapshot |
| disconnect/dispose cleanup | 5 seconds; force local closure and emit cleanup diagnostic after expiry |
| grant revalidation | every 30 seconds or earlier grant expiry; use existing identity lifecycle for immediate revocation |
| service hook timeout / shutdown grace | 5 seconds (max 30 seconds) / 30 seconds |
| idempotency/operation/sleep key, scope, tag | 256 UTF-8 bytes each; max 20 tags; reason 1024 bytes |
| watch/list cursor or run locator | 4096 bytes before decode |

Limits are server enforced. Task resource requests only resolve against explicitly approved worker machine mappings; no implicit upsizing. A service default finite production maxElapsed, if configured, is effective policy and printed; if neither task nor service sets one, activation must still have a certified finite native horizon and state it. Never label missing limits infinite.

#### 0.9 Composite recipe and native feasibility decisions

Keep local-service protocol/recipe v1 supported. Add `CompositeLocalServiceRecipe` with protocolVersion 2, recipeVersion 2, units, volumes, generatedSecrets, outputs and ownership. Units are a discriminated container/init/worker union with stable unit ID, dependency IDs, health, pinned image/build reference, command, env secret references, network/ports, mounts and execution resource allocation. Validate cycles, references, duplicate ports/volumes/IDs and secret-to-public-output leakage before materialization. Normalize v1 to one container internally without changing its authored shape. Extend existing reconciler lease/labels to project/environment/service generation/unit; migrations use the same cross-process ownership lock. Extend materializer/runtime validators to accept supported versions, not a cast around protocolVersion 1.

Factories remain `docker(inngest())`, `docker(effectMq())`, `docker(trigger())`. Inngest default owns PostgreSQL and external Redis with explicit persistence (AOF appendfsync always unless a separately documented/tested durability profile is selected). Do not copy an upstream Redis volume example as durability proof. All owned admin/list ports bind loopback; dependent traffic uses private networks and advertised host/container addresses. effect-mq defaults to its recipe-owned PostgreSQL schema/migration; application database configuration is not required. Trigger local onboarding uses supported native CLI/API/UI bootstrap; no private table writes.

Provider dependencies are not installed in the baseline. Phase 0 must select exact published SDK/server/image versions and digests in tests/jobs/compatibility/manifest.json, verify package exports/peer/runtime/architecture compatibility, and record executable evidence before support is native/adapter. SDK version numbers are evidence to be pinned, not a license to change the frozen Relkit API.

Fresh official documentation checks on 2026-09-13 establish these implementation entry points and constraints:
- Inngest v4 uses `Inngest.createFunction(configuration, handler)` with triggers in configuration, `step.sleep(key, duration)`, and native serve/connect registration. Realtime `subscribe` from `inngest/realtime` returns a ReadableStream-based subscription with close/unsubscribe; adapt that actual cleanup contract rather than assuming all SDKs return AsyncIterable. Official management APIs must prove scoped queries and event-to-one-run recovery. [Inngest functions](https://www.inngest.com/docs/reference/typescript/v4/functions/create), [sleep](https://www.inngest.com/docs/reference/typescript/v4/functions/step-sleep), [subscriptions](https://www.inngest.com/docs/reference/typescript/v4/realtime/subscribing).
- Self-hosted Inngest supports explicit Redis/PostgreSQL connections; default embedded queue snapshots are not this change's abrupt-stop durable recipe. [Self-hosting](https://www.inngest.com/docs/self-hosting).
- Trigger uses `@trigger.dev/sdk`, native task/trigger/wait and `runs.subscribeToRun`. Its current Docker guide excludes checkpoint support, so Docker durable sleep stays unsupported unless a later pinned native mechanism passes the same recovery gate. [Run subscription](https://trigger.dev/docs/realtime/backend/subscribe), [Docker](https://trigger.dev/docs/self-hosting/docker).
- effect-mq documents `Job.make`, job.enqueue/poll/attempts/toLayer, Worker.layer and PostgreSQL tables/DrizzleJobStore from `effect-mq/drizzle-postgres`; recurrence uses job.schedule/unschedule and JobSchedules. Current docs target Effect 4.0.0-rc while this repo pins beta.107. A matching published version or explicitly reviewed compatibility update is required; do not force-install mismatched peers, leak Effect schemas to users or silently upgrade the monorepo. [Setup](https://www.effect-mq.com/guide/getting-started), [workers](https://www.effect-mq.com/guide/workers), [schedules](https://www.effect-mq.com/guide/repeatable-jobs).

The design choice is native ownership with capability refusal. Rejected alternatives are a universal run database, homemade retry/scheduler loop, fake persisted progress, API scraping and implicit effect-mq replacement. Phase 0 must prove at least two engines' common subset and the Inngest mandatory local features. Total-attempt accounting across sleeps, precise active/elapsed clocks, duplicate receipt recovery, secure native query filters, historical builds and cleanup are pass/fail acceptance tasks. Failure blocks the affected required milestone; it is not a deferred product decision.

#### 0.10 Compatibility, Inspector and release refinements

Use `defineApp({ compatibility: { legacyJobs: true } })` as the explicit one-release gate for legacy descriptors/enqueue. Default false. The new authoring entry point always rejects function targets; migration's first mechanical step is importing the deprecated defineJob from app/jobs/legacy, preserving the old declaration until extraction is complete. Legacy app job/defaults.job and new-job profile alias are accepted for this one release with diagnostics; simultaneous old/new keys always fail. An opted-in legacy job remains on the old providers-local/AWS/native runtime it already uses and never gains new durable-sleep guarantees. Do not remove unrelated integrations or event retry/scheduler code.

The authoritative breaking migration uses the existing Changesets fixed group and release sync/check scripts. Add a breaking changeset and compatible one-release deprecations; do not pick a release number, stage, commit or publish during implementation without user authorization. Removal after the window is a future breaking release, not a hidden cleanup task in this change.

Inspector route placement is fixed: enhance `/jobs` with Definitions/Runs/Schedules/Services tabs; use `/jobs/[id]` for durable job detail, `/jobs/runs/[runId]` for run detail, and `/tasks/[id]` for task detail. URLs encode opaque IDs; public name is the label. Add jobs-specific APIs under the existing protected Inspector API base for definitions, runs, schedules and services, routed through inspector-api/jobs; no native querying in browser components. Runtime overview returns bounded summaries and never enumerates every run. Existing production Inspector opt-in remains unchanged.

Extend both create and add scaffolding; add task as an artifact kind, update add job to task targets and both interactive/noninteractive catalogs. `--jobs inngest-docker|effect-mq-docker|trigger-docker` selects services; without the flag keep existing minimal/api/agent behavior. Place the standalone tasks fixture/template under `templates/default/v1/tasks` and emit domain service boundaries. Keep old jobs docs routes via redirects/explicit migration pages, rather than leaving old function-target examples discoverable without warnings.

The existing local CLI is `relkit local up|status|stop|reset`, implemented by `cli-command-local.ts`, `cli-help-model.ts` and `commands/local{,-operations}.ts`; reuse `stop`, not the brief's nonexistent down command. Reuse reset's existing `--yes` confirmation override. Add reset `--dry-run` for an owned-resource impact preview, and local `--service <jobs-service>`/`--environment` selection without changing no-selection behavior. Always compute and report reset impact before mutation; --yes bypasses prompting, never ownership checks. No additional --force spelling is introduced.

Freeze jobs CLI forms as `relkit jobs list`, `relkit jobs runs list|get|watch`, `relkit jobs trigger`, `relkit jobs cancel`, `relkit jobs retry`, `relkit jobs capabilities`, and `relkit jobs schedules list|get|upsert|pause|resume|delete`. Reuse --project-root, --environment/--env and global --json. `--job <name>` resolves the compiled API name (private jobs remain available only to authorized server operators); `--run-id` carries an opaque run locator; `--service` selects a configured jobs service only on server CLI paths. Trigger takes `--input-file` containing JSON and optional --idempotency-key, --operation-id, --delay or --at; control writes require --operation-id. Run listing exposes --status, --task-id, --from, --to, repeated --tag, --tag-match, --limit and --cursor using RunListQuery semantics. Schedule reads/control use --schedule-id; upsert uses --definition-file with ScheduleDefinition and --operation-id. Watch uses --after and aborts on the existing CLI signal; JSON watch output is one projected frame per line. Do not add an independent tasks command tree; jobs definitions/capabilities include task and worker details.

The remaining numbered sections fully define the contract, implementation responsibilities and verification. They are part of this change even where examples refer to APIs that implementation has yet to add.

### 1. Revision decisions

| Requested correction | v1.1 decision |
|---|---|
| A job targets a task, not a request-time function. | Introduce `defineTask()`. `defineJob({ task })` accepts only a task reference. A function reference is a type error and a runtime validation error. |
| Background execution settings do not belong on functions. | Tasks own retries, sleep access, CPU/memory requests, execution limits, concurrency, logging policy, lifecycle hooks, and semantic versions. Existing function behavior is not rewritten. |
| Configure multiple job services. | Add public `defineApp({ jobs: { ... } })` and `defaults.jobs`. Named services reuse existing provider-profile machinery. |
| Direct and context-based calls. | Support `task.trigger(input)`, `job.trigger(input)`, `ctx.tasks.alias.trigger(input)`, and `ctx.jobs.alias.trigger(input)`, through one submission implementation. |
| Do not require both execution and state configuration. | Remove public `job-state`, `stateProfile`, a mandatory second store, and a universal Relkit run journal. A service adapter owns its necessary persistence. |
| Defer workflows. | Remove the proposed workflow descriptor and all workflow-only implementation phases. No public step/checkpoint DSL is added in this revision. |
| Human-readable durations. | Author durations as `"1 second"`, `"2 days"`, and similar Effect-style strings. Normalize once before provider conversion. |
| Reuse provider clients. | Adapter observation uses the provider's supported SDK/client first. Relkit supplies typed contracts, authorization, normalization, lifecycle ownership, and React integration. |
| Complete documentation updates. | Ship guides, API reference, provider comparison, local setup, examples, migration pages, generated-client docs, and doctests with the feature. |
| Inspector listing/filtering. | Provide separate job definitions and run views, server-side filters, cursor pagination, live detail, and capability-aware controls. |
| Docker without third-party registration. | Add job recipes to the existing `docker(adapter())` flow. An account-free Docker quickstart is a release requirement, not an optional follow-up. |
| Restrict provider scope. | Implement only Inngest, Trigger.dev, and effect-mq integrations, recipes, docs, and certification gates. No fourth provider is part of this change. |
| Dot-access job names. | Require an explicit camelCase `name` for authored jobs; use it in typed clients, hooks, context aliases, and Inspector labels. Keep optional durable `id` separate. |
| Explain how a task works end to end. | Specify discovery, binding, validation, submission, durable acceptance, execution, sleep, retry, observation, cancellation, deployment, and retirement. |

**Primary design rule:** Same Relkit API and the same meaning for every advertised capability. Different provider capabilities must be visible before deployment. An unsupported combination must fail clearly instead of silently changing its semantics.

**Scope boundary:** v1.1 supports at-least-once task execution with native retries and native durable timers where supported. It does not promise automatic preservation of arbitrary local variables or already-completed business work across retries. Handlers must be replay-safe and external effects must be idempotent. That boundary avoids hiding a new workflow engine inside `defineTask()`.

---

### 2. Developer experience: configure, define, trigger, and observe

The following examples are the API review surface. Application helpers such as `mail.sendOnce()` are illustrative business code and must be implemented by the application; they are not new Relkit services.

#### 2.1 An account-free local project

Proposed installation, after these integrations are published:

```sh
bun add @relkit/app @relkit/docker @relkit/inngest
```

```ts
// relkit.config.ts
import { defineApp, defineEnv } from "@relkit/app/config";
import { docker } from "@relkit/docker";
import { inngest } from "@relkit/inngest";

export default defineApp({
  id: "notifications",
  env: defineEnv({}),
  jobs: {
    local: docker(inngest()),
  },
  defaults: {
    jobs: "local",
  },
});
```

```sh
bun run dev
```

The proposed composite recipe starts Inngest, its persisted Redis/PostgreSQL dependencies, and a generated Relkit task worker/serve entry point. Relkit owns local secret generation, readiness, registration, ports, and persistent volumes. No SaaS account, cloud token, or application-managed database setup is required. The upstream self-hosting guide documents Docker deployment and external Redis/PostgreSQL configuration. [I1]

**Default local acceptance target:** `docker(inngest())` must pass submission, keyed sleep/resume, retry, recurring scheduling, bounded run listing, observation/reconnect, and crash-recovery tests before release. Native keyed sleep is documented, but the stronger Relkit semantics still require adapter conformance; naming a recipe does not certify it. [I3]

For queue/retryable tasks without durable suspension, an alternative service is:

```ts
import { effectMq } from "@relkit/effect-mq";

const local = docker(effectMq());
```

This recipe owns a persistent native store and task workers, without another public state binding. Its initial profile accepts `execution: "retryable"`; it must reject durable-sleep tasks rather than implement `ctx.sleep` with a process-local timer. Native workers and repeatable jobs are documented separately from durable continuation. [M2] [M3]

#### 2.2 Multiple services, one execution API

```ts
import { defineApp, defineEnv, env } from "@relkit/app/config";
import { docker } from "@relkit/docker";
import { trigger } from "@relkit/trigger";
import { inngest } from "@relkit/inngest";
import { effectMq } from "@relkit/effect-mq";

export default defineApp({
  id: "commerce",
  env: defineEnv({}),
  jobs: {
    local: docker(inngest()),
    queue: docker(effectMq()),
    compute: trigger({
      projectRef: "proj_commerce",
      secretKey: env.secret("TRIGGER_SECRET_KEY"),
    }),
    scheduled: inngest({
      appId: "commerce",
      eventKey: env.secret("INNGEST_EVENT_KEY"),
      signingKey: env.secret("INNGEST_SIGNING_KEY"),
    }),
  },
  defaults: { jobs: "local" },
});
```

Each object value is one complete jobs service, not an execution/state pair. Provider factories remain declarative and side-effect-free at import time. Install only the integrations actually used.

#### 2.3 Define a real task

```ts
// src/notifications/tasks/send-follow-up.task.ts
import { defineTask } from "@relkit/app/tasks";
import { z } from "@relkit/app/schema";
import { mail } from "../domain/mail";

export const sendFollowUp = defineTask({
  id: "notifications.send-follow-up",
  version: "1",
  input: z.object({
    customerId: z.string(),
    email: z.string().email(),
    campaignId: z.string(),
  }),
  output: z.object({ messageId: z.string() }),
  retry: {
    maxAttempts: 3,
    initialDelay: "1 second",
    maxDelay: "30 seconds",
    factor: 2,
  },
  maxElapsed: "3 days",
  handler: async (input, ctx) => {
    ctx.log.info("Follow-up requested", { campaignId: input.campaignId });

    await ctx.sleep("2 days", { key: "follow-up-window" });

    // Business idempotency is independent of queue deduplication.
    // This helper must atomically reuse an existing message/result for this key.
    return mail.sendOnce({
      key: `follow-up:${input.campaignId}:${input.customerId}`,
      to: input.email,
      signal: ctx.signal,
    });
  },
});
```

The default task execution mode is `"durable"`. That means a binding must support the native durable-sleep contract; it does not mean arbitrary JavaScript work becomes exactly-once.

For a plain queue handler that does not sleep, declare `execution: "retryable"`. It keeps the same trigger, result, logging, and watch APIs, but its context deliberately has no durable sleep method. This makes effect-mq's queue capabilities usable without pretending it is a replayable task engine.

#### 2.4 Trigger the task directly

```ts
// Inside an active Relkit route/function/task/server invocation:
const accepted = await sendFollowUp.trigger({
  customerId: "customer_123",
  email: "customer@example.com",
  campaignId: "campaign_2026_09",
});

console.log(accepted.runId);
```

`trigger()` waits for durable provider acceptance, not for the task's output. It must not execute `handler` inline or detach an untracked promise from the request.

A task with one unambiguous valid camelCase source export and no explicit job receives one compiler-generated private default job. Its `name` is that export name (for example `sendFollowUp`), its durable `id` remains the explicit task ID, and its service comes from `defaults.jobs`. It is visible in the graph and Inspector as an implicit job. A missing, invalid, duplicate, or ambiguous export name requires an explicit `defineJob({ name, task })`; there is no punctuation-to-camelCase guessing or discovery-order fallback. Re-exports of the same descriptor are deduplicated; conflicting source aliases must be resolved explicitly.

#### 2.5 Define a job with a camelCase name and optional binding configuration

```ts
// src/notifications/jobs/send-follow-up.job.ts
import { defineJob } from "@relkit/app/jobs";
import { sendFollowUp } from "../tasks/send-follow-up.task";

export const followUpJob = defineJob({
  name: "sendFollowUp",
  id: "notifications.follow-up",
  task: sendFollowUp,
  service: "local",
});
```

```ts
const accepted = await followUpJob.trigger(input, {
  idempotencyKey: `follow-up:${input.campaignId}:${input.customerId}`,
  delay: "10 minutes",
});
```

`name: "sendFollowUp"` is the API-facing property used by generated callers. The optional `id: "notifications.follow-up"` is the durable identity; omit `id` for a new job to use `name` as its initial durable ID. Existing IDs must be preserved during migration. Job names are not inferred by stripping punctuation from IDs.

A job binds a task to a jobs service and optionally supplies scheduling, admission, or client exposure. It does not repeat the task's input/output schemas, own a handler, or duplicate the task's execution policy.

A task with one explicit job resolves `task.trigger()` to that job. Multiple bindings require a designated default or an explicit job reference:

```ts
const accepted = await sendFollowUp.trigger(input, { job: followUpJob });
```

This ambiguity is checked during compilation where possible and at runtime otherwise. Never choose whichever job was discovered first.

#### 2.6 Trigger through context

```ts
import { defineFunction } from "@relkit/app/functions";
import { z } from "@relkit/app/schema";
import { sendFollowUp } from "../tasks/send-follow-up.task";
import { followUpJob } from "../jobs/send-follow-up.job";

export const requestFollowUp = defineFunction({
  input: sendFollowUp.input,
  output: z.object({ runId: z.string() }),
  dependencies: {
    tasks: { followUp: sendFollowUp },
    jobs: { sendFollowUp: followUpJob },
  },
  handler: async (input, ctx) => {
    const accepted = await ctx.tasks.followUp.trigger(input);
    return { runId: accepted.runId };

    // Alternative when a specific binding is desired:
    // await ctx.jobs.sendFollowUp.trigger(input);
  },
});
```

The explicit dependency form supplies typed context access. Direct descriptor calls are also valid; they use the existing invocation-binding approach and contribute declared/observed graph edges. Do not make a direct call bypass service policy, tenancy, tracing, or validation.

#### 2.7 Execution policy belongs to tasks

```ts
export const renderReport = defineTask({
  id: "reports.render",
  version: "2",
  execution: "retryable",
  input: reportInput,
  output: reportOutput,
  resources: {
    cpu: 2,
    memory: "4 GiB",
  },
  retry: {
    maxAttempts: 5,
    initialDelay: "2 seconds",
    maxDelay: "1 minute",
    factor: 2,
  },
  concurrency: { limit: 4 },
  maxDuration: "15 minutes",
  maxElapsed: "2 hours",
  logging: { level: "info", redact: ["input.accessToken"] },
  handler: async (input, ctx) => {
    return renderer.renderOnce(input, {
      key: ctx.idempotencyKey("render"),
      signal: ctx.signal,
    });
  },
});

export const reportJob = defineJob({
  name: "renderReport",
  id: "reports.render",
  task: renderReport,
  service: "compute",
});
```

The compiler must verify this exact policy against the selected service and worker deployment. It cannot silently ignore a memory limit, reinterpret an active duration as elapsed time, or reduce a requested concurrency cap to a process-local semaphore.

#### 2.8 Typed progress and result observation

```ts
export const exportOrders = defineTask({
  id: "orders.export",
  version: "1",
  execution: "retryable",
  input: exportInput,
  output: exportOutput,
  progress: z.object({ processed: z.number(), total: z.number() }),
  handler: async (input, ctx) => {
    const result = await exporter.exportOnce(input, {
      key: ctx.idempotencyKey("export"),
      signal: ctx.signal,
      onProgress: (progress) => ctx.progress.emit(progress),
    });
    return result;
  },
});
```

Progress support is a declared capability. A service must identify whether progress is persisted in native run metadata or available only as a live stream. A task can require persisted progress with `observation: { progress: "durable" }`; unsupported bindings then fail. Emitting progress is not an implicit write to a universal Relkit run database.

#### 2.9 Expose an authorized job to the generated client

```ts
export const exportJob = defineJob({
  name: "exportOrders",
  id: "orders.export",
  task: exportOrders,
  service: "compute",
  client: {
    authorize: authorizeOrderExports,
    operations: ["trigger", "get", "list", "watch", "cancel"],
    fields: ["status", "progress", "output", "error"],
  },
});
```

`authorizeOrderExports` is application code following the contract in Section 12. It resolves trusted tenant scope and checks the requested operation. This follows the existing public-or-authorize shape used by agent client policies, extended with job-specific operations and projections. [R10]

```ts
// Generated, provider-neutral oRPC client.
const accepted = await client.jobs.exportOrders.trigger({
  input: { accountId: "account_123" },
  options: { idempotencyKey: "orders-export:request_456" },
});

const abort = new AbortController();
const frames = await client.jobs.exportOrders.runs.watch(
  { runId: accepted.runId },
  { signal: abort.signal },
);

for await (const frame of frames) {
  if (frame.kind === "snapshot" || frame.kind === "update") {
    renderRun(frame.run);
  }
  if (frame.kind === "reset") {
    replaceRun(frame.run); // History was unavailable; this is authoritative current state.
  }
}
```

The raw oRPC stream has ordinary iterator/abort behavior. An imperative client helper adds explicit connection control without requiring a React component:

```ts
import { watchJobRun } from "@relkit/client/jobs";

const watch = watchJobRun(client, "exportOrders", {
  runId: accepted.runId,
}); // Created idle; no network call yet.

const unsubscribe = watch.subscribe((state) => {
  renderRun(state.run);
  renderConnection(state.connection);
});

await watch.connect();
await watch.disconnect(); // Stops observation only. The task continues.
await watch.connect();    // Native resume where supported; otherwise reset + fresh snapshot.
unsubscribe();
await watch.dispose();    // Permanent cleanup; calling connect again throws a typed error.
```

#### 2.10 React and TanStack Query

```tsx
import { useState } from "react";
import { useJobRun, useJobTrigger } from "@relkit/client/react";

export function ExportStatus() {
  const [runId, setRunId] = useState<string>();
  const [request, setRequest] = useState<{
    input: { accountId: string };
    options: { idempotencyKey: string; operationId: string };
  }>();
  const trigger = useJobTrigger("exportOrders", {
    onSuccess: (accepted) => setRunId(accepted.runId),
  });
  const live = useJobRun("exportOrders", {
    runId,
    enabled: runId !== undefined,
  });

  return (
    <section>
      <button
        disabled={trigger.isPending || request !== undefined}
        onClick={() => {
          const next = {
            input: { accountId: "account_123" },
            options: {
              idempotencyKey: crypto.randomUUID(),
              operationId: crypto.randomUUID(),
            },
          };
          setRequest(next);
          trigger.mutate(next);
        }}
      >
        Export orders
      </button>
      <p>Connection: {live.connection}</p>
      <p>Status: {live.run?.status ?? "No run selected"}</p>
      <button onClick={() => void live.disconnect()}>Disconnect</button>
      <button onClick={() => void live.connect()}>Reconnect</button>
    </section>
  );
}
```

This component retains the accepted runId and the original request and prevents another click from creating a second logical operation. The complete executable fixture also renders pending/error/recovery states: only when the structured recovery action in §6.2 permits it, an explicit recovery action calls `trigger.mutate(request)` with the retained request. Unsupported/expired recovery stays visibly unknown. Identity change clears sensitive state, and a new export requires a separate user intent. Generate IDs in the click handler, not during server rendering. Applications needing reload recovery retain operation metadata as described in §11.8 and re-supply matching input.

`useJobTrigger` returns the normal TanStack mutation result. `useJobRun` uses the same identity-scoped query cache and transport/controller used outside React. The existing `useRoute()` and `useRouteMutation()` remain usable against generated job procedures. No separate query library, provider-specific React context, or conditional invocation of provider React hooks is required. [R8]

---

### 3. Terminology, ownership, and scope

#### 3.1 Resource vocabulary

| Concept | Responsibility | Public surface |
|---|---|---|
| Function | Immediate application computation within the existing runtime invocation model. | `defineFunction`, `.invoke()` |
| Task | Background executable with schemas, task policies, version, and its own context. | `defineTask`, `.trigger()` |
| Job | Named submission binding from a task to a configured jobs service; may carry schedules and client policy. | `defineJob`, `.trigger()` |
| Jobs service | A named provider binding and its worker/state/observation configuration. | `defineApp({ jobs })` |
| Run | One logical accepted execution of a job. | `RunHandle`, `RunSnapshot` |
| Attempt | A provider-authorized attempt to execute application work after a failure. | Run metadata, Inspector |
| Resume/replay | Re-entering a durable task to continue an existing wait or recover execution. | Runtime metadata; not automatically another retry attempt |
| Schedule | A durable recurrence that submits new runs for one job. | `job.schedules.*` and job schedule declarations |
| Watch | A connection observing a run or filtered collection. It is not the execution itself. | Raw stream, `watchJobRun`, `useJobRun` |

A service profile and a domain `defineService()` are different concepts. The former selects infrastructure; the latter groups application capabilities. Documentation must use “jobs service” for the former and “domain service” for the latter.

#### 3.2 Strict ownership

Tasks own `input`, `output`, optional declared errors, progress/stream schemas, `handler`, execution mode, retry policy, durations, resources, concurrency, logging policy, and version.

Jobs own task reference, jobs-service selection, default-binding selection, static schedules, client access policy, and optional submission admission policy. Jobs do not override task retry/resource/version settings in v1.1. A separately configured task is required when execution policy genuinely differs.

Services own provider connection details, native SDK configuration, deployment mode, worker resource mappings, transport preferences, native retention settings, and native limits. They own their engine's persistence; application code does not manage a parallel state profile.

#### 3.3 Explicit exclusions

No public workflow descriptor, `defineWorkflow`, workflow engine, checkpoint/step DSL, durable parent-child result waiting, fan-out/join language, compensation engine, human-approval signal inbox, or cross-provider in-flight migration is part of this release.

A task may trigger another independent task and record a parent/trace link. Triggering does not create a durable join, cascade policy, or guarantee that both submissions are atomic. Existing agent graphs remain intact; task observation may link to them but does not take ownership of their checkpoints.

---

### 4. Public task and job contracts

#### 4.1 Descriptor invariants

`TaskDescriptor` has descriptor kind `"task"`. It is not structurally accepted as a function. `JobDescriptor.task` must be a branded task reference with a valid input/output contract. Descriptors are immutable and authoring is side-effect-free.

Task IDs are explicit, stable strings. Task `version` is an explicit semantic execution version. The compiler separately records the immutable build ID. A file rename does not silently change a durable task's identity.

The public examples use `handler`, matching Relkit's existing authoring vocabulary. The provider's native `run`, function handler, or workflow callback stays inside the adapter.

#### 4.2 Proposed type surface

The following is a contract sketch, not a complete generic implementation. Production declarations must infer schemas and literal names without `any` leakage. Job descriptor types must carry the literal `name` independently from their resolved durable `id`; `defineJob` requires `name`, accepts optional `id`, and infers input/output from `task`. Section 4.8 defines name validation and rename behavior.

```ts
type TaskExecution = "durable" | "retryable";

type DurationUnit =
  | "millisecond" | "milliseconds"
  | "second" | "seconds"
  | "minute" | "minutes"
  | "hour" | "hours"
  | "day" | "days"
  | "week" | "weeks";

type DurationInput = `${number} ${DurationUnit}`;
type MemoryInput = `${number} MiB` | `${number} GiB`;

interface TaskRetryPolicy {
  maxAttempts: number;          // Total logical application attempts, including the first.
  initialDelay?: DurationInput;
  maxDelay?: DurationInput;
  factor?: number;
  jitter?: "none" | "full";
}

interface TaskResources {
  cpu: number;                 // Minimum vCPU allocation; positive finite value.
  memory: MemoryInput;         // Minimum memory allocation; converted to bytes.
}

interface TaskConcurrency<InputKey extends string = string> {
  limit: number;               // Shared active-slot upper bound for this task/service.
  key?: InputKey;              // Validated payload field used to partition the cap.
}

interface TaskSleepOptions {
  key: string;                 // Stable inside this task version; required in v1.1.
}

interface TriggerOptions {
  operationId?: string;       // Stable across explicit recovery of an ambiguous submission.
  idempotencyKey?: string;
  delay?: DurationInput;
  at?: string;                 // RFC 3339 instant with timezone; exclusive with delay.
  tags?: readonly string[];
  correlationId?: string;
}
```

`maxDuration` is an active execution-time limit per application attempt, excluding durable parked sleep and queue/backoff time. `maxElapsed` is total wall-clock time from accepted submission, including initial delay, sleep, backoff, and retries. The exact active-clock contract and enforcement requirements are specified in Section 7; an adapter that cannot enforce them must reject that field, not substitute its nearest timeout setting.

Defaults: `execution: "durable"`; retry `maxAttempts: 3`, `initialDelay: "1 second"`, `maxDelay: "30 seconds"`, `factor: 2`, `jitter: "none"`. No implicit CPU/memory increase, no unlimited retry, and no automatic infinite execution limit. A service may require applications to set a finite `maxElapsed` before production activation. Provider limits always constrain the selected configuration.

#### 4.3 Task context

```ts
interface TaskContextBase {
  readonly run: {
    readonly runId: string;
    readonly jobId: string;
    readonly taskId: string;
    readonly taskVersion: string;
    readonly buildId: string;
    readonly service: string;
    readonly attempt: number;
    readonly acceptedAt: string;
    readonly scheduledFor?: string;
    readonly parentRunId?: string;
  };
  readonly invocation: InvocationMetadata;
  readonly signal: AbortSignal;
  readonly env: ApplicationEnv;
  readonly log: PublicLogger;
  readonly trace: PublicTrace;
  readonly time: PublicClock;
  readonly tasks: DeclaredTaskClients;
  readonly jobs: DeclaredJobClients;
  readonly agents: DeclaredAgentClients;
  readonly events: DeclaredEventClients;
  readonly buckets: DeclaredBucketClients;
  readonly cache: DeclaredCacheClients;
  readonly idempotencyKey: (operation: string) => string;
}

interface DurableTaskContext extends TaskContextBase {
  sleep(duration: DurationInput, options: TaskSleepOptions): Promise<void>;
  sleepUntil(instant: string, options: TaskSleepOptions): Promise<void>;
}
```

Registered application context fields such as database clients, constants, prompts, and authorization helpers follow the existing context registry, subject to worker-safe serialization and reinitialization. They are recreated in the worker, not serialized out of an HTTP request.

`idempotencyKey(operation)` is a namespaced deterministic key for this logical run and operation. It remains stable across retries and replay; it changes for a new run. Business-wide deduplication across different runs must use a business key instead.

`progress` and named `streams` appear only when schemas are declared and the job binding can support their requested guarantees. `ctx.sleep` is absent from `execution: "retryable"` contexts. `ctx.signal` cancellation does not imply external systems rolled back work.

#### 4.4 Methods and signatures

| Surface | Method | Result and behavior |
|---|---|---|
| Task | `trigger(input, options?)` | Promise of a serializable accepted run handle; optional typed `job` selector for explicit binding. |
| Job | `trigger(input, options?)` | Same submission behavior, already bound to one service. |
| Task/job context client | `trigger(input, options?)` | Same validation, trace, identity, and provider code path. |
| Job server client | `runs.get(runId)` | Authorized current snapshot; typed output/progress. |
| Job server client | `runs.list(query)` | Bounded, indexed/pushed-down pagination. |
| Job server client | `runs.watch(runId, options?)` | Async iterable of normalized observation frames; cleanup on iterator return or abort. |
| Job server client | `runs.cancel(runId, { operationId, reason? })` | Cancellation request receipt; not immediate completion. |
| Job server client | `runs.retry(runId, { operationId })` | Explicit new run, linked to original; never rewinds a terminal run in place. |
| Job server client | `runs.result(runId, { timeout, signal? })` | Bounded observer wait for typed terminal result, allowed outside task execution ancestry only. |
| Job schedule client | `list/get/upsert/pause/resume/delete` | Capability-gated schedule administration; no process-local cron substitute. |

Keep legacy `ctx.jobs.alias.enqueue()` on the explicitly legacy descriptor/client path where compatibility.legacyJobs is enabled; new task-backed clients expose trigger only. The new documentation uses `.trigger()` consistently. Do not silently change the shape of an old enqueue result while calling it backward compatible.

`runs.result()` must accept a human-readable timeout and an abort signal. It is an observer operation, not a durable task join. Inside a task it fails with `RELKIT_TASK_BLOCKING_WAIT_UNSUPPORTED`; workflow-style waiting belongs to a later design.

#### 4.5 Input, output, and serialization

Caller input uses the schema's input type; task handler input uses the schema's validated output type. Transformations run on the submission boundary; native retries deserialize the canonical accepted payload rather than repeatedly applying transforms. A repeat submission may validate again before deduplication, so input transformations must themselves be pure and side-effect-free. “Once” refers to the accepted canonical value, not a distributed exactly-once invocation of a schema callback.

The worker revalidates the canonical wire schema without applying a second business transform. Use the existing schema/codec generator when it can produce a faithful validator for the transformed value. Add an optional task `inputWire` validator for transformations whose output cannot be derived; it must be identity-preserving on the canonical representation and type-compatible with the handler input. Reject an unrepresentable transformed schema at compilation unless this contract is provided. Never infer an inverse transform from arbitrary JavaScript or trust a type assertion as runtime validation. Native acceptance envelopes include the canonical schema/codec hash and integrity/authenticity metadata.

Output is validated before it is published as successful. An output contract error is terminal and recorded as `RELKIT_TASK_OUTPUT_INVALID`, not endlessly retried. Progress and stream items are validated separately.

Use the existing Relkit serialization rules and Standard Schema integration. Explicitly reject non-finite numbers, functions, cyclic objects, database connections, request objects, raw streams as final results, and unregistered wire codecs. Define supported handling for `undefined`/void, dates, bigint, binary references, and declared errors in contract tests. Prefer bucket references for large data; do not silently spill into an undisclosed store.

#### 4.6 Run records, queries, and controls

```ts
interface RunHandle {
  readonly accepted: true;
  readonly runId: string;
  readonly jobId: string;
  readonly taskId: string;
  readonly taskVersion: string;
  readonly acceptedAt: string;
  readonly duplicate?: boolean;
  readonly idempotencyExpiresAt?: string;
}

type RunStatus =
  | "queued" | "delayed" | "running" | "sleeping" | "retrying"
  | "completed" | "failed" | "cancelled" | "timed-out" | "unknown";

interface RunListQuery {
  readonly status?: readonly RunStatus[];
  readonly taskId?: string;
  readonly taskVersion?: string;
  readonly buildId?: string;
  readonly acceptedFrom?: string;
  readonly acceptedTo?: string;
  readonly tags?: readonly string[];
  readonly tagMatch?: "all" | "any";
  readonly correlationId?: string;
  readonly parentRunId?: string;
  readonly limit?: number;
  readonly cursor?: string;
}
```

Generated job-specific lists are already scoped to one job; aggregate privileged Inspector queries additionally accept known job/service filters. Scope is server-derived, never a freely selectable browser list field. The filter schema publishes supported tag combination semantics and optional fields per binding. Use an inclusive lower/exclusive upper time range. Default page size is 25; maximum 100 unless a stricter service limit applies. Sort newest accepted first, then stable run identity; a cursor is invalid when filters/sort/identity change.

A native unmapped status produces `unknown` with a safe diagnostic; it is neither successful nor terminal by implication. A transient read failure does not replace previously known run status with `unknown`; observer health is separate. Terminal outcomes are `completed`, `failed`, `cancelled`, and `timed-out`, with the timeout reason carried separately. A cancellation request is metadata, not a terminal status.

`RunSnapshot` includes safe identity, task/build version, status, attempt when known, native observation timestamp, optional started/completed/next-eligible timestamps, projected progress, and terminal result/error availability. Native timestamps must not be invented from browser observation time. Queued event receipts may have no materialized native run ID yet.

Always-safe routing identity and status are base fields. The `client.fields` allowlist selects additional sensitive or optional data; it cannot make hidden payloads available through error details. Generate projection-aware snapshot unions: `output` is typed and required only for a completed, retained, authorized selected result; otherwise omit it and report the availability reason. `input` is not exposed by default. Declared errors retain safe typed details; unknown errors use a redacted framework shape.

Control `operationId` is a bounded caller-stable key. Cancellation receipts identify requested/already-terminal/unsupported outcomes and do not assert rollback. Retry receipts carry a new `RunHandle` and `retryOfRunId`; unknown native acknowledgements retain the operation identity for recovery.

#### 4.7 Lifecycle hooks and progress acknowledgements

Keep optional hooks small and observational: `onStart(input, context)` before a handler entry, `onSuccess(output, context)` after local output validation, and `onFailure(error, context)` after a handler entry fails. Context includes logical attempt plus replay/entry metadata when available. A native re-entry may repeat hooks. `onFailure` is an entry/attempt failure hook, not a guarantee of one final exhaustion notification. `onSuccess` is not a transactionally committed native completion callback; its notification may precede a failed completion acknowledgement.

Hooks cannot transform input/output, run durable sleeps, or own retries in v1.1. Hook exceptions/timeouts are logged separately and must not rerun otherwise successful business work; expose a hook error diagnostic. Limit their execution with a readable service hook timeout. Process death may prevent any hook from executing. Applications needing guaranteed business work place it in the idempotent handler, not an assumed exactly-once hook.

`ctx.progress.emit(value)` validates its declared schema and returns a promise for a receipt identifying `persisted`, `sent`, or `dropped`/unavailable according to selected semantics. A `durable` progress requirement means awaited native persistence, not merely updating an SDK's in-memory buffer. Trigger's metadata documentation exposes an explicit flush operation; the adapter must use the appropriate persistence acknowledgement when it advertises this guarantee. [T9]

Live observation delivery failure is not a reason to retry completed business effects. For default live progress, report delivery problems through the receipt and structured diagnostics. For an explicitly durable emission, a persistence failure rejects that emission; the handler must treat it as a possible retry and remain idempotent. Schema violations are task contract errors. Persisting the latest progress value does not preserve every earlier progress update; recoverable progress history requires a separate native history capability.

#### 4.8 Job names, durable IDs, and dot-access generation

An authored job requires `name`; `id` is optional. This keeps the common definition small while preserving existing durable identities:

```ts
export const sendFollowUpJob = defineJob({
  name: "sendFollowUp",
  task: sendFollowUp,
  service: "local",
});

// Generated browser client, only when this job explicitly permits client access:
const { jobs } = client;
const accepted = await jobs.sendFollowUp.trigger({ input });

// Server descriptor and declared dependency client keep the same verb:
await sendFollowUpJob.trigger(input);
await ctx.jobs.sendFollowUp.trigger(input);
```

The samples show alternative submission surfaces; do not submit three times for one intended operation. Browser input retains the generated `{ input, options? }` envelope, while server descriptor/context calls accept `(input, options?)`.

| Field | Contract |
|---|---|
| `name` | Explicit, literal camelCase API name; unique across all application jobs. Used in generated `jobs.<jobName>`, hook selectors, and Inspector labels. |
| `id` | Optional stable durable identity; defaults to `name` for a newly authored explicit job. May retain dots/hyphens. Not emitted as a public jobs property. |
| Task export | A unique valid canonical export supplies the implicit private job name only when no explicit job exists. The task ID remains that implicit job's durable ID. |
| Context dependency alias | A validated camelCase local name. Prefer the job's `name`; an intentional different alias is allowed and does not rename the global job. |
| Provider-native identifier | Encoded by the adapter from stable identities/builds; not exposed as a client namespace key. |

**Validation.** Use the portable identifier grammar `^[a-z][A-Za-z0-9]*$`, with a length of 1–64 ASCII characters, and document lowerCamelCase as the convention. Accept `sendEmail`, `exportOrders`, and `syncInventoryV2`. Reject dotted, hyphenated, spaced, leading-digit, `$`/underscore-prefixed, non-ASCII, empty, or overlong names. Do not trim, sanitize, camel-case, suffix, or silently normalize an authored name. Invalid name errors must identify the source and suggested valid examples, not mutate the definition.

Reject the versioned reserved set `then`, `constructor`, `prototype`, `toJSON`, `toString`, `valueOf`, `hasOwnProperty`, `isPrototypeOf`, `propertyIsEnumerable`, and `toLocaleString`; reject `__proto__` explicitly as well as through the grammar. Test the set against the installed oRPC client's actual proxy behavior before freezing it; any additional exclusions become documented versioned diagnostics. Use own-property checks or safe maps in internal registries. Jobs namespaces contain job entries only; aggregate list/control operations must not be injected into that namespace and collide with user names.

Literal generics and a `ValidJobName` type helper must reject invalid literal names in TypeScript without `any` widening. Runtime descriptor validation covers JavaScript/unsafe casts; compiler validation adds whole-application uniqueness across services, source modules, private/exposed jobs, and implicit/explicit bindings. Unknown generated names are type errors; dynamically supplied selectors are checked against the same server manifest and exposure policy. If jobs are re-exported, the same descriptor identity is not a second definition.

**Generation.** Generate registry keys and all job procedure selectors from `name` exactly. Hooks use `useJobTrigger("exportOrders")` and `useJobRun("exportOrders", ...)`. Calls use `client.jobs.exportOrders.trigger(...)`, `client.jobs.exportOrders.runs.watch(...)`, and `jobs.exportOrders.trigger(...)` after destructuring. A quoted property declaration in generated TypeScript is acceptable when the key is identifier-safe; callers must never need bracket syntax for a declared job. Do not split `id` into namespaces or invent a root job registry with different naming rules.

**Identity and rename safety.** Store both the name-to-ID mapping and resolved IDs in the compiled manifest. Authorization, native submissions, deduplication, schedules, run locators, and old-build routing use durable IDs; names are not security principals. With explicit `id`, changing only `name` changes the public contract fingerprint, not the native job identity. When a job previously omitted `id`, preserve its former effective ID explicitly before renaming `name`; otherwise it is an identity migration and needs a drain/migration diagnostic. Renaming a task export may change its implicit display/name mapping but must not change the task-backed durable ID.

A public name rename is an API-breaking change even when its durable ID is preserved. Retain old deployment manifests for existing run locators; do not silently route an old selector to another job or remount a job with a new ID under that old name without an explicit migration decision. Client handshake/cache identity must detect public-contract changes and invalidate stale subscriptions. No dotted-ID compatibility aliases are generated in the new public jobs namespace.

---

### 5. Configuration and service resolution

#### 5.1 Reuse the provider protocol

The repository currently uses a singular provider capability `job`; the public `jobs` key is an intentional authoring change. Keep the normalized infrastructure capability `job` for compatibility. Normalize public `jobs` and `defaults.jobs` to that existing capability before graph generation. Do not create a second provider/plugin registry. [R2] [R3]

`jobs: adapter()` may be accepted as shorthand for `jobs: { default: adapter() }`. The named record form is canonical in documentation. Public job selection is `service`, while the manifest may retain the internal term `profile`.

For one compatibility release, accept legacy `job:` and `defaults.job` with migration diagnostics. Supplying both legacy and new keys is an error even when their values appear equal. Per-job legacy `profile` is handled the same way against `service`.

#### 5.2 Task-to-job resolution algorithm

1. Discover tasks and explicit jobs without executing handlers.
2. Validate explicit job names and effective durable IDs separately; reject duplicate names application-wide, including private and implicit jobs. Group explicit job bindings by task identity.
3. No explicit jobs: generate exactly one private job whose ID equals the task ID, whose name is the unique valid canonical task export, and whose service comes from the application default. Missing/ambiguous/invalid/colliding names fail with a diagnostic requesting an explicit named job.
4. One explicit job: it becomes the task's direct-call binding.
5. Multiple explicit jobs: at most one may specify `default: true`; otherwise unqualified direct/context task triggering is ambiguous.
6. An explicit `{ job: descriptor }` selector must point to the same task. Cross-task selectors are rejected.
7. Resolve each job's service, materialized source, capabilities, execution version, and policy into an immutable binding.
8. Validate all required features before publishing a build or starting new runs.

Implicit jobs must not be created in addition to explicit jobs by accident. Adding the first explicit job is a binding migration: identify any old implicit job ID and keep it routable for historical/in-flight runs until it is drained.

#### 5.3 Defaults and overrides

Task execution policy is authoritative. Service worker limits and provider-native hard limits constrain it. Trigger options may choose time of submission, tags, and idempotency, but cannot increase CPU, retry counts, concurrency, or durations. Browser clients cannot select a different service or bypass a job's exposure policy.

Production changes to provider bindings apply only to newly accepted runs. Existing run references remain routable to their original service-generation binding. Removing a service with active or retained referenced runs requires a drain/retirement operation and an explicit retention decision.

#### 5.4 No import-time effects

`defineTask`, `defineJob`, and integration factories must not start workers, connect SDKs, mutate environment variables, register cron schedules, create Docker containers, or inspect the current user session. Runtime materialization creates isolated SDK clients for each service binding. Two services using the same provider with different credentials must coexist safely in one process.

---
### 6. Task execution lifecycle and correctness

#### 6.1 Lifecycle from source to result

| Stage | Required behavior | Persisted owner / artifact |
|---|---|---|
| Author | Declare task and optional job; validate shape without I/O. | Application source. |
| Discover | Locate exported descriptors using existing compiler discovery. | Compiled registry with source/export identities. |
| Bind | Resolve job, service, native definition, task version, and build. | Versioned jobs manifest. |
| Validate | Check schemas, capabilities, policy limits, duration conversions, and deployment compatibility. | Diagnostics; no accepted run on failure. |
| Trigger | Resolve invocation scope, authorize, validate input, construct stable submission identity, and call native SDK. | Provider acceptance record. |
| Acknowledge | Return a handle only after the provider confirms durable acceptance. | Native receipt and its routable Relkit handle. |
| Admit | Observe initial delay, queue policy, capacity, and native rate restrictions. | Provider queue. |
| Execute | Load the pinned task implementation in a worker, rehydrate safe context, validate canonical input, and run the handler. | Native execution record. |
| Sleep | Record the keyed native timer; suspend or park according to the certified deployment mode. | Native timer/waitpoint. |
| Resume | Continue or replay the handler using the same task/build and logical run identity. | Same native run; replay is distinguished from retries. |
| Retry | Apply one task retry owner and persisted retry policy after a qualifying application failure. | Native retry state. |
| Observe | Map native state and supported live events to normalized client snapshots/frames. | Provider state; no mandatory shadow journal. |
| Complete | Validate output and expose success only after terminal native completion. | Provider final output/error. |
| Retain | Keep records according to native retention and declared client availability. | Provider store. |
| Retire | Keep old bindings/builds resolvable until their runs and supported history are drained. | Deployment manifest and provider history. |

#### 6.2 Acceptance, idempotency, and ambiguous responses

A successful `trigger()` is a durable acceptance acknowledgement, not a best-effort enqueue to local memory. It does not promise that a worker is currently available or that the task will succeed.

Namespace application idempotency keys by application, environment, trusted tenant scope, stable job identity, and the provider's documented deduplication boundary. Do not namespace only by a browser-supplied tenant field. The effective deduplication period must be discoverable; requesting a stronger period than the native provider supports fails instead of being silently shortened.

A duplicate result must reference the original accepted logical run where the provider supports that guarantee. An adapter must not mark a newly generated, unresolvable receipt as a successful duplicate. When the provider suppresses a native event but cannot return or resolve its original run, that limitation is a capability restriction.

If the provider may have accepted work but the network response is lost, return `RELKIT_JOB_SUBMISSION_UNKNOWN` with a client operation identifier and a safe recovery description. The client retains its original idempotency key. Do not report the task as failed, automatically generate a new key, or retry a non-idempotent submission invisibly.

A job's idempotency key prevents duplicate run creation within its stated window. It does not make emails, billing calls, bucket writes, or arbitrary database mutations exactly-once. External effects require their own idempotency/transaction contract. A business transaction followed by `trigger()` is not atomic; document the application's transactional-outbox option without introducing a Relkit database requirement.

Identity encoding uses canonical typed tuples, not delimiter concatenation: numeric key `1` and string key `"1"` do not collide. The first accepted submission wins while a key is retained; a duplicate returns that original handle and never replaces its input, delay, scope or build with the new request. Native retry-operation deduplication uses `(original logical run, operationId, "retry")`, separate from the original trigger's admission key, so a manual retry creates one new run rather than deduplicating back to the original.

Native schedule ticks use `(owned schedule identity, scheduledFor)` for occurrence deduplication, not the static payload's admission key. Repeated delivery of one slot recovers the same accepted run, while the next slot creates a new run even when input is identical. Preserve occurrence identity across reconciliation/build rollout and misfire recovery using certified native mechanisms; no Relkit tick ledger is added.

`ctx.idempotencyKey(operation)` derives from immutable acceptance identity plus the operation, not the encoded public runId, its MAC/key ID, current API name, attempt, callback ID or latest service generation. Event-to-run resolution must preserve that same identity. A locator/key rotation therefore cannot change the business-effect key during replay. Recomputed duplicate handles use the accepted run's retained locator version/key rather than minting a different identity using the newest signer.

Unknown-write errors have safe machine-readable data `{ code, outcome: "unknown", operationId, idempotencyKey?, recovery: { action: "retry-with-same-key" | "inspect-native" | "unavailable", expiresAt? } }`. `code` is `RELKIT_JOB_SUBMISSION_UNKNOWN` or `RELKIT_JOB_CONTROL_UNKNOWN`; message is redacted and input is not echoed. Only advertise retry-with-same-key when native receipt recovery and a still-valid conservative deduplication window are certified. Recovery reissues the identical operation/key/input within that window; it never changes keys or task versions. If recovery is unsupported, expired or uncertain, retain unknown and direct the operator to native inspection; any new submission is a separate explicit intent. No mandatory receipt database or new public recovery procedure is introduced.

#### 6.3 Portable replay contract

The portable task contract permits re-execution of the handler after a crash, retry, or native replay. Only explicitly certified native waits are durable in this revision. No automatic checkpoint of an arbitrary `await`, local variable, HTTP response, or business side effect is promised.

A durable task must use stable sleep keys and a repeatable sequence of wait operations for the same accepted payload/version. Do not choose wait keys or whether to issue a wait from current time, random values, an unordered map, or a mutable external read. Put fixed scheduling values in accepted input or use an immutable business record. Side effects before a sleep may run again; make them idempotent or split them into separately submitted tasks.

This is a deliberate task-only boundary. The future workflow design can add durable result checkpoints and orchestration. v1.1 must not quietly implement a new checkpoint database to hide replay behavior.

Provide a lint rule and docs warning for non-idempotent work before durable waits. Static analysis is advisory for arbitrary user code; it is not proof of exactly-once behavior. Conformance fixtures must exercise the intended replay-safe subset on every durable adapter.

#### 6.4 Retry attempts versus replay

The normalized `attempt` count tracks application retry attempts. Native SDK callback invocations, continuation deliveries, sleep resumptions, or reconnects must not be mislabeled as retries. Expose optional native attempt/dispatch metadata separately in privileged Inspector details.

`retry.maxAttempts` is the total application-attempt budget, including the initial attempt. The adapter is the sole owner of that retry policy. The common engine must not wrap the task in an additional general retry loop on top of a provider's retry loop.

Providers may have independently retried steps or different attempt accounting. A mapping that permits more application attempts than the declared budget is not equivalent. In particular, prove retry behavior for a handler that fails before and after multiple sleeps. If a native adapter cannot enforce that contract through supported APIs, reject that exact policy/mode combination and leave the capability uncertified. Do not claim that setting a similarly named native option proves parity.

Infrastructure recovery may repeat an unacknowledged external effect even when the application-attempt budget is exhausted. Expose the distinction and require side-effect idempotency; a retry budget is not an exactly-once guarantee.

#### 6.5 Cancellation and deadlines

Cancellation has two facts: a cancellation request was accepted, and execution reached a terminal state. Model them separately. A control request can return `requested`, `already-terminal`, or `unsupported`; `cancelled` appears in the run only after native confirmation.

Propagate a worker abort signal to cooperative I/O. Native cancellation may prevent future work without interrupting an external call already in progress. A process/container kill may enforce a local resource limit but still cannot retract an external effect.

The submission request's abort signal governs waiting for acceptance only. Once accepted, task execution receives a separate worker/native-run lifetime signal. Closing an HTTP request, source event delivery, browser tab, or parent invocation does not implicitly cancel accepted work. A cancelled submission wait after possible acceptance is an unknown outcome to reconcile; it is not evidence that the native run was removed. Shutdown/rescheduling of one native callback must also be distinguished from permanent cancellation of the logical task.

Do not use terminal `cancelled` when the provider only lost contact with a worker. Worker loss, observation outage, and application failure are different states. After an ambiguous cancellation, query the native run again rather than inventing a final outcome.

`maxElapsed` continues across delays, sleeping, retries, and restarts. Its deadline is fixed at acceptance. A reconnecting watcher never starts or resets the task's deadline.

#### 6.6 Terminal state and manual retry

A run becomes terminal once. Terminal output is immutable. An observer may discover a terminal state late but cannot revive it because an older update arrived.

An operator's `retry` creates a new logical run linked by `retryOfRunId`. The v1.1 retry action uses the original compatible version/build by default, and the UI explains that external effects may repeat. Selecting a different version is a separately confirmed new submission, not an implicit retry upgrade. The action revalidates authorization, input availability, version availability, and native retention. Payload retention failure is an explicit error, not a new run with guessed input.

#### 6.7 Standalone calls and runtime isolation

Direct `.trigger()` requires an active Relkit jobs runtime. Imports alone must not start one. Outside a runtime, fail with `RELKIT_JOBS_RUNTIME_UNBOUND` and explain the supported alternatives: the generated server client or an explicit `runWithJobs(config, callback)` scoped bootstrap from the server-only jobs entry point.

A scoped bootstrap must load a compiled manifest, materialize only required integrations, bind descriptors through invocation-local context, and release SDK clients on exit. It must not install a mutable global “current provider.” Two tests or applications in one process must not overwrite each other's task bindings.

---

### 7. Durations, sleep, retries, resources, and concurrency

#### 7.1 Human-readable durations everywhere

Use the same duration type for sleep, retry delays, trigger delay, observer result timeout, native schedule intervals, shutdown grace, and policy durations. Examples:

```ts
await ctx.sleep("1 second", { key: "settle" });
await ctx.sleep("2 days", { key: "follow-up" });
await followUpJob.trigger(input, { delay: "10 minutes" });
await followUpJob.runs.result(runId, { timeout: "30 seconds" });
```

The readable number-plus-unit style follows Effect's duration input conventions; Effect does not need to appear in application handlers. [E1]

The v1.1 public wire format is the documented string subset, not every Effect `Duration.Input` representation. Avoid leaking Effect objects, bigint durations, or raw tuple representations into generated browser contracts. Internally use the repository's installed Effect duration implementation after input validation; do not introduce a second untested date/time parser.

Validate raw input before normalization: negative values, NaN-like text, infinity, unsafe magnitudes, empty strings, compound expressions, and unsupported units are errors. Do not allow a library's normalization to clamp a negative duration into an accepted zero silently.

A day is a fixed 24-hour duration and a week is seven such days. Calendar recurrences use cron plus an IANA timezone; `"1 month"` and `"1 year"` are not portable duration strings. Durations are distinct from RFC 3339 instants accepted by `at` and `sleepUntil`.

Normalize to a safe integer millisecond representation. Support fractional values only when they produce an exact integer millisecond value in the allowed range. Preserve the authored string in diagnostics; use canonical values for hashing/comparison.

Provider conversion must not wake earlier than requested. When a native API only accepts whole seconds, round an earliest-start timer upward and record the effective value. A hard maximum-duration policy must not be rounded upward silently; reject an unrepresentable hard limit or require an explicit supported policy. Validate native maxima before submission.

The numeric token is unsigned decimal digits with an optional fractional part (for example `0.5`), followed by one ASCII space and a listed unit. Reject signs, exponents, padding and shorthand; the TypeScript template type is intentionally broader than runtime validation. Check exact millisecond representability before passing the value to Effect; multiplication followed by a floating-point integer check alone must not lose decimal precision. A normalized duration cannot exceed Number.MAX_SAFE_INTEGER or a smaller native limit. RFC 3339 instants require a real calendar date, timezone and a representable timestamp; Date.parse alone is not sufficient to reject normalized invalid dates. Adding delay/deadline to acceptance must also remain representable.

| Field | Zero and range rules |
| --- | --- |
| sleep, trigger delay, retry initialDelay/maxDelay | Zero is allowed; keyed zero sleep completes immediately after cancellation/deadline checks and never occupies a durable timer. Retry initialDelay must be at most maxDelay. |
| maxDuration, maxElapsed, observer result timeout, idempotency retention, schedule every | Strictly positive, finite, representable durations. |
| hookTimeout, shutdownGrace, readTimeout, pollInterval | Strictly positive plus the service bounds in §0.8. |
| retry maxAttempts / factor | Positive safe integer total attempts / finite number at least 1. maxAttempts 1 means no application retry. |
| resources.cpu / resources.memory / concurrency.limit | Positive finite CPU / positive decimal MiB or GiB resolving to an exact safe integer byte count / positive safe integer cap; native and approved worker limits also apply. |

Concurrency and payload-derived idempotency keys are required, non-null canonical top-level string or finite-number fields; optional/object/array fields and expression/path strings are rejected. Validate both the declaration and each accepted value. This release uses typed field names, not a new expression DSL.

#### 7.2 Sleep behavior

`ctx.sleep(duration, { key })` and `sleepUntil(instant, { key })` create a named native wait belonging to the logical run and task version. Keys must be non-empty, bounded, stable, and unique for distinct wait occurrences. Loop waits need a business-derived key for each iteration.

A retry or replay using a completed sleep key must not start a fresh full-duration wait. Native waitpoint idempotency/retention must cover the entire accepted run horizon, not only a short SDK default. Changing the duration for an existing key in the same execution version is a compatibility violation.

A future wait is not a process-local timer. A service without native durable waits cannot implement this method using `setTimeout` or `Effect.sleep` and advertise it as durable. Short native waits may retain a worker or concurrency slot according to provider thresholds; the common guarantee is correctness of the wait, not identical compute billing or immediate slot release. Trigger documents this distinction explicitly. [T2]

Abort while asleep requests native cancellation rather than creating a second timer. A resumed handler receives fresh runtime resources. Database transactions, locks, streams, and request-scoped connections must not span a durable sleep.

Past `sleepUntil` instants complete without a future wait but still use the stable key contract. A sleep beyond `maxElapsed` is rejected or causes the existing native deadline to win; it must not create an immortal run.

#### 7.3 Retry policy

For a failure after application attempt `n`, the configured backoff before attempt `n + 1` is:

```text
baseDelay = min(maxDelay, initialDelay × factor^(n - 1))
none      = baseDelay
full      = a provider-supported random delay in [0, baseDelay]
```

Use bounded arithmetic. Classify invalid input/output, missing task/build, unauthorized invocation, and explicit cancellation separately from retryable application errors. Reuse declared Relkit error contracts where they exist. A retryable error with a minimum retry-after delay must not schedule earlier than either the policy delay or the error's minimum; reject a value beyond the remaining horizon.

Jitter distributions and exact configurable backoff are capabilities, not assumptions. The first adapter certification may support only a subset of policies. A provider-native fixed retry schedule can be selected through a documented service extension, but must not masquerade as this portable exponential policy.

Hooks cannot become another retry owner. Document `onStart`/`onSuccess`/`onFailure` delivery semantics. Failure notifications and cleanup may be delivered more than once or not at all after a forced process kill; they are not a substitute for idempotent business recovery.

#### 7.4 Duration clocks and enforcement

| Field | Clock and scope | Includes durable sleep? | Required enforcement |
|---|---|---:|---|
| `maxDuration` | Active execution wall time within one application attempt, including ordinary asynchronous I/O; excludes acknowledged parked intervals. | No | Native equivalent or an owned worker supervisor with durable accounting through native execution records. |
| `maxElapsed` | Wall-clock from durable acceptance through terminal outcome. | Yes | Native absolute deadline or certified native cancellation scheduling. |
| `delay` | Earliest initial execution relative to acceptance. | Not applicable | Native delayed submission. |
| `runs.result(...timeout)` | Caller observation time only. | Not applicable | Abort observation; never cancel the run implicitly. |

Keep native CPU-time, billable-time, active-wall-time, and total-elapsed metrics distinct. Trigger describes its duration setting per attempt and excludes waits; Inngest exposes different start/finish timeout controls. Neither a field name nor a similar example is enough to prove identical clocks. [T3] [I2]

A process-local timeout cannot claim a hard execution limit when the provider may continue running after the request returns. Worker supervisors must abort, then terminate only the owned process/container after a configured grace period. Persist the terminal reason through the native engine or report enforcement uncertainty; do not lose the run because the supervisor was the only holder of its state.

If durable accounting cannot be implemented with the selected engine's supported records, `maxDuration` is unavailable for that deployment. `maxElapsed` remains independently selectable when supported. This is a release-blocking semantic test, not a reason to invent an additional mandatory job-state service.

#### 7.5 CPU and memory

`resources.cpu` and `resources.memory` declare a minimum allocation for an isolated active execution slot. A provider using discrete machine sizes may select the smallest configured class meeting both minima. The resolved class and actual limits must be visible in the plan and Inspector. The user approves service-level machine mappings; the framework must not silently select an unexpectedly expensive class.

A service may apply stricter resource ceilings. If no class can satisfy a task, compilation/deployment fails. Browser trigger options cannot select bigger machines.

For Relkit-owned Docker/hosted workers, use resource-isolated task worker classes with one active execution slot per isolated container/process allocation when per-task limits are promised. Do not run ten tasks in a 1 GiB container and label each as receiving 1 GiB. A shared pool must instead expose pool-level semantics and cannot satisfy an isolated-allocation requirement.

Inngest execution hosting and effect-mq worker hosting are distinct from the orchestration store. Setting resources on the Inngest control plane or its database does not allocate resources to the task. Trigger machine settings are mapped by its adapter. [I1] [T4] [M2]

“Memory” here means process memory allocation, not a durable key/value store, agent memory, or preservation of the JavaScript heap across providers. Persistent application memory remains an application or existing module concern.

#### 7.6 Concurrency

The portable cap is scoped to `(application, environment, jobs service, task ID, optional key value)` across replicas, job bindings, and active task versions. Changing a task version must not accidentally double capacity. Partition keys use the canonical top-level field contract in §7.1; never interpolate untrusted values into provider expression strings.

The cap is an upper bound on occupied execution slots, not a promise that all allowed slots are always available. Native waiting may retain slots temporarily. Provider quotas, worker resources, and fairness rules may further reduce throughput.

A keyed cap is not a distributed business lock and does not imply a global total cap. If both keyed and global limits are supported, describe them independently and validate the combined native mapping. No global limit spans different jobs services in v1.1.

Use native distributed admission or an existing certified engine mechanism. An in-process semaphore alone cannot enforce a distributed task concurrency declaration. Test multiple replicas, sleeping tasks, retries, lost leases, and mixed task versions.

---

### 8. Provider capabilities and adapter implementation

#### 8.1 Adapter responsibility

Evolve `@relkit/jobs` as the core task/job abstraction. Keep integrations independently installable under `integrations/packages/*`, following the repository's integration metadata, authoring/runtime exports, provider capability registration, and local recipe references. [R2] [R11]

Each adapter has four responsibilities: compile task/job definitions into native executable registrations; submit/control/query native runs; bind task context to native execution; and expose normalized observations using supported provider SDKs/APIs.

Native suspension/replay control flow must bypass application error normalization, `onFailure` hooks, and task retry classification. The adapter must distinguish an SDK's intentional “park/yield/resume” signal from a failed handler, then return/rethrow it exactly as required by that SDK. The shared task engine must not swallow a native suspension as an ordinary exception or mark a suspended run completed because one callback returned. Cover this boundary explicitly with native sleep tests.

Submitting through an SDK without deploying/registering the corresponding task implementation is not an adapter implementation.

#### 8.2 Capability records are deployment-specific

```ts
interface JobsCapabilityReport {
  provider: "trigger" | "inngest" | "effect-mq";
  sdkVersion: string;
  backendVersion?: string;
  deployment: "cloud" | "self-hosted" | "docker" | "local-test";
  features: Record<string, {
    support: "native" | "adapter" | "unsupported" | "unverified";
    limits?: Readonly<Record<string, unknown>>;
    constraints?: readonly string[];
    testEvidence?: readonly string[];
  }>;
}
```

At minimum distinguish: durable acceptance; task retry scope; backoff/jitter; keyed durable sleep; delay/absolute scheduling; active duration; elapsed deadline; cancellation request/finality; isolated resources; global/keyed concurrency; semantic/build version routing; stable duplicate receipts; progress storage; named streams; current-state watch; resumable history; native pagination/filter fields; static/dynamic cron; interval schedules; overlap policies; and Docker readiness.

`unverified` is not production support. Reports are generated from pinned compatibility fixtures and actual deployment settings. Do not ship a single `supportsEverything: true` flag for a provider brand.

#### 8.3 Verified upstream facts and their implications

| Provider | Verified relevant capabilities | Consequence for Relkit |
|---|---|---|
| Trigger.dev | Native tasks/retries, time waits with wait idempotency, machine configuration, backend run subscriptions, scoped realtime authorization, and self-hosted Docker are documented. Cloud wait behavior differs from Docker self-hosting, whose guide explicitly omits checkpoint support. [T1] [T2] [T3] [T4] [T5] [T6] [T7] | First rich managed-task reference. Use official clients. Test cloud and Docker separately; never infer cloud suspension guarantees for self-hosting. |
| Inngest | Functions with retry/concurrency controls, keyed sleeps, SDK realtime, and self-hosting with external state stores are documented. [I1] [I2] [I3] [I4] | Default account-free durable-task and recurring-job adapter, but root retries, replay-safe handlers, timeout clocks, and worker resource ownership need explicit mappings. |
| effect-mq | Persisted job retry budgets, workers, delayed/repeatable jobs, and storage options are documented. [M1] [M2] [M3] | Queue/retryable task adapter. The reviewed material does not establish durable suspension of arbitrary async handlers; do not advertise `ctx.sleep` until proven by a native supported mechanism. |

The capability table is intentionally not a claim that all requested settings are interchangeable on every provider. The invariant is identical meaning where support is advertised, with preflight rejection elsewhere.

#### 8.4 Trigger.dev mapping

Generate one native task implementation per immutable Relkit task/build routing identity, with job bindings encoded in validated invocation metadata. Map `trigger()` to the supported task SDK and native idempotency. Map keyed sleep to the supported wait API with a run-scoped key and a retention horizon sufficient for retries. Map resources to approved native machine classes and concurrency to explicit queue configuration. [T1] [T2] [T4]

Use official run retrieval/list/control clients. Use the official backend subscription API for live run changes. Map progress to supported native metadata and named streams to the native streaming API where their contracts match. Native history, stream retention, and metadata visibility are separate capabilities. [T5] [T8] [T9]

Do not embed React-specific provider hooks inside a generic hook that conditionally switches providers. Reuse the underlying provider client instead, and keep one Relkit React API.

Generate and deploy the required Trigger configuration and task entry modules. Preserve server-only context setup and compatible Bun/Node runtime boundaries. Native SDK execution must invoke the Relkit task engine, not call a copied application callback with a fake context.

The cloud and self-hosted adapters may share code but have separate capability reports. A Docker recipe may support retryable tasks before it passes durable-sleep crash/recovery tests. Unsupported durable tasks must fail at activation rather than run with a timer fallback. [T7]

#### 8.5 Inngest mapping

Generate isolated native event/function routing per job/build so one Relkit submission cannot unexpectedly fan out into multiple logical task runs. Keep native event acceptance separate from materialized function-run identity.

Bind `ctx.sleep` to the native keyed sleep primitive and convert durations centrally. Do not wrap a sleep-capable handler inside a native step that prohibits nested durable operations. For retryable leaf tasks, a single native execution boundary may be used when its attempt semantics are equivalent. [I2] [I3]

A durable Relkit task handler can be replayed by the native SDK. Because v1.1 intentionally has no public checkpoint DSL, support only the documented replay-safe task contract, and test all automatic context calls for duplicate side effects. Do not claim that ordinary `fetch`, service calls, or logging are memoized.

Use native SDK subscription facilities and official management APIs for status/output. A realtime message is not proof of terminal completion: verify terminal native state after an apparent completion signal and after reconnect. No scraping of the native dashboard or unstable browser-internal API is allowed. [I4]

Owned workers or authenticated native serve/connect entry points must be generated and deployed with the immutable task build. Per-task CPU/memory is an execution-host capability, not an Inngest control-plane setting. Retry accounting across multiple sleeps is a mandatory early conformance spike; a naive native retries option is not accepted as proof of the total task-attempt budget.

#### 8.6 effect-mq mapping

Translate `execution: "retryable"` tasks into native jobs with schema-safe encoding, one persisted attempt budget, timeout classification, and native worker handlers. Keep Effect usage internal; application handlers remain `async` functions with the Relkit task context. Verify the integration's Effect peer version against Relkit's actual Effect runtime before accepting it. [M1] [M2] [M4]

Wrap async application handlers with an Effect/native bridge that forwards interruption to `ctx.signal` and awaits/terminates owned resources according to the worker contract. Interrupting an Effect fiber does not by itself retract an arbitrary already-started JavaScript promise or external request. The adapter must prevent a detached promise from writing a stale terminal result and must not claim hard CPU interruption without an owned process boundary.

Use native durable schedule operations and their documented recurrence behavior. Preserve schedule ownership groups and reconciliation rules. Do not alter their catch-up semantics while presenting them as a different portable policy. [M3]

Reuse native storage drivers and worker/admin APIs. Docker recipes use a supported persisted database/queue backend; they do not treat Effect's in-memory facilities as production durability.

Reject durable task mode, keyed native sleep, and persisted custom update-history requirements unless the pinned engine version exposes a supported mechanism and passes the corresponding suite. A generic queue delayed re-enqueue plus a process-local continuation is not durable sleep.

#### 8.7 SDK reuse and extension policy

Provider SDKs own their native protocols, tokens, retry/backoff for safe network operations, and native event decoding. Relkit owns application authorization, type inference, run projections, public control semantics, lifetime/cleanup, and adapter conformance.

Do not copy provider React hooks, build a replacement ElectricSQL protocol, reverse-engineer provider websocket frames, or introduce a new transport when an official supported client exists. Optional native escape hatches belong to the service configuration/adapter package and are visibly nonportable; application task bodies must not branch on a provider name.

---

### 9. State ownership without a second configured service

#### 9.1 Remove the mandatory second store

There is no public `job-state` capability, no `stateProfile`, and no requirement to install a separate Relkit job-state package. A Trigger binding uses Trigger's native state. An effect-mq binding owns its selected native persistent store. A Docker Inngest binding materializes its required persisted engine stores. None requires a separate application-configured job-state service.

Infrastructure dependencies of a service are not separate application-level jobs services. The Docker plan and Inspector reveal them, but the authoring configuration remains one `jobs.local` entry. A remote provider must not secretly install PostgreSQL just to make Relkit observation work.

Do not rename the previous universal journal as an “internal projection service” and make it mandatory anyway. This revision deliberately narrows the portable observation guarantee rather than requiring every application to operate an additional distributed database.

#### 9.2 Native run identity

A Relkit `runId` is an opaque versioned reference to one native accepted execution or its native submission locator. It must remain routable across server restarts and configuration changes without relying on an in-memory map.

Use a bounded, integrity-protected locator containing a service-generation binding reference and native locator kind, or a provider-supported persisted metadata mapping. Do not include credentials, payloads, tenant names, or authorization grants in a public ID. Possession of an ID never authorizes access.

For a provider that acknowledges an event before a native run exists, the locator may resolve through that event to exactly one generated target execution. The public snapshot stays `queued`/`delayed` with `nativeRunId` absent until resolved. Resolution returning multiple candidates is an error, not “pick the first.”

The retained deployment manifest supplies historical service routing and codec version information; it is configuration metadata, not a per-run job database. Key rotation and service retirement must preserve old locator verification/routing through the supported retention period.

#### 9.3 Observation guarantees

The baseline watch guarantee is: fetch authorized current state, deliver native observed updates, reconnect safely, and converge to authoritative state after a gap. It is not “every intermediate event is recoverable forever.”

A stronger replayable history capability is exposed only where the native engine provides stable cursors and retained events. Transient progress/token streams, logs, and lifecycle snapshots can have different retention. The client receives a reset/gap indication rather than silent continuity when history cannot be resumed.

No adapter may reconstruct fake historical transitions from two polled snapshots. If `queued` became `completed` between polls, emit current completion; do not fabricate observed `running`, `sleeping`, or retry events.

#### 9.4 Failure isolation

Failure of an observer or Inspector must not stop already accepted work. Failure of the native execution store means the service is unavailable for new durable acceptance, not permission to switch to memory.

Bounded process-local caches are allowed for subscription sharing and repeated read optimization. They are disposable and must be labeled stale after disconnect. They cannot be the only copy of run identity, delayed work, idempotency receipts, deadlines, or terminal output.

---

### 10. Docker development and self-hosting

#### 10.1 Reuse and extend the real local-service protocol

The existing `docker(adapter())` selects an adapter's local recipe without contacting Docker. The inspected recipe contract currently models one image and an optional volume. Multi-container job stacks therefore require an explicit compatible recipe/protocol extension, not an assumed capability. [R4] [R5]

Introduce a versioned composite recipe that can contain dependency containers, an initialization/migration unit, and owned task worker units. Preserve existing single-container storage/cache recipes unchanged. A composite recipe has a dependency DAG, health requirements, secret references, persistent volumes, network topology, output bindings, and deterministic resource ownership labels.

The wrapper syntax stays `docker(adapter())`; only integrations declaring a valid supported local recipe are accepted. Calling it on a cloud-only adapter configuration fails with an actionable message.

#### 10.2 Required recipes

| Recipe | Proposed components | Initial acceptance focus |
|---|---|---|
| `docker(inngest())` | Inngest server, external persistent Redis, PostgreSQL, generated authenticated task worker/serve entry point. | Default account-free durable tasks, sleep/replay, schedules, native run queries and watch recovery; abrupt-stop durability tests. |
| `docker(effectMq())` | Recipe-owned PostgreSQL store, pinned schema/migration setup, Relkit task worker; Redis is a separately certified variant. | Queue/retryable tasks, schedules, filters, lease recovery; no durable-sleep claim. |
| `docker(trigger())` | Upstream-supported self-hosted stack, registry/storage dependencies, supervisor and task workers. | Rich native controls and resource limits; separately certified from Trigger Cloud. |

The default quickstart is `docker(inngest())`, with both durable-task and native-scheduling acceptance required. `docker(effectMq())` supplies the smaller queue/retryable alternative, using a recipe-owned PostgreSQL store by default; a Redis variant is certified separately. `docker(trigger())` is a separate self-hosted mode, not a claim of managed-cloud checkpoint parity. All three recipes are in implementation scope; the core release requires the Inngest path, and the complete three-provider milestone requires each declared Docker variant to pass its own gates. No recipe may be advertised merely because a factory exists.

#### 10.3 Startup sequence

Compute the application/environment/service-generation identity. Allocate names and ports using existing local-service conventions. Generate and persist local secrets once with restrictive filesystem permissions; never print usable keys in ordinary logs.

Start dependency containers in order, wait for health, run a single supported migration/init operation with a cross-process lock, then start task workers from a pinned build. Register native task definitions only after their implementations are ready. Activate application bindings only after submission, state reads, and worker heartbeat/readiness checks succeed.

Support host-to-container and container-to-host traffic on Linux and Docker Desktop through explicit advertised endpoints; do not embed `localhost` inside a container when the target is the host. Bind administrative ports to loopback by default. Test random port allocation, multiple projects, and port collisions.

No SaaS login, paid account, external API key, or remote tunnel is needed for the account-free quickstart. A provider requiring local administrative onboarding must document it and cannot be advertised as the zero-onboarding default. Do not bootstrap by writing undocumented private provider tables.

#### 10.4 Persistence and shutdown

Stop workers gracefully, stop taking new work, and allow in-flight work to complete or return to the native engine according to its recovery rules. Stopping `relkit dev` must retain data volumes. Restarting must recover delayed, sleeping, retrying, and queued runs without another user trigger.

Use explicit `relkit local reset --service <name>` semantics for destructive removal. Require confirmation unless the caller supplies the existing explicit `--yes` flag. `--dry-run` previews without mutation. Show which runs, schedules, and volumes are affected. Never remove containers or volumes lacking this project's ownership labels.

A Redis recipe must declare its actual persistence mode and failure window. Merely mounting `/data` does not turn an in-memory queue into durable acceptance. An engine acknowledgement's durability contract must be tested against the configured storage mode and clearly differentiated from high-availability replication.

#### 10.5 Local versioning and hot reload

New source creates a new task build and generated native registration. Already accepted runs remain pinned to their original build. Keep the prior worker build available until its active/sleeping runs are drained or explicitly cancelled. A sleeping task must not wake into unrelated newly saved source.

This can require old local worker generations to coexist. Show their counts and resource use in Inspector. If the engine cannot route multiple builds safely, block the hot swap for that binding and explain the drain requirement; never silently run old payloads on incompatible new code.

#### 10.6 Operational modes and security

Local Docker is not automatically production high availability. Documentation must distinguish single-machine development, self-hosted staging, and production deployment with backups, restore drills, storage redundancy, worker scaling, secret rotation, TLS, network policy, and observability.

Use pinned image tags plus immutable digests in the release compatibility manifest. Test supported CPU architectures and Bun compatibility; do not assume every upstream image has an ARM build. Keep Docker socket access restricted to the trusted materializer/supervisor using a constrained proxy where supported, never available to application task code.

Resource declarations must be enforced on task worker containers, not merely the service dependencies. Test CPU-heavy handlers, memory exhaustion, forced termination, and cleanup of abandoned execution containers.

---
### 11. Typed generated clients and reliable watch lifecycle

#### 11.1 Generated contract, not imported server implementations

Extend the existing generated oRPC contract and client registry. A browser imports generated schemas, types, and client helpers only. It must not import a task handler, provider secret, application server configuration, Effect worker runtime, or provider deployment SDK.

Generate a `JobRegistry` entry for each explicitly client-exposed job. It carries literal job name, durable job ID, input, projected output, declared errors, projected progress, permitted operations, available named streams, and supported observation features. The selector is the validated job `name`, for example `"exportOrders"`, not the durable ID `"orders.export"`, a filename, or a provider task ID. Generate a flat typed object such as `client.jobs.exportOrders.trigger`, with autocomplete and no bracket-only keys. Map `name` to stable `jobId` on the server through the compiled manifest and verify that every supplied run belongs to that job.

Generate these procedures only when authorized by the job's declared operations:

| Procedure | Input | Output |
|---|---|---|
| `jobs.<jobName>.trigger` | `{ input, options? }` | Accepted `RunHandle`; never final task output. |
| `jobs.<jobName>.runs.get` | `{ runId }` | Projected typed snapshot. |
| `jobs.<jobName>.runs.list` | Validated run filters and cursor. | Typed page with service availability and cursor. |
| `jobs.<jobName>.runs.watch` | `{ runId, after? }` | Async iterable of projected observation frames. |
| `jobs.<jobName>.runs.cancel` | `{ runId, operationId, reason? }` | Control receipt with current native state. |
| `jobs.<jobName>.runs.retry` | `{ runId, operationId }` | New run handle, linked to original. |
| `jobs.<jobName>.runs.stream` | `{ runId, name, after? }` | Typed named stream frames. |

A disabled operation is absent from the generated type and rejected by the server even when manually constructed. Public client names never allow selection of private jobs by adding arbitrary strings. Incompatible old task versions return a typed version incompatibility result rather than deserializing old output using a new schema.

The registry must participate in the existing application/client contract handshake. Unknown jobs protocol versions fail clearly. Adding jobs must not overwrite existing agent capability negotiation, route registries, realtime channels, or websocket connection selection.

#### 11.2 Snapshot and frame contracts

The generated public snapshot is a discriminated union. A `completed` run has validated output when that field is exposed; a failed run has a safe declared or framework error. Queued/running snapshots cannot pretend to have final output. Use a distinct availability field for a result that was redacted, expired, or not selected.

```ts
type RunConnection =
  | "idle" | "connecting" | "connected" | "reconnecting"
  | "disconnected" | "completed" | "unauthorized" | "error" | "disposed";

type RunWatchFrame<Run> =
  | {
      kind: "snapshot";
      run: Run;
      observedAt: string;
      epoch: string;
      sequence: number;
      cursor?: string;
      continuity: "state" | "history";
    }
  | {
      kind: "update";
      run: Run;
      observedAt: string;
      epoch: string;
      sequence: number;
      cursor?: string;
    }
  | {
      kind: "reset";
      run: Run;
      observedAt: string;
      epoch: string;
      sequence: number;
      reason: "reconnected" | "cursor-expired" | "history-unavailable" | "overflow";
      cursor?: string;
    };
```

`sequence` is strictly increasing within one observation epoch; it is not a durable provider cursor. `cursor` is present only when a supported native cursor can safely be resumed. Cursors are opaque, bounded, integrity-protected or strictly validated, and bound to application, environment, job, run, identity scope, projection, and source version. A cursor from one principal or stream must not reveal another principal's data.

Heartbeats and connection failures belong to transport/controller state, not fake run transitions. Do not change a running task to `failed` because the observer lost its network connection. The controller records `lastObservedAt`, `isStale`, and the latest transport error separately from `run.error`.

#### 11.3 Native client reuse

The default browser route is Relkit oRPC to an authorized server-side adapter. The adapter uses the official provider subscription/read client. The existing Relkit transport carries normalized frames; no new provider wire protocol is implemented.

Trigger documents backend async-iterator subscriptions for run changes and a separate typed output-stream API. These are distinct adapter inputs, not one undifferentiated event stream. Inngest's supported native subscribing API is another input. [T5] [T8] [I4]

Where a provider has no supported native subscription, use shared bounded polling through its official read/list API. Expose `source: "polling"`, the configured interval, and `continuity: "state"` in capability/connection metadata. Polling is not advertised as native push or recoverable event history.

An optional direct native browser transport is allowed only behind the same Relkit watch interface, only when its scoped public credentials and projection match Relkit's authorization policy. Obtain a short-lived, exact-scope token from a Relkit endpoint; never send a secret API key. A provider that cannot restrict fields to the approved projection must use the server proxy. Proxy remains the default and the first required release implementation.

Provider SDK retry behavior is reused for native connection setup; Relkit still owns one outer connection lifecycle. Disable or coordinate duplicate retry loops so an abandoned observer cannot keep reconnecting in the SDK after the Relkit controller closes.

#### 11.4 Snapshot/subscription race

For native historical feeds, bind a snapshot to the provider's watermark, then consume subsequent records. Use the provider's supported ordering procedure; do not invent a cursor by timestamp.

For native snapshot feeds, use the SDK's initial snapshot and subsequent state delivery. When the SDK cannot atomically bind read and subscribe, establish the feed, buffer within a strict limit, read current state, and reconcile by native revision. Where no revision exists, re-read authoritative state after a notification instead of comparing fabricated revisions. A second final read closes setup and terminal races.

For polling, serialize fetches for one watch key, ignore stale epochs, and compare canonical projected snapshots. Never overlap unbounded intervals. A slow request must not permit a later stale response to overwrite an observed terminal result.

An iterator that closes before a terminal state is known triggers reconnect/reconciliation, not automatic `completed`. Terminal state is verified through native authoritative state and emitted before a successful single-run watch ends.

#### 11.5 Controller state machine

| Action/event | Required transition and cleanup |
|---|---|
| Construct controller | `idle`; no network, timers, or provider subscription. |
| `connect()` | `connecting`; concurrent calls share one connection promise. |
| First authorized state arrives | `connected`; publish snapshot atomically. |
| Transient transport loss | `reconnecting`; mark stale, retain safe last snapshot, start bounded jittered retry. |
| Manual `disconnect()` | `disconnected`; abort reads and retry timers, return native iterator, release upstream subscription. |
| `connect()` after disconnect | New epoch; native resume or reset/current snapshot. |
| Terminal run is confirmed | Deliver final snapshot, release the feed, then `completed`. |
| Authorization denied/revoked | `unauthorized`; stop all retries and remove sensitive cached state. |
| Nonretryable schema/protocol error | `error`; preserve a safe diagnostic, close resources. |
| `dispose()` | `disposed`; unsubscribe callbacks and permanently release all resources. |

Manual disconnection remains in effect across re-renders, visibility changes, and network recovery until the caller explicitly reconnects or changes the selected run. An automatic online event must not override the user's disconnect choice.

A generation token guards every asynchronous completion. A response for an old run, old identity, or disposed controller is ignored. `disconnect()` and `dispose()` are idempotent and must settle even if the native client is unresponsive; use a bounded cleanup deadline and surface a cleanup diagnostic without keeping the local observer active.

Local abort/iterator `return()` stops observation. It must never call native task cancellation. Cancelling a run requires the explicit authorized cancel procedure. Disconnecting one of two local observers cannot close a shared upstream connection still owned by the other.

The connected controller owns one upstream lease independently of its local listener count; this supports imperative connect/getSnapshot without subscribe. subscribe/unsubscribe only manage callbacks. disconnect/dispose releases that controller's lease, while React unmount releases its own controller lease. “Last observer” means the last connected controller lease, not the last callback. Manual-disconnect state belongs to each controller, not the shared feed, so one view cannot disconnect another.

`refetch()` performs one authorized snapshot reconciliation without changing a manually disconnected state or leaving a feed/timer open. A watch-only job need not expose `get`: obtain its snapshot under the permitted watch operation and close that temporary watch after the snapshot; use get only when also exposed. The same rule applies to setup/terminal reconciliation, so a watch grant never silently requires a broader operation grant. connect/refetch without a usable run/identity fails before network I/O. Disconnect or disposal during setup settles every waiting connect promise with an observer-aborted error and ignores late snapshots; no abandoned pending promise remains.

#### 11.6 Reconnect, offline, and terminal behavior

Use exponential backoff with jitter, a bounded delay, and a retry budget appropriate to observer lifetime. Honor server retry hints and authorization expiry. The server may suggest reconnect timing without turning an observer into a retry owner for the task.

Reconnect with a valid native cursor where supported. When continuity is not available, emit `reset` with current state; retain a visible gap marker for history views. A lost browser connection during completion must recover the final state and stop reconnecting. Reconnecting to an already completed run performs an authorized snapshot read and returns `completed` without opening an infinite feed.

On identity change, close old connections before establishing new ones. Clear old run/output/progress values; do not momentarily render the prior tenant's data under the new identity. Distinguish browser offline state from provider outage, application server outage, and authorization failure.

#### 11.7 Resource bounds and subscriber isolation

Limit watches per identity, upstream streams per service, active native reads, pending frames, maximum frame bytes, and stream bytes delivered. Document defaults and server-enforced maxima. Multiplex only identical application/environment/identity-scope/job/run/projection keys.

State snapshots can be coalesced to the newest authoritative value under pressure; mark a state gap when necessary. Historical records and content chunks cannot be silently dropped. Overflow must produce a resumable gap/reset or an explicit typed failure. A consumer selecting every historical record requires a native history capability, not unbounded process memory.

A shared adapter poller is ref-counted. When the last observer leaves, it stops. No per-render timers, unbounded listener maps, request-specific SDK globals, or permanent subscriptions after tab navigation are permitted.

#### 11.8 React integration

`useJobTrigger()` delegates to the existing mutation infrastructure and retains its normal TanStack result shape. Mutation retry defaults must preserve the existing ambiguous-write behavior: do not silently retry a trigger with a fresh idempotency key. Provide an explicit recover/retry path with the original key and operation outcome.

In `react/finite-hooks.ts` and `pending.ts`, prepare the effective job request before rememberPending: preserve a supplied operationId or generate one once, send that same ID in the RPC payload, and record the digest of that exact request. Currently rememberPending generates an unrelated ID and stores only a digest; retaining that entry alone cannot recover a job submission. Extend its metadata for jobs with the original idempotency key, safe recovery action/window and request digest, and preserve the same identity on explicit recovery. Ordinary route and agent pending behavior keeps its current protocol. Never persist raw task input in sessionStorage automatically; hold it in the mutation/controller state. After reload, the application must re-supply matching input/options and pass the stored digest check before permitted recovery. A new key or different input is a new intent, not recovery.

Transport loss after dispatch, the structured unknown error and an aborted acceptance wait all retain pending state; a known rejection or confirmed receipt clears it. Unknown state must survive reset/unmount without becoming an automatic replay queue. A changed selected run clears only that view; it must not delete an unrelated pending submission. A changed principal/session clears old scoped pending metadata and sensitive mutation/query state. Missing/denied/quota-exhausted sessionStorage leaves in-memory unknown handling usable with reload recovery explicitly unavailable. At recovery expiry, mark the intent unrecoverable rather than deleting its unknown-outcome evidence. Keep at most 100 tracked job intents per identity and reject additional tracked submissions at capacity; verified resolution or explicit dismissal frees a slot. Never silently evict a still-unknown intent or grow an unbounded payload cache.

`useJobRun()` owns/ref-counts the same non-React controller. The query key includes application, environment, authenticated identity scope, job ID, run ID, and projection/schema version. Undefined `runId`, unavailable client identity, or `enabled: false` prevents automatic connection. Hook cleanup releases its own lease; React Strict Mode remounts must not leak or duplicate native subscriptions.

The returned object exposes `run`, `connection`, `isStale`, `lastObservedAt`, `connectionError`, `connect`, `disconnect`, and `refetch`. Hook selectors are operation-specific: useJobRun requires watch, useJobTrigger requires trigger, useJobCancel requires cancel and useJobRetry requires retry. Mutation hooks accept the corresponding generated procedure input/options and return normal TanStack mutation results; no hook exposes undeclared operations. Keep cancel/retry as explicit mutation helpers with pending/error receipts rather than conflating them with connection controls.

For server rendering, generate types and optionally prefetch authorized snapshots; never start a live subscription during render. Hydration must use the same identity-scoped key, reauthorize, and reconcile. Document how Next/Vite generated entry points avoid bundling server code.

#### 11.9 Named output streams

Optional task declaration and use:

```ts
const summarize = defineTask({
  id: "documents.summarize",
  version: "1",
  execution: "retryable",
  input: summaryInput,
  output: summaryOutput,
  streams: { text: z.string() },
  handler: async (input, ctx) => {
    const result = await summarizer.run(input, {
      signal: ctx.signal,
      onText: (text) => ctx.streams.text.emit(text),
    });
    return result;
  },
});

// With stream access explicitly exposed by the job:
// For the exposed job declared with name: "summarizeDocuments".
const chunks = await client.jobs.summarizeDocuments.runs.stream({
  runId,
  name: "text",
});
```

Stream names/items are generated types. Each stream has its own cursor, retention, attempt identifier, and completion condition. A restarted attempt may produce a new generation of content; the UI must not append duplicated text as though it came from one uninterrupted model call. Default stream observation is best-effort live/native retained according to the service; strict recovery requires a declared capability.

A closed content stream is not proof the job succeeded. The task may still validate or persist its result. Final run state remains authoritative. Input streams and approval/resume controls are excluded from this revision.

---

### 12. Authorization, tenancy, and security

#### 12.1 Private by default

Task discovery does not expose a browser endpoint. An implicit job is server-only. An explicit job remains private unless it declares `client`. A `client` policy requires exactly one of `public: true` or `authorize`, following the existing agent-policy convention. [R10]

Even public jobs require rate limits, payload limits, allowed operations, and safe projections. `public: true` does not expose Inspector, service credentials, native admin APIs, other job definitions, or arbitrary cancellation across all runs.

#### 12.2 Authorization contract

Define a typed callback, implemented by the application:

```ts
type JobClientOperation =
  | "trigger" | "get" | "list" | "watch" | "cancel" | "retry" | "stream";

interface JobAccessRequest {
  operation: JobClientOperation;
  jobId: string;
  runId?: string;
  stream?: string;
  input?: unknown; // Validated task input for trigger, not trusted tenant identity.
}

interface JobAccessGrant {
  scope: string;  // Stable application-controlled tenant/owner scope.
  expiresAt?: string;
}

type JobAuthorize = (
  request: JobAccessRequest,
  context: JobAuthorizationContext,
) => Promise<JobAccessGrant>; // Throw a declared authorization error to deny.
```

`JobAuthorizationContext` reuses the existing request authentication/context facilities. It provides server-verified principal/session information and safe run ownership metadata when a run is requested. The callback cannot be replaced with a client-supplied boolean. Public mode receives a dedicated server-assigned public scope; multi-user isolation then requires an explicit authorization policy.

Validate the callback result at runtime: a nonempty bounded scope and, when supplied, a valid future RFC 3339 expiresAt are required; booleans, malformed/expired grants and callback errors deny access. The current `requireClientAuthorization` helper in `runtime-hono/src/client-authorization.ts` accepts only boolean true for agents/channels; reuse its bounded authorization lifetime, not its boolean result contract, and preserve those existing callers. Job authorization has a 10-second maximum and obeys caller abort; late resolution after abort/expiry cannot authorize SDK work or frame delivery. Revalidation may renew a grant for the same scope; a different scope terminates the old feed and clears its sensitive state before any new connection.

On trigger, derive scope from the trusted session and persist it through supported native metadata or a secure native namespace. On reads/controls, resolve native run ownership and verify the grant against it before returning payloads, output, or detailed errors. The implementation must not trust `input.tenantId`, tags supplied by the browser, or a visible run ID as proof of ownership.

Trusted server submissions propagate the verified scope in invocation-local operation context; nested function/task calls cannot replace it using payload fields. An explicit privileged runWithJobs bootstrap or a static schedule without an end-user grant uses an application/environment-scoped system identity, distinct from the public-client scope. Dynamic schedule upsert stores its operator-authorized scope in native schedule metadata and ticks preserve it; a later operator may not silently transfer that ownership. No browser authorize callback is invoked with a fabricated session at tick time. Scheduled/manual-retry runs remain subject to ordinary ownership checks when read from a browser, even if the same job is publicly exposed. Worker auth has service identity plus scope, never a serialized user session.

Filter translation must enforce authorized scope before pagination. Native APIs unable to query safely by scope must use an isolated native namespace or fail list capability for that binding. Filtering an unbounded privileged result set in the browser is forbidden.

#### 12.3 Long-lived connections

Authorize initial connection and each resumed connection. Enforce grant/token expiry during a live feed; refresh through the application policy or terminate. Support revocation checks using the same application identity lifecycle as existing realtime/agent clients. A still-open TCP connection is not a permanent authorization grant.

Private fields are projected on the server before serialization. Native broad credentials remain on the server. Native public token scope must be no broader than the job/run/stream and projection permitted by Relkit; otherwise use the proxy path.

#### 12.4 Writes and controls

Trigger, retry, cancellation, and schedule changes require explicit operation authorization. Use CSRF/origin checks for cookie-authenticated writes, existing CORS policy, bounded request parsing, and replay protection where applicable. Provider callback endpoints verify native signatures and replay windows separately from application client authorization.

Store cancellation and retry operation identity using a supported native idempotency mechanism or return an honest ambiguous result. A timed-out control request must not be blindly repeated as a new retry run. Logs include actor, scope, action, target, native receipt, and outcome, with secret redaction.

#### 12.5 Secrets, data retention, and worker identity

Provider credentials are environment/binding secrets, never graph literals or generated browser content. Secrets are resolved in runtime workers and native deployment configurations. Persist only the task's allowed canonical input and explicit execution metadata, not the originating request object, cookies, or bearer token.

Workers recreate service clients from application configuration. They use a trusted service execution identity plus the authorized submission scope. Do not serialize an entire user session to make it available days later. Applications must explicitly decide which business permissions to recheck at execution time.

Apply payload/output/log/stream redaction and limits independently. A safe public error never includes raw provider credentials, database URLs, stack traces, or private input. Retention expiry yields typed `expired`/unavailable result metadata rather than a fabricated successful empty result. Document native deletion and backup retention; do not promise deletion from backups that the selected service cannot enforce.

---

### 13. Integration with existing Relkit modules

#### 13.1 Functions and shared invocation internals

Do not alter `defineFunction` into a durable executable or add sleep/resource policy to its public context. A function may trigger a task and return its handle immediately. Shared invocation internals may provide schema validation, context registries, tracing, logging, cancellation propagation, and error projection to both executable kinds, without pretending their lifecycles are the same.

A task may call an existing function's `.invoke()` for immediate reusable business behavior. That call is not checkpointed and may repeat when the task retries. The task's cancellation signal and trace context flow into it; its own validation and service policies remain in force. No task policy is silently inherited by direct function calls outside a task.

Add `tasks` to supported dependency types and context factories. Job dependency `.trigger()` and task dependency `.trigger()` use one invocation bridge. Direct descriptor submissions are resolved by the active runtime, not by a process-global arbitrary default application. Reject calls outside a bound runtime with a typed error.

#### 13.2 Domain services

Extend `defineService` deliberately, since the inspected implementation currently groups functions and events. Add typed `tasks` and `jobs` member maps with the same identity-preserving semantics, duplicate-name checks, reserved-name validation, graph ownership, and compiler discovery rules. [R6]

```ts
export const notifications = defineService({
  functions: { requestFollowUp },
  tasks: { sendFollowUp },
  jobs: { followUp: followUpJob },
});

await notifications.sendFollowUp.trigger(input);
await notifications.followUp.trigger(input);
```

Service membership does not create duplicate task definitions, change explicit durable IDs, or expose jobs to browser clients. A member with an ambiguous default job still requires explicit selection. Direct and context calls produce the same graph relationship and authorization behavior.

#### 13.3 Events and independent downstream tasks

Tasks can publish through existing declared event clients and trigger other tasks. Preserve trace/correlation and event contracts. Those effects may be repeated after a task crash. Require explicit stable business/idempotency keys for downstream submission where duplicate work is unsafe.

Do not claim that publishing an event or triggering a child is atomic with an application database transaction. Document the application-owned transactional outbox pattern and native idempotent submission where available. No mandatory framework database is added for this purpose.

Do not add another event-subscription DSL in this release. Existing Relkit event-handler functions can submit a task through the same `.trigger()` API. Future native event-trigger optimization must preserve existing event delivery semantics and be separately capability-tested.

#### 13.4 Agents and native graphs

A task can invoke a declared agent through `ctx.agents` and pass cancellation, trace, and explicit thread/run correlation. Existing agent state providers and native graph checkpointers remain authoritative for agent continuation. This proposal removes only the earlier *new job-state requirement*, not existing agent-state configuration needed by agent features.

Task retries around an agent do not automatically resume the same agent turn. The application must use the existing supported agent identity/continuation contract or accept a fresh invocation. Reuse agent receipts where available and test replayed task invocation against tool side effects. Do not invent a new human-approval inbox or combine graph and task state machines.

Provide an example of an agent-triggered background task using an existing function tool that validates input and calls a task's `.trigger()`. It returns a handle, not a long blocking wait. Preserve tool approval policy and do not allow the agent to choose arbitrary jobs-service credentials or resource settings.

Application topology may show `function -> job -> task -> agent` and link the task run to the existing agent/graph view. It must not label native agent graph nodes as new Relkit workflow definitions.

#### 13.5 Buckets, cache, database, and logging

Resolve declared buckets/cache through the existing provider runtime. Large task payloads and results use explicit bucket references with scoped access and retention. Cache entries never substitute for durable run state, acceptance receipts, or authoritative idempotency.

Recreate application database clients in the task worker through the existing registered context extensions. No database adapter is mandatory merely to declare a task. The provider's own infrastructure database is isolated from application data by namespace/connection and shown in the deployment plan.

Reuse existing structured logging and OpenTelemetry facilities. Every task execution span contains application, environment, job/task/version/build, service, run ID, attempt, and correlation identifiers. Link producer and consumer spans rather than holding an HTTP span open for days. Replays and resumptions are identifiable; repeated logs are not silently removed from the operational history.

---

### 14. Inspector: jobs, runs, filters, and controls

#### 14.1 Navigation and distinct resources

Add a **Jobs** area with **Definitions**, **Runs**, **Schedules**, and **Services** tabs. Do not mix one job definition with one run instance in a generic list. Add a task detail page linked from the job definition and application graph.

The current generic runtime collection projection must not be reused to load all native runs into memory and paginate afterwards. Implement jobs-specific bounded list/query contracts with native filter pushdown, projected safe fields, and explicit service availability. [R7]

Definition rows show the API job name as the primary label, durable job ID as secondary/copyable identity, explicit/implicit binding, task ID/version/build, selected jobs service, execution mode, declared capabilities, schedule count, and current health. A definition with no runs is still visible. A retired definition with retained runs remains discoverable without becoming triggerable again.

#### 14.2 Required run filters

| Filter | Semantics |
|---|---|
| Status | Multi-select normalized queued, delayed, running, sleeping, retrying, completed, failed, cancelled, timed-out states. |
| Activity preset | `active` means nonterminal; `running` means executing, not merely accepted. |
| Job/task | Search/select by declared job name or exact durable job/task IDs; resolve names to IDs before bounded native queries. No implicit punctuation conversion. |
| Jobs service/provider | Isolate a configured binding; include service generation when viewing history. |
| Task version/build | Separate semantic version from immutable deployed build. |
| Time range | Accepted/started/completed timestamps with explicitly selected field and timezone. |
| Scope | Authorized tenant/owner scope; privileged Inspector permission required to broaden it. |
| Tags | Supported native exact matching with explicit AND/OR behavior. |
| Run/correlation/parent IDs | Exact or supported indexed lookup; no arbitrary unbounded fuzzy scan. |
| Failure/attempt | Safe normalized failure kind and supported attempt filters. |

Core release requires at least service/job/task/status/accepted-time filtering and run-ID lookup. Inspector must display `jobs.<jobName>.trigger()` in copyable usage examples; provider IDs remain secondary diagnostics. Additional filters are capability-visible; disabled UI explains why rather than accepting a filter and ignoring it. “Running” must not match a native sleeping record just because its provider's broad status label is running.

Status badges show native status and normalization evidence on hover/detail. When sleep/cancellation evidence is unavailable, show the known state and an uncertainty/detail marker, not a fabricated exact phase.

#### 14.3 Pagination, aggregation, and refresh

Use opaque filter-bound cursors, default bounded page sizes, maximum page sizes, and stable ordering by accepted time plus run identity. Separate ordering/filter pagination from live updates so a live insertion cannot silently replace rows during user selection.

Across multiple services, request bounded pages concurrently with limits, merge deterministically, and retain per-service cursors in the aggregate cursor. A down service returns a partial-result warning naming that service; its runs are not reported as zero. Timeouts, counts, and `hasMore` must reflect partial/approximate results.

Advance each service checkpoint only through rows actually emitted in the merged page. Fetching 25 from A and 25 from B, returning 25 total, then saving both end-of-page cursors loses the other 25 rows. Use native per-row continuation where available, or a stable native page-start cursor/watermark plus a consumed-row checkpoint to reread a bounded page. Never put leftover payloads in the public cursor, scan from history start or rely on a process-local leftover buffer for correctness. If native mutation/retention makes the checkpoint unsafe, return a typed invalid/expired cursor and require refresh instead of silently skipping or duplicating rows. Tie-break across services by `(acceptedAt descending, serviceGeneration, stable native acceptance identity)`; signing-key rotation cannot reorder equal timestamps.

The aggregate cursor seals query, identity/projection, selected service generations and native checkpoints and remains within the 4096-byte bound; reject an oversized selection and request narrower service filters. An unavailable service is not advanced or marked exhausted. Partial results never claim globally complete counts/history. Including a recovered service requires a refreshed aggregate query when doing so would invalidate prior ordering; it is not silently inserted into a later page. Test uneven page consumption, ties, service recovery, filter changes and cursor reuse after an API restart with no duplicates or skipped healthy rows.

Exact total counts are optional and only displayed when native sources support them. Otherwise show page counts or labeled estimates. Provide pause/resume live refresh, URL-persisted filters, and a “new runs available” indicator rather than reshuffling a user's selected historical page.

#### 14.4 Run detail

Show task/job/service identity, version/build, native link when safe, normalized/native status, accepted/start/finish/next-wake times, active and elapsed durations when measured, attempts, cancellation receipt, selected resources versus actual worker class, and allowed controls.

Tabs include **Overview**, **Attempts & waits**, **Input/output**, **Progress & streams**, **Logs & traces**, and **Related runs/agents**. Display field redaction, data expiry, unsupported history, polling freshness, and reconnection gaps explicitly. Raw input/output preview is permission-gated and byte-limited.

Wait rows include stable key, requested duration/instant, stored due time, completion evidence, and whether the provider holds/releases capacity. Retry rows separate application attempt from replay/resume count. Do not synthesize a complete timeline from intermittent snapshots.

#### 14.5 Actions and controls

Allowed actions: trigger job with schema-generated input form, cancel active run, retry terminal run as a new run, copy run ID, open permitted native view, pause/resume supported schedules, and inspect service health. Destructive or cost-incurring bulk actions require an explicit selection preview, bounded batch size, and confirmation.

Use the same backend control/authorization layer as generated clients plus Inspector-specific privileges. A confirmation click returns a request receipt; the UI stays pending until native state confirms the transition. Unsupported actions are disabled with a capability explanation.

Disconnecting the live view is a view action and never cancels the run. Closing the Inspector tab must not impact workers or schedules. Preserve current production Inspector exposure defaults; job features must not enable internal endpoints automatically.

#### 14.6 Graph and accessibility

Add distinct task and job graph node types and edges for job-targets-task, task/function-triggers-job, task-invokes-function, task-invokes-agent, and task-publishes-event. Show declared and observed relationships separately. Implicit jobs are visibly marked, not invisible execution infrastructure.

Lists must support keyboard navigation, accessible status labels, loading/empty/error states, reduced motion, and non-color-only state indications. Tests cover large bounded pages, long IDs, narrow screens, live filter changes, native outages, and missing/expired records.

---

### 15. Scheduling and delayed submission

#### 15.1 Schedule declaration

```ts
export const cleanup = defineTask({
  id: "maintenance.cleanup",
  version: "1",
  execution: "retryable",
  input: cleanupInput,
  output: cleanupOutput,
  handler: cleanupHandler,
});

export const cleanupJob = defineJob({
  name: "cleanup",
  id: "maintenance.cleanup",
  task: cleanup,
  service: "scheduled",
  schedules: [{
    id: "nightly",
    cron: "0 2 * * *",
    timezone: "Asia/Riyadh",
    input: { olderThanDays: 30 },
  }],
});
```

A schedule creates new task runs; it does not keep one task asleep forever. Schedule state and ticking belong to the native jobs service. No Relkit process-local cron loop or second generic scheduler database is introduced.

A static schedule input must pass task input validation. Dynamic per-tick application behavior runs inside the task using stored `scheduledFor`, not an import-time callback that reads the current clock during compilation.

#### 15.2 Portable syntax versus native behavior

Accept five-field cron and an explicit IANA timezone for the common declaration. Interval schedules use `every: DurationInput`, exclusive with `cron`. Accept only recurrence modes supported by the selected native service. Do not infer recurrence parity from a provider offering delayed jobs; cron, intervals, overlap, and missed ticks are certified independently.

Document native daylight-saving handling, overlap, catch-up/misfire behavior, registration limits, and maximum horizon in the compiled capabilities. Do not silently change a provider's “one overdue execution” policy into “replay every missed tick.” effect-mq's repeatable-job documentation describes native ticking/reconciliation behavior that must be respected. [M3]

Optional `overlap` and `misfire` controls are accepted only when native semantics can match the requested value. Omission means documented native policy, reported in Inspector. No portable distributed lock/scheduler is added merely to emulate an unsupported option. The API shape remains standard; capability failures remain explicit.

#### 15.3 Reconciliation and ownership

Give each native schedule a stable ownership identity containing application, environment, jobs service, job ID, and schedule ID. Reconcile only owned schedules. Identical deployment is idempotent and does not create duplicate ticks. Different environments and preview branches cannot overwrite production schedules.

Create/update schedules only after the target build is deployed and routable. Update desired static schedules using native idempotent APIs. Preserve user-created dynamic schedules unless explicitly covered by a declared ownership policy. A missing schedule is not permission to delete unrelated native schedules.

On version rollout, pin or atomically switch the schedule's target according to the provider's supported deployment mechanism. Already accepted runs stay on their original build. A deploy failure must not leave a schedule firing at nonexistent code.

Diff desired static schedules against retained ownership metadata: removal deletes only the previously owned static schedule using native idempotent operations, and never deletes an operator-owned schedule with a similar ID. A no-op deployment preserves an operator pause; updating its target/input also preserves that pause unless an authorized resume is explicitly requested. Ownership scope and canonical input follow §§0.5/12.2. Reconciliation ambiguity remains visible and blocks a claimed successful activation; retry the same owned operation instead of inventing a replacement schedule ID.

#### 15.4 Delays and clocks

`trigger(input, { delay: "10 minutes" })` and `{ at: "2026-09-15T09:00:00+03:00" }` submit a durable future execution. `delay` is measured from acceptance; `at` is an absolute instant. They are mutually exclusive. A past `at` means earliest eligible execution now, unless the call explicitly requests rejection through admission policy.

Validate delay/horizon against provider limits before acceptance wherever possible. Worker downtime must not lose the timer. Distributed timing relies on native persisted time/clock semantics, not the browser clock. `scheduledFor` remains the original intended instant even if capacity delays actual start.

#### 15.5 Scheduling tests

Test duplicate deployments, concurrent reconciliation, native outage during update, worker downtime spanning multiple ticks, timezone/DST transitions, leap-day input, paused schedules, deleted targets, preview isolation, and schedule target version changes. A second deployment must not create a second copy of a due execution under the same native schedule identity.

---
### 16. Compiler, packages, deployment, and versioning

#### 16.1 Package ownership and dependency direction

Keep core implementation in `packages/jobs`. Public authoring uses `@relkit/app/tasks` and `@relkit/app/jobs`. Add server-only and adapter-author contracts as focused exports rather than installing every provider into `@relkit/app`.

The dependency direction is contracts/schema/provider/invocation primitives -> jobs authoring/runtime contracts -> engine/runtime integration -> optional provider integration. Browser client packages depend only on safe run contracts and generated schemas. If current function-owned job types create a circular dependency, move the minimal serializable reference/client types into a lower-level contract module and re-export old names temporarily. Do not solve the cycle with untyped dynamic imports in public declarations.

New integrations: `@relkit/trigger`, `@relkit/inngest`, and `@relkit/effect-mq`. Each integration declares its authoring export, runtime export, `job` capability registration, compatibility version, and optional local/deployment entry points using the existing integration catalog. The core must not import these package implementations directly.

No `@relkit/workflows`, task checkpoint store, or mandatory `@relkit/job-state` package is added.

#### 16.2 Common runtime adapter contract

Define serializable operation requests and runtime-only execution bindings separately. The following sketch fixes ownership; generics, operation-specific results, and schema brands must be completed in implementation.

```ts
interface JobsAdapterRuntime {
  readonly kind: "jobs-adapter-runtime";
  readonly protocolVersion: 1;
  readonly capabilities: JobsCapabilityReport;
  readonly submit: (request: NativeSubmission, context: OperationContext) => Promise<NativeReceipt>;
  readonly get: (locator: NativeLocator, context: OperationContext) => Promise<NativeRun>;
  readonly list: (query: NativeRunQuery, context: OperationContext) => Promise<NativeRunPage>;
  readonly observe: (
    request: NativeWatchRequest,
    context: OperationContext,
  ) => AsyncIterable<NativeObservation>;
  readonly cancel: (request: NativeCancelRequest, context: OperationContext) => Promise<NativeControlReceipt>;
  readonly close: () => Promise<void>;
  readonly schedules?: NativeScheduleOperations;
  readonly streams?: NativeStreamOperations;
}

interface TaskExecutionBinding {
  readonly run: VerifiedNativeRunContext;
  readonly signal: AbortSignal;
  readonly isSuspension?: (cause: unknown) => boolean;
  readonly sleep?: NativeDurableSleep;
  readonly progress?: NativeProgressWriter;
  readonly streams?: NativeStreamWriters;
}
```

`OperationContext` contains scoped cancellation, caller deadline, trace propagation, trusted application/environment/scope, and the selected service-generation binding. `NativeSubmission` contains canonical payload, pinned definition/build identity, normalized policy, submission identity, and permitted metadata. Validate native receipts and callback envelopes before passing them into the shared task engine.

`observe` can adapt native push or declared polling. The execution binding is constructed only from a verified native worker invocation. Browser-supplied run metadata can never construct one.

Optional features absent from the runtime contract must be absent/disabled in the capability report and fail preflight when requested. Mandatory adapter operations must not be stubbed as successful no-ops. Normalize typed errors for validation, forbidden access, not found, retention expiry, unsupported capability, native rate limit, service unavailable, ambiguous write, protocol mismatch, and cancellation.

Manual retry is a common authorized operation that retrieves permitted original input/version and submits a new run with native deduplication. Use a native replay API only when it produces the same new-run semantics and selection policy; never silently rewind an old run.

#### 16.3 Compiler changes

Extend descriptor discovery and validation for task kind; retain strict duplicate IDs and schema diagnostics. Compile task -> job -> service mappings after all descriptors are known. Detect invalid/reserved/duplicate job names, name-to-ID mapping conflicts, implicit/explicit binding collisions, missing/default service, incompatible execution mode, function-as-job-target, unsupported resources, invalid duration conversions, private-client leakage, and ambiguous task triggers.

Emit versioned `.relkit/generated/jobs.manifest.json` containing definitions with literal names and resolved durable IDs, deterministic name-to-ID mappings, implicit bindings, canonical policies, schema hashes, provider registrations, service-generation references, worker entry points, local recipe dependencies, and compatibility results. Do not include secret values or accepted user run payloads.

Include jobs/tasks in graph hashes, generated app contracts, Inspector protocol metadata, provider requirements, packaged manifests, declaration generation, and release checks. Sort deterministically. A configuration-only no-op must not generate a different native task identity or duplicate schedules.

Compiler failure keeps the last-known-good development runtime active, but the UI must show new source diagnostics. It must not partially activate new jobs against an old task build.

#### 16.4 Build identity and native worker generation

Separate stable task ID, semantic task version, immutable code build ID, stable job ID, native definition ID, and service-generation binding. A run records all relevant identities or an immutable locator to them. Build hashing includes worker dependencies, schema/codec versions, adapter wrapper semantics, and executable code that affects replay.

Changing the same semantic version's source still creates a different immutable build; running tasks remain pinned. Reject incompatible replay changes under an unchanged semantic version where analysis can detect them, and require version changes for schema/wait-structure changes. No claim of complete static replay compatibility analysis is made.

Generate native entry points that boot worker-safe Relkit context, validate signed native invocation envelopes, execute the task engine, and release scoped resources. Generated native definitions must be independently runnable in the provider's supported runtime. User task code must not depend on a still-running application HTTP process.

#### 16.5 Bun and provider runtime constraints

Keep Relkit authoring/build and owned task workers TypeScript/Bun-first. Verify each provider's supported runtime and SDK dependencies with the repository's pinned Bun and Effect versions. A provider's managed worker may require its own runtime; report this explicitly in the service plan and validate worker-safe modules. Do not claim Bun-only execution while silently deploying incompatible Node-only code.

Reject Bun-specific application imports for a managed runtime that cannot execute them, with source diagnostics and a documented supported alternative. Do not force end developers to author Effect generators or Effect schemas just because one adapter uses them internally.

#### 16.6 Deployment through existing infrastructure integration

Retain Pulumi as Relkit's deployment engine; no switch to another engine is part of this work. Provider-native deployment CLIs/APIs may publish native tasks as explicit staged actions in the Relkit deployment plan, with secrets, prerequisites, outputs, and failures managed through the existing integration boundaries.

Deployment ordering: provision/select service infrastructure -> resolve secrets -> publish worker build -> register executable definitions -> verify invocation and read capabilities -> update owned schedules -> activate HTTP/client contract. Activation is blocked when a required native task deployment fails. Retry deployment idempotently; compensate only resources owned by the failed change.

Rollbacks select a prior compatible build for new submissions without moving in-flight runs. Native service removal, resource shrinking, and retention changes require visible impact analysis. Keep historical bindings and key material routable through the documented run retention horizon.

#### 16.7 Operations and diagnostics

Add proposed `relkit jobs` commands through the existing CLI command framework: `list`, `runs list/get/watch`, `trigger`, `cancel`, `retry`, `capabilities`, and schedule administration. Use the same typed operation layer and authorization as runtime/Inspector. Provide `--json` output and nonzero exit status on rejected/ambiguous operations; never turn unknown acknowledgement into success.

Reuse `relkit local up/status/stop/reset` with jobs service selection and reset --dry-run/--yes as fixed in section 0.10. Add startup diagnostics for no workers, incompatible build, missing database migration, impossible resource mapping, expired native credentials, unsupported native SDK version, and unavailable Docker.

Metrics include acceptance latency, queued age, active/sleeping/retrying counts, task duration, retry/cancel outcomes, native API throttling, watch subscriber count, upstream connection count, resets, polling load, and cleanup failures. Cardinality policy must not put every run ID or raw tenant value into metric labels; use traces/logs for per-run detail.

---

### 17. Documentation, examples, and scaffolding

#### 17.1 Documentation is a release dependency

The repository has `apps/docs/content/docs`, generated API pages, example sources, and documentation verification configuration. Update those existing mechanisms instead of creating an unlinked Markdown island. Generated API reference must be regenerated from exports and examples; do not edit generated reference output as the sole source of truth. [R9]

Documentation must clearly distinguish **existing functions**, **new tasks**, **job bindings**, and **jobs services**. The main introduction must not retain the previous “task is just a function” model. All task/job examples use `.trigger()` and readable durations; compatibility examples explicitly identify legacy `.enqueue()`.

#### 17.2 Required page set

These are proposed canonical content paths under `apps/docs/content/docs`. Integrate redirects and sidebar metadata with the actual existing navigation during implementation.

| Path | Required content and example |
|---|---|
| `jobs/index.mdx` | Function/task/job/service/run vocabulary; scope and no workflow prerequisite. |
| `jobs/quickstart.mdx` | Fresh account-free Docker project, first task, trigger, watch, restart, cleanup. |
| `jobs/tasks.mdx` | Full task declaration, schemas, context, retries, replay-safe handler, hooks. |
| `jobs/bindings.mdx` | CamelCase names versus durable IDs, implicit-name resolution, explicit jobs, defaults, multiple services, direct/context dot-access trigger. |
| `jobs/durations-and-sleep.mdx` | Effect-style strings, stable sleep keys, replay caveats, delay versus sleep. |
| `jobs/execution-policy.mdx` | CPU/memory, concurrency scope, duration clocks, limits, typed capability errors. |
| `jobs/retries-and-idempotency.mdx` | Attempt versus resume, external idempotency, unknown acknowledgements, manual retry. |
| `jobs/clients.mdx` | `client.jobs.exportOrders.trigger`, named selectors, generated plain client, controller, React/TanStack, SSR, connect/disconnect/cleanup. |
| `jobs/progress-and-streams.mdx` | Native metadata versus content streams, native retention, reset/gap behavior. |
| `jobs/security.mdx` | Private defaults, public/authorized exposure, scope ownership, redaction, tokens. |
| `jobs/schedules.mdx` | Cron/interval syntax, native policy differences, reconciliation and pause/resume. |
| `jobs/inspector.mdx` | Definition/run lists, running/status filters, native gaps, controls and permissions. |
| `jobs/docker.mdx` | Recipes, persistence, port routing, volumes, startup, restart, supported host architectures. |
| `jobs/deployment.mdx` | Worker topology, Pulumi/native publication, version pinning, draining, rollback. |
| `jobs/testing.mdx` | Test harness, fake clock, adapter conformance, Docker, failure injection. |
| `jobs/migration.mdx` | Old function targets/config/enqueue, new task extraction, compatibility and historical runs. |
| `jobs/troubleshooting.mdx` | Unknown submission, unavailable workers, retry duplication, sleep limits, stale watch. |
| `jobs/providers/{trigger,inngest,effect-mq}.mdx` | Installation, connection/Docker, worker deployment, verified capability table and limits. |
| `jobs/providers/comparison.mdx` | Actual certified deployment variants; no provider-brand all-feature promises. |

Update existing function, service, event, agent, graph, realtime, generated-client, configuration, CLI, deployment, and Inspector pages to link to task/job behavior. Clarify that existing agent graphs and state remain separate; removing the workflow proposal does not remove shipped agent graph features.

Add/regenerate `api/tasks.mdx`, `api/jobs.mdx`, `api/client.mdx`, `api/config.mdx`, service reference, and integration references. Include export maps, types, full parameter defaults, limits, errors, and examples in reference generation inputs. Update `meta.json`, search indexes, cross-links, sitemap/LLM-readable docs where the existing pipeline generates them.

#### 17.3 Executable examples

Keep a single authoritative source fixture for every copied documentation example. Add a task/job example to the canonical commerce application and a minimal standalone tasks template; examples must not require real paid APIs or send real emails.

Required scenarios: delayed email simulation using an idempotent fake business service; CSV export with typed progress/result; scheduled cleanup through an account-free native scheduler; function/route-triggered task; agent tool triggering a background task; direct and context calls; multi-service selection; filterable Inspector; React reconnect; and a replay-safe sleep followed by restart.

Business helpers in docs are explicitly named application code, not invented framework exports. Provide their complete fixture implementations in executable examples. Avoid snippets where a button triggers work but discards the returned run ID, or where an error causes a new idempotency key to be generated automatically.

#### 17.4 Scaffold and local commands

Add task/jobs choices to `create-relkit` using the current scaffold framework. The default proposed noninteractive flag is `--jobs inngest-docker`; offer `effect-mq-docker` for retryable-only examples and `trigger-docker` with explicit self-hosted requirements when certified. Do not advertise flags before implementation or silently choose a different engine for a selected task mode. Preserve all current no-cloud defaults and existing templates.

The generated project includes dependencies, config, task source, optional explicit job, submission route, generated-client usage, tests, `.env.example` containing no real secrets, and scripts for dev/check/test/build/start. Docker state and generated secrets belong under ignored local runtime paths, never committed source.

Run the published-package pack-and-smoke scaffold test on a fresh directory without a provider account. Verify the README commands work from the generated project and Docker restart preserves the example run. Stop/reset commands must be documented separately so users do not accidentally delete their state.

#### 17.5 Documentation quality gates

Compile/typecheck all public snippets against generated declarations. Execute local examples in CI, run navigation/link/search/reference consistency checks, and verify every documented capability matches the adapter fixture matrix. Test each supported command against `--help` output or a CLI fixture.

Review docs for non-identifier job keys, bracket-only job examples, extra providers outside the three selected integrations, hidden state requirements, unsupported universal sleep/retry claims, false exactly-once language, resource scope confusion, and mixing observer disconnect with run cancel. Documentation and generated clients must ship in the same release as the corresponding adapter behavior.

---

### 18. Test strategy and release gates

#### 18.1 Testing principles

Tests verify semantics, not that an SDK mock was called with a plausible option name. Each claimed durable capability requires a native integration test and a restart/failure test. Unit mocks remain useful for validation and error paths but cannot certify persistence, concurrency, sleep recovery, SDK cancellation, or deployment/version routing.

Use deterministic clocks and seeded randomness in common logic. Use actual native time/storage in provider conformance with bounded short waits. No multi-day test sleeps: validate conversion separately and use short supported native timers for recovery. Record the effective SDK/server/image/runtime versions and storage durability settings in every conformance artifact.

Prevent accidental billable operations: PR gates use local owned fixtures; managed-service acceptance uses isolated authorized test projects and explicit credentials/budget. Never run cloud mutation automatically in an untrusted fork. Missing cloud credentials means “not tested,” not “passed.”

#### 18.2 Suite ownership

| Layer | Main responsibilities | Release condition |
|---|---|---|
| Type and package | Task/job branding; schema inference; selectors; no function targets; server/browser boundaries. | All public declarations and package smoke imports pass. |
| Unit | Duration/policy validation; binding resolution; state mapping; cursor validation; error projection. | Deterministic cases and regressions pass. |
| Model/property | State/connection transitions, cursor epochs, bounded deduplication, policy precedence. | Seeded randomized transitions satisfy invariants. |
| Compiler/graph | Discovery, implicit/default bindings, output determinism, client exposure, new edges. | Golden artifacts plus semantic assertions pass. |
| Adapter contract | Native request/receipt mapping, required features, unsupported diagnostics. | Shared suite passes for every advertised adapter feature. |
| Native integration | Real submission, read/filter/control, waits, attempts, scopes, version routing. | Capability-specific native fixtures pass. |
| Restart/fault | Worker/store/server/browser failure at controlled boundaries. | No silent loss beyond documented durability window; correct ambiguity and recovery. |
| Client/React | Connect/disconnect, auth changes, gaps, SDK cleanup, cache isolation. | Unit controller tests plus real browser/native feed tests pass. |
| Inspector | Lists/filters/pagination/actions, outages, permissions, accessibility. | API and browser acceptance pass. |
| Deployment/Docker | Composite recipes, lifecycle, isolation, rollback, old versions. | Account-free clean-machine acceptance and existing storage/cache regression pass. |
| Docs/scaffold | Executable examples, generated API, links, templates, package installation. | Docs and packed scaffold smoke pass. |
| Load/security | Bounded observation, distributed caps, malicious inputs, tenant isolation. | Defined resource envelopes and security invariants pass. |

#### 18.3 Required type tests

Positive cases cover schema input transforms, output narrowing, progress types, stream names/items, declared errors, direct `.trigger`, context tasks/jobs, domain service members, multiple services, and generated client selectors. Test default durable mode and explicit retryable mode separately.

Negative type fixtures must reject: invalid/reserved literal job names, unknown generated job properties/selectors, a function target in `defineJob`; a job handler; missing task version; sleep on retryable context; invalid duration units; unsupported stream names; accessing excluded output fields; private job selectors; invalid task/job binding combinations; unauthorized operation names; context dependencies not declared; and server-only runtime imports from client builds. Application-wide collisions, implicit binding ambiguity and cross-service uniqueness belong in compiler fixtures after discovery; an isolated descriptor generic cannot detect another module's declarations. JavaScript/unsafe casts additionally require runtime validation fixtures.

Test generated declarations with `tsc --noEmit` and package-resolution fixtures, not only type assertions inside the monorepo. Include transformed input codecs and old task versions; those are common sources of false type safety.

#### 18.4 Shared native conformance fixtures

Define a reusable adapter harness accepting a service fixture, worker lifecycle controller, native API observer, and failure injector. The harness creates unique application/environment namespaces, registers generated code, and tears down only resources it owns.

Mandatory fixtures: echo task; transient-failure task; declared nonretryable failure; invalid-output task; keyed-sleep task; multiple-sleep/failure task; resource-bound task; cooperative cancel task; uncooperative CPU task; idempotent business-effect task; progress task; named stream task; scheduled task; scoped listing task; and two immutable versions of the same task.

Each fixture declares required capabilities. A provider may mark an optional capability unsupported, but every core capability it advertises must pass. An excluded test must name the unavailable feature, not silently skip the adapter's entire suite.

#### 18.5 Crash and race scenario matrix

| ID | Injection / setup | Required assertion |
|---|---|---|
| F01 | Lose HTTP response after native acceptance. | Caller sees unknown outcome; original key recovers the same run when receipt capability is advertised. |
| F02 | Submit same key concurrently from two API replicas. | One logical native run within native dedupe scope; both handles resolve consistently. |
| F03 | Kill worker immediately after claim, before handler. | Native recovery makes work eligible; no permanent invisible lease. |
| F04 | Kill after business effect, before native completion. | Replay may occur; idempotent fixture produces one business effect and correct final output. |
| F05 | Kill after sleep was committed. | Restart resumes/replays same run; completed wait does not restart a full duration. |
| F06 | Crash before/after two different sleep keys. | Stable wait ordering and due times; no repeated full wait or phantom attempt. |
| F07 | Fail before first sleep and after second sleep. | Total application retry budget is enforced; no native step budget multiplication. |
| F08 | Restart engine/storage while work is queued/delayed. | Acceptance durability matches configured persisted backend; no memory fallback. |
| F09 | Native lease expires while old worker is paused. | Native fencing rules prevent stale terminal overwrite; external idempotency remains necessary. |
| F10 | Cancel races with successful completion. | One native terminal result; request receipt differs from finality. |
| F11 | Cancel while asleep and while in uncooperative I/O. | No new durable wake after confirmed cancel; external call limits honestly reported. |
| F12 | Exceed active duration and elapsed deadline separately. | Correct clock/reason; sleep excluded only from active clock; retry does not reset elapsed deadline. |
| F13 | Memory exhaustion/process kill. | Native failed/recovered state remains queryable; supervisor doesn't strand invisible work. |
| F14 | Concurrent replicas and old/new versions hit one cap. | Declared distributed upper bound is not exceeded within that service scope. |
| F15 | Deploy new code while old run sleeps. | Old run resumes old build; new submissions use activated new build. |
| F16 | Schedule reconcile interrupted after native create. | Reconcile retry does not duplicate owned schedules. |
| F17 | Scheduler/worker down across multiple due slots. | Observed catch-up behavior matches advertised native policy. |
| F18 | Native source closes watch before terminal frame. | Client re-reads/reconnects; it does not mark a run successful from EOF. |
| F19 | Browser disconnects immediately before completion. | Reconnect obtains authoritative terminal output and closes cleanly. |
| F20 | Switch run or tenant during pending snapshot read. | Old epoch/identity data cannot overwrite new state or leak output. |
| F21 | Native stream token expires. | Refresh only with renewed authorization; denied access stops all reconnects. |
| F22 | Cursor retention expires or buffer overflows. | Explicit reset/gap or typed failure; no silent lossless-history claim. |
| F23 | Two observers share feed, one disconnects. | Other continues; last observer cleanup releases SDK resources and timers. |
| F24 | Repeated React Strict Mode mount/unmount. | No subscription/listener growth; manual disconnect remains respected. |
| F25 | One of multiple jobs services is unavailable. | Inspector lists other services and marks partial results, not false zero counts. |
| F26 | Tamper with run locator/scope/projection cursor. | Authorized read fails safely before private payload serialization. |
| F27 | Retire service or rotate locator key with retained runs. | Old run references remain routable or retirement is blocked with explicit impact. |
| F28 | Same provider used by two different configured services. | SDK credentials, worker identities, polling and native calls never cross bindings. |

Use real native process/container termination for durable scenarios, not only throwing an exception in the handler. Control storage failure modes and assert the native acknowledgement boundary. Every discovered production-style failure receives a minimized deterministic regression where possible and a native conformance fixture when necessary.

#### 18.6 Client and Inspector performance tests

Test long-lived idle watches, thousands of sequential connect/disconnect cycles, many observers sharing one run, multiple scoped runs, slow consumers, bursts of progress, native throttling, and proxy restarts. Measure listener/timer/socket counts before and after cleanup and assert they return to baseline within a bounded grace period.

For CI define explicit fixture sizes rather than claiming universal throughput: for example 100 active unique run watches, 1,000 local observers sharing those keys, and 10,000 create/dispose cycles in controller tests. Native provider quota-aware tests can use smaller counts but must prove shared connection bounds. Record peak RSS, native request counts, pending frame bytes, and CPU under the pinned environment. These are test envelopes, not production capacity promises.

Inspector tests use server-generated large histories with bounded pages and malicious long filters. Verify no API request or render path enumerates all runs just to display a page. Validate exact versus partial count labels and cursor invalidation on filter change.

#### 18.6A Naming and provider-scope regression fixtures

Add `tests/types/jobs-names.test-d.ts`, `tests/unit/job-name.test.ts`, `tests/compiler/job-names.test.ts`, `tests/generator/job-dot-access.test.ts`, and `tests/inspector/job-name-filters.test.ts`, or their repository-conventional equivalents. They must cover these invariants:

| Case | Expected result |
|---|---|
| `name: "exportOrders"`, `id: "orders.export"` | Generated `jobs.exportOrders.trigger()` and `runs.watch()` work; durable ID remains unchanged. |
| Missing `id` with a valid explicit name | Effective durable ID is persisted as that name in the manifest; no second user field required. |
| Dots, hyphens, spaces, leading digits, non-ASCII, reserved/prototype names | Type/runtime rejection; no sanitizer fallback. |
| Equal names in separate services or private/exposed definitions | Compile failure identifying both source locations. |
| Implicit task names collide or are ambiguous | Actionable explicit-job diagnostic; never append counters or path fragments. |
| Valid task/job re-export | One descriptor and one name mapping, independent of discovery order. |
| Unknown name in generated client or hook selector | Type error and server-side refusal for forged runtime requests. |
| Name-only rename with pinned durable ID | API fingerprint changes; stored run, schedule, and dedup identities do not change. |
| Rename with default-derived ID and no preservation | Migration diagnostic rather than silent history loss. |
| Watch across a public-contract name change | Old observer cleans up; stale selectors cannot attach to an unrelated job. |
| Inspector name filter | Resolves to stable native identity and uses bounded queries; displays both values. |
| Provider catalog, Docker presets, package/export/docs manifests | Exactly Inngest, Trigger.dev, and effect-mq are in this implementation milestone. |
| Queue-only task on effect-mq; durable-sleep task on effect-mq | First can pass native conformance; second is rejected, never silently substituted. |

#### 18.7 Coverage and mutation gates

For new core validation, binding resolution, and watch state-machine modules, target at least 90% branch coverage plus explicit coverage of every documented transition/error. A coverage percentage does not replace the native scenario matrix. Mutation tests should detect removed tenant checks, disabled abort cleanup, stale epoch acceptance, invalid policy conversion, and retry-budget multiplication.

CI fails when a capability is marked supported without referenced passing conformance evidence. Pin native status/error fixture samples; an unknown upstream status must produce a diagnostic and safe fallback, not a false successful terminal state. Upstream dependency/image upgrades rerun the affected compatibility matrix before release.

#### 18.8 Proposed test commands and release gate

Add focused scripts through the repository's existing test orchestration:

```sh
bun run test:jobs:unit
bun run test:jobs:types
bun run test:jobs:contracts
bun run test:jobs:docker
bun run test:jobs:restart
bun run test:jobs:client
bun run test:jobs:inspector
bun run test:jobs:providers
```

These are proposed commands; add their actual implementations and help before documenting them as available. Wire the appropriate suites into existing `test:all`, `verify`, `prepush`, docs/scaffold checks, and CI. Preserve explicit authorization for cloud mutation.

Core release gate: task/job authoring + default binding + account-free durable Docker + account-free native scheduling path + typed client + Inspector + migration/docs + all corresponding security/restart tests. Provider packages are certified separately; the complete three-provider milestone requires each requested adapter's advertised feature subset to pass. Do not freeze the portable API after testing only one execution engine.

#### 18.9 Review regression checklist

These cases close implementation gaps found while reconciling the brief with this repository. They refine existing TJ requirements and F scenarios, not a second feature scope. Add them to the existing focused suites; a design checkbox or mock does not replace native evidence where stated.

| ID | Required proof | Design / checklist owner |
| --- | --- | --- |
| RG01 | Packed dev/build/start uses the acquired native adapter; a legacy queue cannot satisfy task execution; API shutdown leaves accepted native work running and closes only owned clients. | §0.8; task 4.17; F03/F08 |
| RG02 | Equal function/task/job durable IDs preserve distinct schemas; nested caller/canonical projections and executable hashes survive evaluator serialization. | §§0.2/0.5; tasks 2.7, 3.17 |
| RG03 | RPC transforms once; native/manual retry and schedule ticks reuse canonical input; stored input/result/progress/stream types and validators use the correct schema direction. | §0.5; tasks 2.17, 4.19, 6.16, 7.14 |
| RG04 | Sync/async native park bypasses failure/output/hooks, while returned/thrown declared errors retain failure classification and retry metadata. | §§0.5/0.8; tasks 2.17, 4.18; native F05–F07 |
| RG05 | Zero/decimal/overflow/calendar/attempt/backoff/resource/key boundaries match the frozen table and fail before native work when invalid. | §7.1; task 2.18; F12/F14 |
| RG06 | Numeric/string keys differ; duplicate first-wins, retry-operation/schedule-occurrence dedupe, event resolution and key rotation preserve immutable logical identity and business-effect keys. | §6.2; tasks 4.20, 6.16; native F01/F02/F04/F16/F27 |
| RG07 | Pending metadata matches the transmitted request; unknown writes retain identity across unmount/reload/run selection, recover only within certified limits and stay usable without browser storage. | §§6.2/11.8; tasks 8.11, 8.14; F01/F20 |
| RG08 | Watch-only grants support refetch; callbacks and connected leases have distinct lifetimes; interrupted setup settles; one controller's disconnect cannot stop another. | §§11.5/11.8; task 8.15; F18/F23/F24 |
| RG09 | Malformed/expired/late grants cannot authorize I/O; scope changes terminate feeds; system/static/dynamic schedule scope never becomes browser-public ownership. | §12.2; tasks 6.16, 7.13; F20/F21/F26 |
| RG10 | Merged pagination returns all consumed/unconsumed healthy rows exactly once across API restart; ties, cursor limits and recovering services have explicit behavior. | §14.3; task 9.12; native F25 |
| RG11 | Removed static schedules stop ticking; dynamic schedules remain; operator pauses survive deployment; ambiguous native reconciliation never claims activation success. | §15.3; task 6.16; native F16/F17 |
| RG12 | Deprecated profile spelling works with task-backed jobs independently of legacyJobs; old/new spellings conflict; whole-app collisions are compiler tests. | §§0.4/18.3; tasks 2.3, 3.16, 10.24 |
| RG13 | Replay warnings reach compiler/CLI/Inspector with source/remediation; executable React docs retain runId/request and exercise safe unknown recovery without SSR side effects. | §§2.10/6.3/17.3; tasks 3.18, 10.24 |

---


## Risks / Trade-offs

- Native semantics can differ from the normalized contract → Phase 0 must produce tested mappings or explicit rejection. Required Inngest durable/scheduling/query gates block release if unsupported; do not add a state store to pass them.
- effect-mq's currently documented Effect peer differs from the repository pin → validate an exact compatible published version first; any unavoidable runtime upgrade requires an explicit change revision and repository-wide checks.
- Retaining immutable sleeping-worker builds consumes local resources → expose generations, refuse unsafe hot swaps and require drain/cancel/retention decisions before retirement.
- At-least-once replay can repeat effects and hooks → use stable keys, idempotent business fixtures, advisory lint and native crash tests; no automatic checkpoints.
- Native queries/history may be limited → bounded filters and honest unsupported/partial/reset/expired states; no full-history fetch or fabricated events.
- Broad cross-package API change → implement phase gates, package-resolution/type fixtures, unchanged event/function/agent regressions and generated-client handshake tests before release.
- Public naming and graph identity changes can break clients or historical routes → retain stable durable IDs and old manifests; fingerprint public changes and reject stale selectors.

## Migration Plan

### 21.1 Existing applications

The existing `defineJob` function-target API is intentionally replaced, not declared “unchanged.” Introduce explicit compatibility diagnostics and an upgrade guide before removal. A published breaking change needs the repository's appropriate release/version decision; a deprecated alias alone does not make changed semantics nonbreaking.

Migration sequence:

1. Extract background behavior into `defineTask` with explicit stable ID/version, input/output, task policy, and replay-safe handler. Reuse application helpers; do not automatically copy a request context or claim a function callback has become durable.
2. Change `defineJob({ target: fn, input, retry, profile })` to `defineJob({ name, id, task, service })`, choosing a valid camelCase name and preserving the old durable ID; move execution policy to the task and convert millisecond values to readable durations. Review idempotency behavior rather than copying field names blindly.
3. Change app `job` to `jobs`, `defaults.job` to `defaults.jobs`, and `.enqueue()` to `.trigger()` with the new accepted handle. Keep type-checked legacy aliases only for the explicit compatibility window.
4. Rebuild clients and route consumers to the new job registry/receipt shape. Deploy worker definitions before enabling new trigger endpoints. Validate historical run routing and output schema versions.
5. Drain legacy local/native runs using the old runtime where necessary. Do not move in-flight executions between engines or replay them on new task code automatically. Cut new submissions over only after compatibility/restart tests pass.

A codemod can rename mechanical fields and create a task skeleton, but must flag manual review for schemas/transforms, idempotency, side effects before waits, duration clocks, concurrency scope, schedules, and request-scoped services. Codemod output must typecheck and must not invent a safe external idempotency implementation.

### 21.2 Removed from the previous proposal

The earlier function-as-task model, `defineWorkflow`, public workflow steps/joins/signals, required job-state service, universal durable observation journal, and whole-provider all-feature parity are removed. None is a hidden prerequisite for this implementation.

The replacement is a real task executable, optional explicit job binding, single jobs-service configuration, native state ownership, and capability-checked native execution/observation. The tradeoff is explicit: not all engines support native durable sleep, identical retry/time clocks, or historical replay of every update.

### 21.3 Completion criteria

The feature is ready only when task/job authoring and direct/context triggering work, the required Docker flows need no third-party account, supported policies pass native recovery tests, clients reconnect and clean up correctly, and Inspector required filters operate on bounded native data.

All requested adapters must have an explicit supported/unsupported/unverified matrix. Core release and individual provider certification are separate milestones; uncertified hosted or Docker modes cannot be marketed as production support. The complete requested integration milestone is not finished while one adapter is only a factory with no native executable deployment or conformance evidence.

CamelCase job names, dot-access generated examples, name/ID migration safety, the exact three-provider scope, docs, generated types, compatibility migration, scaffold smoke, package exports/boundaries, local service regression, security tests, observer cleanup, and old-build recovery are mandatory. No passing checklist item can be satisfied solely by this change; attach test evidence during implementation.

**API review summary:** Define a task once, bind it only when configuration is needed, call `.trigger()` directly or through context, and observe it through one typed Relkit interface. The provider implements durable work; Relkit owns a coherent contract and honest capability boundaries.

---


## Coverage index

This index is navigational; all detailed contracts above and all delta requirements are normative. Phase numbers in this table correspond to the named phases in tasks.md (whose checklist group numbers are 1–10). No technical section requires reopening the source plan.

| Contract area | Authoritative detail | Principal delta specs | Implementation phase |
| --- | --- | --- | --- |
| Repository corrections and frozen API | §§0.1–0.10 | compiler-graph, public-authoring, workspace-foundation | 0–9 |
| 1. Revision decisions | §1 | task-runtime, jobs-provider-integrations | 0–1 |
| 2. Configure/define/trigger/observe examples | §2 | task-runtime, typed-job-client, provider-bindings | 1–7, 9 |
| 3. Terminology and ownership | §3 | task-runtime, jobs-events, function-runtime | 1–3 |
| 4. Public types, names, methods and schemas | §§0.2–0.6, 4 | public-authoring, task-runtime, typed-job-client | 1–3, 6–7 |
| 5. Configuration and deterministic binding | §5 | provider-bindings, compiler-graph | 2 |
| 6. Acceptance/execution/replay lifecycle | §6 | task-runtime, function-runtime | 0, 3–5 |
| 7. Time/retry/resource/concurrency policy | §7 | task-runtime, jobs-provider-integrations | 0–1, 3–5 |
| 8. Native provider mappings | §§0.9, 8 | jobs-provider-integrations | 0, 4–5 |
| 9. Native state and historical routing | §§0.7–0.8, 9 | task-runtime, jobs-provider-integrations | 0, 2–5, 9 |
| 10. Composite Docker lifecycle | §§0.9–0.10, 10 | local-provider-services | 0, 4–5, 9 |
| 11. Generated clients and observation | §§0.6–0.8, 11 | typed-job-client, http-runtime | 6–7 |
| 12. Authorization and security | §12 | typed-job-client, http-runtime | 3, 6–8 |
| 13. Existing module integration | §13 | function-runtime, service-orchestration, domain-services, observability | 2–3, 9 |
| 14. Inspector | §§0.10, 14 | development-inspector | 8 |
| 15. Scheduling | §15 | jobs-events, local-provider-services | 0, 3–5, 8–9 |
| 16. Compiler/packages/deployment/CLI | §§0.1–0.3, 0.7–0.10, 16 | compiler-graph, workspace-foundation, pulumi-aws-deployment, cli-scaffolding | 1–6, 9 |
| 17. All docs, examples and scaffolds | §17 | developer-documentation, cli-scaffolding | 9 |
| 18. Testing, F01–F28, RG01–RG13 and release gates | §18 | acceptance-verification | 0–9 |
| 19. All ten phases/file responsibilities | tasks.md | All 19 capability deltas | 0–9 |
| 20. TJ-001–TJ-045 | specs/*/spec.md, each identifier retained exactly once | task-runtime, typed-job-client and mapped capability deltas | 0–9 |
| 21. Migration and completion | Migration Plan | public-authoring, jobs-events, cli-scaffolding, acceptance-verification | 1–3, 9 |
| 22. Sources and outstanding native evidence | Evidence and verification register; §0.9 | jobs-provider-integrations, acceptance-verification | 0, 4–5, 9 |

Intentional repository corrections are explicit in §0: canonical manifest placement, separate durable/graph IDs and task hook phases, cycle-free contract ownership, real canonical schema validation, domain filenames/exports, generated path-aware selectors, pending ambiguous ORPCError recovery, the existing local stop/--yes commands, and exact service/CLI/control options. Legacy compatibility remains gated; all phases stay in this one change. Native pins and conformance results are evidence to produce in Phase 0, not unresolved permission to change the RELKIT API.

## Evidence and verification register

Repository references R0–R15 point to the current inspected commit. R1/jobs, R2/provider protocol, R3/app, R4/docker, R5/local recipes, R6/services, R7/Inspector, R8/React, R9/docs, R10/agent access policy, R11/integration metadata, R12/function context, R13/agent graph and R15/client generation support the concrete findings in section 0. Older cloud references are superseded. Implementation must re-inspect changed files before editing.

Official sources below describe native facilities; they do not certify normalized RELKIT guarantees. The fresh rereads are explicitly identified in 0.9. Other links are retained reference material from the supplied brief and must be reread against the pinned release before adapter implementation. No SDK, image, Docker deployment or managed service has been tested as part of this proposal.

Every supported entry in tests/jobs/compatibility/manifest.json must record exact SDK/server/backend/runtime/image versions and digests, storage durability settings, host architecture, feature constraints, fixture IDs, run timestamp and evidence paths. Missing credentials means not tested. Unsupported/unverified entries remain visible and cannot activate required features. The exact native retry scope, clock equivalence, acceptance-to-run resolution, lifetime routing, scoped progress/query support and observer cursors/cleanup are the bounded feasibility gates in tasks phase 0, not permission to choose different RELKIT APIs.

[R0]: https://github.com/rel-kit/relkit/commit/ebae8ff03ef6fb306d7384eef69eba2d3ec3838a
[R1]: https://github.com/rel-kit/relkit/blob/ebae8ff03ef6fb306d7384eef69eba2d3ec3838a/packages/jobs/src/define-job.ts
[R2]: https://github.com/rel-kit/relkit/blob/ebae8ff03ef6fb306d7384eef69eba2d3ec3838a/packages/provider/src/protocol-types.ts
[R3]: https://github.com/rel-kit/relkit/blob/ebae8ff03ef6fb306d7384eef69eba2d3ec3838a/packages/app/src/define-app-types.ts
[R4]: https://github.com/rel-kit/relkit/blob/ebae8ff03ef6fb306d7384eef69eba2d3ec3838a/integrations/packages/docker/src/index.ts
[R5]: https://github.com/rel-kit/relkit/blob/ebae8ff03ef6fb306d7384eef69eba2d3ec3838a/packages/local-service/src/recipe.ts
[R6]: https://github.com/rel-kit/relkit/blob/ebae8ff03ef6fb306d7384eef69eba2d3ec3838a/packages/services/src/define-service.ts
[R7]: https://github.com/rel-kit/relkit/blob/ebae8ff03ef6fb306d7384eef69eba2d3ec3838a/packages/inspector-api/src/runtime.ts
[R8]: https://github.com/rel-kit/relkit/blob/ebae8ff03ef6fb306d7384eef69eba2d3ec3838a/packages/client/src/react/finite-hooks.ts
[R9]: https://github.com/rel-kit/relkit/tree/ebae8ff03ef6fb306d7384eef69eba2d3ec3838a/apps/docs/content/docs
[R10]: https://github.com/rel-kit/relkit/blob/ebae8ff03ef6fb306d7384eef69eba2d3ec3838a/packages/agents/src/agent-client.ts
[R11]: https://github.com/rel-kit/relkit/blob/ebae8ff03ef6fb306d7384eef69eba2d3ec3838a/integrations/packages/local/package.json
[R12]: https://github.com/rel-kit/relkit/blob/ebae8ff03ef6fb306d7384eef69eba2d3ec3838a/packages/functions/src/function-descriptor-types.ts
[R13]: https://github.com/rel-kit/relkit/blob/ebae8ff03ef6fb306d7384eef69eba2d3ec3838a/packages/agents/src/define-graph.ts
[R14]: https://github.com/rel-kit/relkit/blob/ebae8ff03ef6fb306d7384eef69eba2d3ec3838a/README.md
[R15]: https://github.com/rel-kit/relkit/blob/ebae8ff03ef6fb306d7384eef69eba2d3ec3838a/packages/client-generator/src/generate-contract.ts
[T1]: https://trigger.dev/docs/errors-retrying
[T2]: https://trigger.dev/docs/wait-for
[T3]: https://trigger.dev/docs/runs/max-duration
[T4]: https://trigger.dev/docs/machines
[T5]: https://trigger.dev/docs/realtime/backend/subscribe
[T6]: https://trigger.dev/docs/realtime/auth
[T7]: https://trigger.dev/docs/self-hosting/docker
[T8]: https://trigger.dev/docs/tasks/streams
[T9]: https://trigger.dev/docs/runs/metadata
[I1]: https://www.inngest.com/docs/self-hosting
[I2]: https://www.inngest.com/docs/reference/typescript/v4/functions/create
[I3]: https://www.inngest.com/docs/reference/typescript/v4/functions/step-sleep
[I4]: https://www.inngest.com/docs/reference/typescript/v4/realtime/subscribing
[M1]: https://www.effect-mq.com/guide/retries-and-timeouts
[M2]: https://www.effect-mq.com/guide/workers
[M3]: https://www.effect-mq.com/guide/repeatable-jobs
[M4]: https://www.effect-mq.com/guide/getting-started
[E1]: https://www.effect.website/docs/v3/data-types/duration
