# Task 17.1 decision

- Approve `17.1` after verifying the recorded Gate 0–15 packets, the complete
  committed candidate chain, required implementation artifacts, and the
  deferred-issue dispositions.
- Use short capability-level commit scopes rather than per-app or per-package
  commits. Preserve the local `.agents/skills/openspec-iterator/SKILL.md` as
  an intentional workspace skill; it is not a product artifact.
- Keep final verification, documentation, fixture completion, release
  checklist, and evidence production in later checkbox ownership. The next
  eligible unit is `17.2`.

# Task 16.22 Gate 15 decision

- Approve Gate 15 after rerunning the real release-gated AWS path end to end:
  create, smoke, no-op, source move, destroy, and independent cleanup all
  passed for stack `zsys-nightly-1787062081840-d2826d4f`.
- Keep Pulumi state in Pulumi's backend model. Use the disposable S3 backend
  already configured in ignored `.env`; Pulumi Cloud is not required for this
  gate, and no parallel ZSys state system was added.
- Fix AWS name-limit failures at the shared component naming boundary:
  deterministic hash suffixes preserve stable identity while satisfying IAM's
  64-character role limit and ElastiCache Serverless's 40-character cache
  limit.
- Verify CloudWatch smoke logs with `aws logs tail` because the successful ECS
  log stream was visible there while `filter-log-events` returned no matching
  events during the bounded wait.
- Keep Resource Groups Tagging API as the cleanup index, but resolve returned
  ECS/NAT/task-definition ARNs to service-specific live state. Deleted,
  inactive, or stopped records are AWS tag-retention artifacts; any live record
  still fails cleanup.
- Dispatch `17.1` only after the user explicitly asked to continue. The fresh
  same-directory task owns Gate 0–15 packet verification; this task did not
  implement `17.1`.

# Task 16.21 deployment evidence decisions

- Use a disposable copy of the full fixture and an explicit local Pulumi
  backend for the CLI preview so the shared fixture, cloud accounts, and
  user-authored state remain untouched. The source `packages/cli/src/index.ts`
  entry is the repository-equivalent `zsys` binary because no installed shell
  is present in this checkout.
- Use the pinned Pulumi CLI `3.258.0` in a bounded temporary directory because
  Automation API requires the Pulumi executable while the repository supplies
  only the `@pulumi/pulumi` package. The temporary passphrase and local backend
  are test-only and never enter reports or change notes.
- Treat the opt-in AWS integration skip as an explicit release/nightly
  limitation, not as local cloud evidence or Gate 15 approval. Real smoke,
  destroy, and independent tag cleanup require the release credentials,
  region, and smoke image; checkbox `16.22` owns the Gate 15 decision.
- Remove only the exact generated Pulumi/build/test paths after verifying their
  reports so the intentional dirty checkout from prior phases remains visible.

# Task 16.20 release/nightly AWS integration decisions

- Gate the real-cloud test behind `ZSYS_AWS_INTEGRATION=1` and require an
  explicit AWS region and release-provided smoke image. The normal deployment
  suite remains cloud-free and the integration is skipped when the release
  gate is not enabled.
- Require each smoke route to return JSON containing `ok: true`, its operation
  name, and the run marker; a successful HTTP status alone is not accepted as
  proof that the provider operation ran.
- Compose the existing AWS network, registry, ECS/ALB, SQS, EventBridge, S3,
  Valkey, and CloudWatch components in one Pulumi Automation API inline
  program. Wire their stable outputs into the smoke image and grant only the
  declared S3/SQS/EventBridge/Valkey task permissions needed by the smoke.
- Use the full compiler graph for the stack, reopen the same Pulumi stack with
  source locations moved under `src/moved/`, compare the provider-neutral
  logical-name set, and assert zero replacements for both the no-op and moved
  update. Source metadata may change the graph tag without changing resource
  identity.
- Keep stack destruction and cleanup verification in the finalization path.
  Destroy the last active Automation API stack, then independently query the
  AWS Resource Groups Tagging API until no `managed-by=zsys`, app, and stack
  resources remain; never add a parallel state store.

# Task 16.18 container test decisions

- Keep container acceptance in `tests/container/lifecycle.test.ts` and run
  the generated production Bun bundle directly because Docker and Podman
  daemons are unavailable in this checkout; static Dockerfile/context checks
  still assert the image's pinned base, non-root user, SIGTERM, and excluded
  inputs without an unbounded registry pull.
- Add only the bounded `ZSYS_PROVIDER_READY_DELAY_MS` generated-server seam
  needed to prove liveness remains available while provider readiness is
  pending. The readiness response keeps environment readiness true and
  provider readiness false until the delay elapses, then exposes the existing
  ready contract; no provider-neutral graph or deployment-plan field changes.
- Use a temporary test fixture handler to register the existing global
  telemetry flush hook and observe cancellation/flush through temporary marker
  files. This exercises the production shutdown path without adding a marker,
  persistence, or test dependency to the runtime API.

# Task 16.17 Pulumi mock test decisions

- Keep the coverage in one deployment integration test and install Pulumi
  mocks before dynamically importing both the generated program and AWS
  components; this proves import order without adding a production adapter.
- Exercise the generated provider-neutral program for HTTP, job, schedule,
  event, durable trigger, bucket, cache, model, and observability entries, then
  exercise the existing AWS components for concrete resource inputs, parent
  URNs, tags, network isolation, and ECS secret-source mappings.
- Prove source-move identity by running the same mocked generated program from
  plans built from moved graph sources and comparing type/name keys alongside
  the provider-neutral diff's zero replacement count; source paths and secret
  metadata remain absent from mocked inputs.

# Task 16.16 deployment-plan goldens

- Keep the new deployment tests pure and fixture-backed: load the existing
  canonical full/minimal graphs, call `fromGraph`, and compare JSON-safe plan
  projections without constructing providers, stacks, or cloud clients.
- Use explicit full-graph image health and OpenAI model-profile options so the
  golden captures deployment metadata while preserving the provider-neutral
  plan boundary. Keep the minimal golden free of optional jobs/events/storage/
  cache/model resources.
- Test source moves through stable logical IDs and deployment diff operation
  classification. Graph hashes/tags may change with source metadata, but a
  move must not create/delete/replace a logical deployment resource; source
  paths remain absent from plan values.
- Keep the secret/live-object checks at the existing `fromGraph` boundary and
  assert plans/program bytes contain no secret names, values, or Pulumi values.

# Task 16.15 deployment CLI decisions

- Route all six deployment lifecycle commands through the existing Pulumi
  Automation API workspace and provider-neutral `DeploymentPlan`; do not add a
  second state engine. Run check first, reuse its graph hash, and reuse the
  checked result for preview/up builds so planning cannot drift from the
  validated graph.
- Make project, stack, backend, and config explicit workspace inputs. Keep the
  default stack/backend as `development`/Pulumi Cloud while supporting local
  and credential-free object-storage URL selection; preserve secret config
  markers and never include config values in reports or errors.
- Keep preview plan-only (`preview`, never `up`), preview before `up` mutation,
  and preview destroy before removal. Confirm destructive Pulumi changes and
  provider-neutral security-sensitive plan diffs interactively, with the
  documented `--non-interactive`/`--yes` flags as the explicit CI grant.
- Persist only deterministic generated Pulumi files and command reports under
  `.zsys/generated/pulumi/`; reports use the existing redacted event/output
  helpers and carry stack/backend/graph identity without parallel state.
- Thread `AbortSignal` through check/build/readline/Pulumi operations and guard
  already-aborted local work; keep declined confirmations non-mutating and
  return structured CLI exit results.

# Task 16.14 IAM policy decisions

- Keep IAM synthesis in the provider-neutral deployment plan. Statements use
  stable logical resource names and action names only; ARN resolution and
  Pulumi resource construction remain cloud/deployment concerns.
- Aggregate one shared service-role projection from declared function edges,
  while retaining sorted function/resource/action grants for the future
  per-function isolation model. Job and durable event-trigger consumers are
  attached to their target functions; publishers are attached only to the
  functions that enqueue or publish.
- Do not infer `secretsmanager:GetSecretValue` from a secret environment
  declaration or provider configuration. Secret injection is deployment
  configuration rather than a declared function capability, so unreferenced
  secret actions stay omitted and the golden scan proves that boundary.
- Keep the full/minimal IAM goldens under `tests/deployment` and derive them
  from existing compiler graph fixtures; this adds policy evidence without
  implementing the later full deployment-plan golden or Pulumi mock units.

# Task 16.13 AWS runtime decisions

- Keep the production `aws` recipe binding runtime-only and generation-scoped:
  validate the production environment and AWS provider tag before constructing
  immutable logical-profile maps, and release cache/model-adjacent resources
  with the generation lifecycle.
- Use native `fetch` plus the smallest shared AWS request/signing helper for
  S3, SQS, and EventBridge. Keep Bun's native `RedisClient` behind the existing
  private promise-only Valkey interface; add no vendor SDK or second provider
  abstraction.
- Resolve `EnvRef` values only at generation construction. API keys are never
  copied into graph/provider metadata or error messages; the model adapter
  returns bounded validated turns and status-only upstream errors, with local
  HTTP permitted solely for bounded tests.
- Make event delivery use the existing `EventRuntimeProvider` registration and
  `EventTriggerBinding.invoke` path so AWS delivery enters the same function
  engine protocol as local/runtime materialization. Keep authored application
  descriptors provider-neutral and unchanged.

# Task 16.12 AWS resource mapping decisions

- Keep S3, ElastiCache Valkey, CloudWatch, and ECS deployment injection inside
  focused `packages/cloud-aws` components with stable app/stack/descriptor
  identity, parentage, tags, and region propagation.
- Use the pinned Bun native `RedisClient` only behind a promise-only
  `ZsysValkeyClient`; do not add a Redis package or expose the native client
  type through application-facing packages.
- Represent non-secret deployment values as ECS `environment` entries and
  secret source identifiers as ECS `valueFrom` entries. Keep OTLP optional and
  map OTLP headers only through secret injection.
- Retain the provider-neutral deployment plan and its existing AWS capability,
  region, and configuration checks as the pre-preview rejection boundary.

# Task 16.11 AWS event bus decisions

- Keep `ZsysEventBus` as the single AWS owner for the custom EventBridge bus,
  explicit event rules, durable trigger queues/DLQs, EventBridge target
  delivery, and worker configuration. Use stable app/stack/event/trigger
  identities and existing tags; source paths never enter names.
- Expand every compiled `eventId@version` pair into its own EventBridge rule.
  Each durable trigger owns its own queue and DLQ, so matching triggers fan out
  independently and one consumer's retry/redrive state cannot roll back a
  sibling.
- Match the AWS event source, detail type, event ID, and integer version in the
  rule pattern. Do not re-expand patterns at deployment time; unknown or empty
  pairs fail validation before resources are created.
- Wrap EventBridge `detail` in a small SQS input envelope. This preserves the
  complete versioned event envelope, including trace ID, correlation ID, and
  causation invocation ID, while worker configuration records stable JSON paths
  to those values.
- Keep EventBridge target retry separate from consumer retry. Validate bounded
  target retry/age, require SQS `maxReceiveCount` to equal the trigger retry
  maximum, require visibility to cover the handler timeout, and require DLQ
  retention to cover source retention. Report only at-least-once semantics.
- Scope EventBridge queue policies to the generated rule ARNs with
  `aws:SourceArn`; generate the ECS task consumer role only when no caller role
  ARN is provided. Do not add an application-level subscription resource.

# Task 16.10 AWS job queue decisions

- Keep `ZsysJobQueues` as the AWS owner for standard SQS source queues, DLQs,
  queue policies, redrive-allow policies, worker consumption settings, and
  EventBridge Scheduler targets. Use stable app/stack/job/schedule identities
  and the existing component tags; source paths never enter names.
- Generate ECS-task and Scheduler trust roles only when callers do not supply
  role ARNs. Generated roles receive narrow queue permissions; explicit queue
  resource policies authorize worker receive/delete/change-visibility and
  Scheduler send operations without mutating caller-owned roles.
- Require `maxReceiveCount` to equal the validated job retry `maxAttempts`,
  require source visibility to cover the worker timeout, bound AWS retention,
  batch, long-poll, and Scheduler retry values, and require DLQ retention to
  cover source retention. Map canonical static JSON input to standard SQS
  Scheduler targets with flexible windows disabled.
- Expose worker delivery as `at-least-once`; queue redelivery after a worker
  crash remains possible and no stronger delivery guarantee is claimed.

# Task 16.9 AWS component decisions

- Use the pinned AWSX VPC component for reusable network topology, then use
  direct pinned AWS resources for ECR, ECS/Fargate, ALB, CloudWatch, and
  Application Auto Scaling so inputs, health checks, security groups, and
  parent relationships stay explicit.
- Derive component/resource names from the explicit app and stack identity,
  normalize them, and keep every taggable child under its owning component.
  Merge caller tags while always enforcing `app`, `stack`, `graphHash`, and
  `managed-by=zsys`; source paths are never identity inputs.
- Keep the safe defaults concrete: two AZs with a single NAT gateway, an
  immutable scan-on-push ECR repository, port 3000, ALB readiness at
  `/_zsys/v1/health/ready`, ECS liveness at `/_zsys/v1/health/live`, desired
  count 1 with autoscaling bounds 1–4 at 70% CPU, and a 30-second stop and
  deregistration window.
- Build the task definition with a non-root numeric user, read-only root
  filesystem, bounded Bun liveness command, awslogs output, and SIGTERM-aware
  stop timeout. Keep the service binding to the configurable container name
  and port so custom images remain deployable without changing identity.

# Task 16.8 Pulumi event decisions

- Reuse `@zsys/observability` redaction and the existing Effect logger layer;
  map only safe diagnostic messages, operation metadata, configuration names,
  and summary counts. Do not serialize Pulumi config values, resource inputs,
  resource outputs, stdout/stderr buffers, or deployment blobs.
- Sort emitted logs by sequence with stable field tie-breakers and choose
  summary data by deterministic event ordering. Use Automation API result
  summaries as the authoritative preview/update change counts, while keeping
  human output as a fixed operation/count/diagnostic format.
- Keep preview, update, and output reports as versioned JSON-safe projections.
  Secret-marked outputs deliberately omit their value entirely; canonical
  report serialization preserves update status without passing the full
  Pulumi update summary through the generic redactor.
- Keep all Pulumi-specific logging/report types in `@zsys/deploy-pulumi` and
  leave provider-neutral `@zsys/deploy` free of Pulumi/cloud executable types.

# Task 16.7 Pulumi program decisions

- Keep the adapter plan-only and provider-neutral at its input boundary. A
  canonical JSON snapshot is the only data copied into `plan.json`, generated
  source, or the inline closure, so executable callbacks, Pulumi values, and
  live objects cannot cross the boundary.
- Use one stable application `ComponentResource` root and direct child
  components for the plan's HTTP, observability, job, schedule, event,
  trigger, bucket, cache, and model entries. Prefix resource names with the
  normalized explicit stack and derive the remainder only from application or
  descriptor logical IDs; source locations never participate.
- Keep generated and inline modes on the same normalized plan/tag/name
  helpers. Generated output defaults to `.zsys/generated/pulumi` and contains
  no absolute project path or timestamp; Pulumi owns state through the
  workspace adapter. AWS-specific custom resources remain 16.9 scope.
- Add direct `@zsys/contracts` and `@zsys/deploy` dependencies to the Pulumi
  owner for canonical serialization and the provider-neutral plan type. Do
  not add Pulumi/cloud types to `@zsys/deploy`.

# Task 16.6 Pulumi workspace decisions

- Use `LocalWorkspace.create` with explicit `ProjectSettings.backend.url`, then
  call `Stack.create`, `Stack.select`, or `Stack.createOrSelect` for the
  requested explicit stack. Config is applied with Automation API stack config,
  so Pulumi owns project and stack persistence.
- Restrict backend normalization to Pulumi Cloud, Pulumi-supported S3/Azure
  Blob/GCS object storage, and a local `file://` backend. Backend credentials
  remain in Automation API environment variables; they are not project, graph,
  or ZSys state data.
- Default local development to a work-directory `.pulumi` backend and
  `.pulumi-home` metadata root. These are Pulumi-owned paths, not a parallel
  `.zsys/state` store; no custom state serialization or state lifecycle was
  added.

# Task 16.5 production build decisions

- Keep `buildProject` as the existing CLI command seam and reuse compiler graph,
  OpenAPI, manifest, version, and hash outputs. Add no deployment/runtime
  dependency or parallel build system; use Bun's native build CLI in a child
  process so packed/generated projects resolve workspace dependencies the same
  way as a normal user command.
- Keep `server/index.ts` and `server/runtime.manifest.ts` in the local build for
  the existing `zsys start` path, but emit a minified `server/index.js` bundle
  as the container entrypoint. The Dockerfile copies only that bundle plus
  graph/manifest/OpenAPI JSON, so project sources, tests, dependencies, env
  files, and local state are not baked into the image.
- Use one generated admission/drain path: readiness flips false, new requests
  receive `503`, active handlers receive an abort signal after the bounded
  drain deadline, and an optional global telemetry flush hook is bounded by a
  second deadline. Defaults are capped at 30 seconds; no persistent local
  telemetry/state store is introduced by the generated server.
- Add the context allowlist and explicit `.env`/`.zsys/state`/
  `.zsys/observability` exclusions in the generated `.dockerignore`; retain
  deterministic bytes by disabling source maps/env inlining and minifying away
  Bun staging-path comments. Mark only `16.5` complete; `16.6` is the next
  different unchecked unit.

# Task 16.4 deployment risk diff decisions

- Compare provider-neutral deployment plans rather than importing Pulumi event
  types or calling the graph compatibility diff. Match resources by a stable
  kind-qualified descriptor ID and use logical names only to detect a
  replacement; source locations never participate in identity.
- Keep the report summary immutable and JSON-safe. Deletes and replacements
  are destructive confirmation cases; changed IAM/security metadata, public
  visibility, provider/profile, or configuration-name wiring are
  security-sensitive confirmation cases. Ordinary creates and updates remain
  non-confirming unless one of those markers changes.
- Include the plan contract/graph hash in the application comparison so plan
  identity changes are observable while preserving the provider-neutral plan
  contract and leaving Pulumi resource/event translation to later units.

# Task 16.3 graph-to-plan decisions

- Keep `fromGraph` pure and graph-boundary-only: canonicalize/hash graph data,
  validate AWS metadata, and emit plain JSON-safe plan records. Resource
  creation, Pulumi values, runtime clients, credentials, and secret values
  remain outside this package and later deployment units.
- Treat AWS provider capability names as the support contract and require the
  production `region` configuration plus declared provider environment names;
  generated resource names/configuration are derived later from stable plan
  IDs rather than requiring resource values in graph metadata.
- Use app/descriptor/profile IDs for logical names, descriptor schedule IDs
  where present, sorted arrays, and graph-hash tags. Record edge-derived IAM
  action names as safe metadata for later least-privilege policy generation;
  task `16.14` owns final policy synthesis.
- Keep the plan converter split across focused private files to satisfy the
  repository's 200-line implementation limit. Add only `@zsys/graph` to the
  deploy workspace dependency because the converter consumes the public graph
  model/hash API.

# Task 16.2 deployment plan decisions

- Keep `@zsys/deploy` dependent only on the existing `@zsys/contracts` JSON
  value type. This keeps plan declarations provider-neutral and gives later
  graph conversion a separate input boundary without importing graph or cloud
  implementation code into the contract package.
- Represent image health, stable logical entries, routes, trigger expansion,
  capability/profile names, and observability settings as plain readonly data.
  Configuration fields contain names only; JSON metadata is bounded by the
  existing `JsonValue` type, so executable callbacks, clients, and resolved
  secrets cannot be described by the public plan contract.
- Keep model profiles optional on the v1 top-level plan because a graph with
  no agent/model references does not need a model capability entry. The
  `models` collection uses logical profile/provider metadata only; credentials
  remain global deployment configuration for later planning work.

# Task 16.1 dependency and build decisions

- Keep `@zsys/deploy` provider-neutral with no Pulumi/AWS dependency because
  Phase 15 plan contracts must not expose Pulumi executable types.
- Put `@pulumi/pulumi` in `@zsys/deploy-pulumi` for the Automation API and
  Pulumi program owner. Put `@pulumi/pulumi`, `@pulumi/aws`, and `@pulumi/awsx`
  in `@zsys/cloud-aws`; the reviewed ECS/Fargate/ALB component owner justifies
  `awsx`. Do not add Pulumi packages to public descriptors, fixtures,
  templates, the provider-neutral planner, or root dependencies.
- Pin the compatible current package set exactly: `@pulumi/pulumi@3.258.0`,
  `@pulumi/aws@7.42.0`, and `@pulumi/awsx@3.8.0`. `awsx@3.8.0` depends on
  `@pulumi/aws@^7.38.0` and `@pulumi/pulumi@^3.142.0`, so the selected pins
  satisfy its Pulumi/AWS floor.
- Resolve the required root build command with a thin `scripts/build.ts`
  driver that invokes the existing Turbo `build` task for all workspace
  packages. Do not duplicate package build logic or change the already
  implemented `zsys build` artifact behavior.

# Task 15.18 Gate 14 decisions

- Approve Gate 14 from the rerun focused CLI/create/generator suite plus the
  rerun packed external smoke. Together they prove the generator path users
  receive, while the focused tests cover the smaller failure and JSON/exit
  contracts that the smoke should not duplicate.
- Treat the packed smoke's temporary registry and external parent directory as
  the rejection evidence against workspace-link-only success. The smoke
  installs from packed `0.0.0` tarballs, then executes both creation entry
  points and generated project commands outside the repository.
- Do not add a second evidence artifact or checksum file in this gate unit.
  The existing notes plus command output assemble the required Gate 14 packet;
  checksum/release artifacts remain owned by later release verification.

# Task 15.17 evidence decisions

- Treat the existing focused generator/CLI tests and packed smoke harness as
  the Gate 14 evidence source for this checkbox. They already exercise the
  required option matrix, rollback paths, tarball execution, generated-project
  commands, route/graph responses, shutdown, source scan, and determinism
  without changing behavior or assembling the gate.
- Record tarball identities as the 25-package packed dependency closure at
  version `0.0.0`. Checksums are not emitted by the current smoke harness and
  are left to the later release/checksum work rather than expanding this
  evidence-only unit.

# Task 15.14 CLI test decisions

- Keep coverage at the existing exported command seams. The current unit adds
  no dispatcher/runtime behavior while still exercising real compiler,
  build, start, graph, environment, doctor, reporter, and signal contracts.
- Copy only the small compiler fixtures into disposable roots and create
  absolute workspace package links for evaluator resolution. This keeps tests
  isolated without adding a test-only package, fixture behavior, or install
  step.
- Assert diagnostics, exit codes, and JSON values structurally; scan the
  captured environment/doctor output for synthetic secrets and assert signal
  listeners/processes are cleaned up before the test returns.

# Task 15.13 successful output decisions

- Put the success contract in one `nextSteps` value returned by the generator;
  the CLI only chooses its human renderer while the existing canonical JSON
  reporter serializes the same data without stdout logging contamination.
- Keep the printed commands identical to the checked-in template scripts:
  `cd`, `bun run dev`, `bun run test`, `bun run check`, and `bun run build`.
  Use the documented localhost ports and hello route; omit the route only when
  `--no-examples` intentionally removes it.
- Render a relative, shell-safe destination in `cd` so the default remains
  exactly `cd my-app` while explicit nested or spaced directories remain
  actionable. Do not probe or start services in the generator; runtime and
  generated-project acceptance remain later checkbox ownership.
- Keep 15.14 CLI test coverage and all later option-matrix, pack-smoke,
  generated-project, deployment, runtime, source, provider, and fixture work
  untouched.

# Task 15.12 failure cleanup decisions

- Expose one `GenerateProjectContext.failAt(point)` seam using the seven named
  generation boundaries: copy, substitute, install, git, doctor, check, and
  rename. The seam is injectable and maps thrown failures to stable
  `ZSYS_CREATE_<POINT>_FAILED` errors without adding a second command path.
- Keep cleanup inside the generator's shared catch boundary. It accepts only a
  resolved `mkdtemp` sibling whose basename has the destination-derived prefix,
  verifies it is a real directory, and recursively removes only that bounded
  path; unresolved, broad, non-directory, or symlink paths are not recursed.
- Attach the verified temporary path and whether cleanup removed it to the
  generation error. This lets callers safely locate a retained staging
  directory without exposing an arbitrary cleanup target, while all
  pre-rename destination mutations remain staged.
- Keep failure coverage in `tests/generator/failure-cleanup.test.ts` and do not
  add successful output, CLI behavior, option-matrix, packed-smoke, or
  generated-project acceptance owned by later checkboxes.

# Task 15.11 generator decisions

- Keep the versioned `templates/default/v1` tree as the bundled source and
  copy it recursively in lexical order. Normalize template directories to
  `0755` and files to `0644` so generated content and modes do not depend on
  the source checkout or umask; packed-artifact coverage remains task 15.16.
- Keep substitutions allowlisted and exact: package name, README heading, and
  the app's stable ID. Scoped package names derive a valid path-independent app
  ID; no arbitrary text replacement is used. `--no-examples` removes only the
  example source/test directories and preserves the project/config/env shell.
- Stage beside the resolved destination and call install, Git, doctor, and
  check through one command seam before `rename`. Use the current doctor
  command's `--project-root` flag and skip Pulumi prerequisite checks when
  cloud or deployment is disabled. Cleanup only ever targets the mkdtemp path;
  injected failure matrices and output belong to later checkboxes.
- Do not make `create-zsys` depend on `@zsys/cli`: the CLI already depends on
  the generator. The generator invokes the installed `zsys` binary or the
  test command seam, preserving the package boundary and packed-project path.

# Task 15.9 template decisions

- Store the bundled templates under the explicit `v1` boundary with complete
  `minimal`, `api`, and `agent` trees. Keeping each variant copy-ready gives
  the later generator a deterministic source tree without a hidden overlay or
  variant-specific merge step.
- Keep the minimal hello route in every variant so the documented first-run
  flow is stable. Add only the capability that distinguishes a variant: a
  JSON echo route for `api`, and a read-only tool/agent plus logical scripted
  model metadata for `agent`.
- Use the current checked-in package/tool versions directly in each template:
  ZSys `0.0.0`, Bun `1.3.10`, and TypeScript `5.9.2`. The later generator and
  packed-release work owns substitution/release compatibility; this unit
  leaves no unresolved version marker behind.
- Keep generated application source on public `@zsys/app`, `@zsys/config`,
  `@zsys/schema`, and `@zsys/testing` seams, with global local/test/AWS
  providers and body capture disabled. Do not add internal runtime imports or
  implement the later test-application/runtime seam here.

# Task 15.8 validation decisions

- Keep validation synchronous and dependency-free. It uses only read-only
  `lstat`, `realpath`, and directory-entry reads, so a failed or successful
  validation cannot create, delete, or modify a destination.
- Accept npm-compatible unscoped/scoped names without normalization. Resolve
  the caller-facing destination with `path.resolve`, but canonicalize existing
  parents only for safety comparisons so macOS symlinked temp paths remain
  unsurprising to callers.
- Treat current-directory ancestors, filesystem root, home/temp broad roots,
  symlink destinations/parents, invalid parents, files, and non-empty
  directories as unsafe. `--force-empty-directory` permits only an existing
  empty directory; it never overrides non-empty refusal and is harmless for an
  absent destination.
- Re-export validation beside the existing options contract. Leave templates,
  generation, installation, Git, rollback, output, and generator tests to
  their owning later checkboxes.

# Task 15.7 options decisions

- Keep option parsing in one 130-line module with no dependency or path
  resolution. `validate.ts` owns package-name, destination, and empty-directory
  safety in 15.8; generation owns installation and Git execution later.
- Apply the v3 defaults directly: `minimal`, `aws`, `pulumi`, install enabled,
  Git enabled when available, examples enabled, no forced empty-directory
  override, and human output unless JSON is requested. Keep cloud and deploy
  choices independent so explicit combinations are preserved for later
  validation/generation.
- Accept both separated and `--option=value` values for value-taking flags,
  reject unknown flags and invalid enum values, and let the CLI's `{json}`
  context share the same normalized result as standalone `create-zsys`.
- Expose only the option contract from the package entry. Do not add the
  generator API, validation, templates, filesystem mutation, or forbidden
  subsystem flags in this unit.

# Task 15.6 doctor decisions

- Keep `doctor.ts` as the reporter-facing seam and split compatibility and
  filesystem/process checks into adjacent same-owner modules so every
  implementation file stays below the 200-line repository limit.
- Reuse the compiler's `loadConfig` validation for `zsys.config.ts` and load
  the configured entry only to validate the public app descriptor shape; do
  not run a full compile or generate artifacts from doctor.
- Treat deployment as enabled only when explicitly requested or when Pulumi
  dependencies/the app's production provider indicate it. When disabled,
  report Pulumi and AWS checks as skipped successes.
- Run frozen installation with Bun's `--dry-run` flag, probe ports by binding
  and immediately stopping a local listener, and write only disposable UUID
  markers under `.zsys` roots.
- Report only AWS credential variable names, never values. Mark only `15.6`
  complete; `15.7` is the next different unchecked unit.

# Task 15.5 environment commands

- Reuse `@zsys/config` `projectEnv` and `resolveEnv` as the sole contract boundary. Load `src/env.ts` by default for the real project path, while accepting an injected definition/source for focused command tests; do not reimplement parsers or inspect runtime/provider state.
- Generate `.env.example` from sorted metadata examples and fixed type placeholders only. Never call default factories, never read resolved values into output, and render sensitive fields as `[redacted]`; an existing file is read-only unless `--write` is explicit.
- Keep `env list` to `{name,status}` items, derive `missing`/`invalid`/`set`/`default`/`optional` with the shared environment-specific requirement rules, and make `explain` metadata-only. Split formatting/parsing and contract/file access into adjacent support files so every implementation file stays below 200 lines.
- Add the required `@zsys/config` workspace dependency to `@zsys/cli`, mark only `15.5` complete, and leave `15.6` as the next different unchecked unit.

# Task 15.4 graph command decisions

- Keep graph commands artifact-only. Read `application.graph.json`, validate
  its version, node/edge shape, and source locations, then delegate
  canonicalization, hashing, and compatibility classification to `@zsys/graph`.
  Do not recompile source or inspect runtime/inspector state from this CLI
  boundary.
- Treat an explicit expected hash as an input to `graph check`; reject malformed
  hash strings and mismatches with distinct stable error codes. A compatibility
  diff reports breaking classifications but only invalid graph/hash input
  fails the command.
- Keep machine output behind the existing CLI reporter and human output
  separate from it. Split the file/validation implementation into the adjacent
  graph support module solely to preserve the 200-line implementation ceiling.
- Mark only `15.4` complete; `15.5` is the next different unchecked unit.

# Task 15.3 CLI command decisions

- Keep `checkProject`, `buildProject`, and `startProject` as direct, injectable
  command seams. Reuse the compiler's evaluator/normalizer/artifact APIs,
  graph hash, and contract versions; do not duplicate graph or runtime
  behavior and do not route later commands through this unit.
- Await compiler artifact writes before returning check results. Build into a
  sibling temporary directory and replace only the validated build root, so a
  failed build cannot remove the previous production output. Start validates
  graph/manifest versions and hashes before spawning the generated server,
  polls both health endpoints, and owns bounded idempotent shutdown.
- Resolve the evaluator child by selecting the emitted `.js` sibling when it
  exists and retaining the `.ts` source fallback for source-mode tests. Rebase
  generated manifest import prefixes from the compiler output directory to
  the production server directory before writing the build artifact.

# Task 15.2 CLI decisions

- Keep `main.ts` as the execution owner and split pure parser/reporter
  contracts into `main-support.ts` only to stay under the repository's 200-line
  implementation limit. Do not add command modules owned by 15.3–15.6.
- Treat `--json` as a global output mode. Human results go to stdout, errors go
  to stderr, and Effect logs use final stderr sinks (JSON logs on stderr in
  JSON mode), leaving stdout safe for one canonical machine result.
- Use exit `0` for help/version/success, `1` for command or internal failure,
  `2` for parser/normalized-option usage errors, `130` for SIGINT, and `143`
  for SIGTERM. The main loop returns codes instead of calling `process.exit`.
- Let `create-zsys` own option normalization and generation. The CLI calls
  only `normalizeCreateOptions(args, { json })` and `generateProject(options,
context)`, so `zsys create` cannot drift from the standalone generator.
  The package is not implemented early; an unavailable API is reported as a
  structured `ZSYS_CREATE_API_UNAVAILABLE` failure until its later owner lands.
- Keep the existing `dist/index.js` bin contract used by the export smoke; the
  index re-exports the CLI and invokes `main()` only when it is the executable
  entry. No generator, template, validation, or later CLI command behavior was
  added.

# Task 15.1 prerequisite decisions

- Treat the completed Gate 1–13 review checkboxes and their durable rejection
  evidence as the approval record; this unit performs prerequisite verification
  and does not reopen or reassemble earlier gates.
- Reuse the existing `test:inspector` and Playwright E2E suites as the
  supervisor/inspector rerun. Do not add a second harness or change supervisor,
  inspector, fixture, graph, or runtime behavior.
- Use the already documented temporary external React/Node type links only for
  Next startup in the Bun-only workspace. Remove them after the run and keep
  package manifests and the lockfile unchanged.
- Mark only `15.1` complete. Keep `15.2` as the next separate unchecked unit;
  no CLI, scaffolder, template, generator, or generated-project behavior is
  started here.

# Task 14.18 Gate 13 approval decisions

- Approve Gate 13 from the deterministic fixture, semantic Playwright flows,
  accessibility contract, protocol import/payload scan, and live bundle scan.
  Together they cover behavior and data rather than screenshots alone.
- Treat the inspector API/SSE clients as the only permitted network boundary;
  the scan's zero violations and zero forbidden live payload markers are the
  evidence that handlers, provider clients, graph reconstruction, and secrets
  do not cross into the UI.
- Treat invalid-candidate diagnostics as an active-generation overlay because
  the browser retained `commerce-generation-1` and
  `sha256:commerce-inspector-fixture-v1` while showing the invalid candidate.
- Mark only `14.18` complete. The next phase's `15.1` remains untouched and
  is not dispatched by this scoped worker.

# Task 14.17 inspector Gate 13 evidence decisions

- Treat the existing deterministic fixture and Playwright flows as the Gate 13
  evidence source. They exercise protocol data/behavior, live SSE insertion,
  active-generation continuity, semantic accessibility, source links, and
  bundle/network payloads without adding runtime or provider behavior.
- Record the fixture's deterministic composer correlation as response `201`,
  request `request-live-0002`, and trace `trace-live-0002`; these IDs are
  asserted through response headers and the linked request/trace UI.
- Use the documented temporary local `@types/react`/`@types/node` links only to
  start the Next E2E server in this Bun-only workspace. Remove them after the
  run and do not add dependencies, manifest entries, or lockfile changes.
- Mark only `14.17` complete; `14.18` remains the next different unchecked
  unit.

# Task 14.16 inspector boundary and payload scan decisions

- Reuse the existing local inspector HTTP/SSE clients and the existing
  production-protection tests. The new scan only adds evidence around their
  boundary; it does not create another API client, auth layer, or runtime
  behavior.
- Parse app/lib imports with the repository's TypeScript import walker and
  allow only local modules plus Next/React packages. Direct network access is
  limited to `lib/api.ts` and `lib/stream.ts`, which keeps route/action traffic
  on the same protocol boundary.
- Scan actual Next development artifacts in `.next/static` and `.next/server`
  from the running E2E server, because a standalone production build is
  blocked by the workspace's intentionally absent `@types/react` and
  `@types/node`; do not add dependencies or ignore build errors to make the
  check pass.
- Inspect live JSON requests/responses and request bodies for internal package,
  handler-object, provider-client, and synthetic-secret markers, while also
  asserting a real `zsys.inspector` protocol payload is received. Keep the
  browser assertions semantic and data-based.
- Mark only `14.16` complete; `14.17` remains the next different unchecked
  unit.

# Task 14.15 inspector fixture and browser-flow decisions

- Host the browser fixture in `tests/inspector` and install the existing
  `packages/inspector-api` endpoints over a stable Hono app. Keep the fixture
  API-only: it imports versioned contracts and observability types, not the
  application, runtime, provider, Effect, or commerce fixture implementation.
- Use fixed graph/generation/request/trace IDs and a fixed timestamp so every
  browser assertion is deterministic. Reset mutable request, job, and
  candidate state between tests; do not close the shared SSE stream on reset.
  Publish only safe request/span/log/diagnostic metadata and keep bodies and
  secret values out of the API projection.
- Model invalid candidates as an overlay on the active generation and model
  retry as a protected local action that transitions the same dead-letter
  instance to `available`. The browser checks the action result while the
  backend contract test checks identity, idempotency, and state transition.
- Drive Playwright through accessible roles and names. Use `localhost` for the
  Next page origin to avoid Next dev-resource cross-origin blocking, and keep
  the backend on loopback with explicit CORS. The Next `CI=1` flag is scoped to
  the web-server command only; it avoids Yarn auto-install in the Bun-only
  workspace and is not a repository dependency/configuration change.
- Mark only `14.15` complete; `14.16` is the next different unchecked unit.

# Task 14.14 inspector accessibility decisions

- Keep all critical interactions on native links, form controls, buttons, and
  the native `<dialog>` element. This gives keyboard behavior and accessible
  role/name computation without adding a component or accessibility library.
- Reuse one confirmation dialog for job retry/cancel and tool approve/deny.
  It uses cancel-first focus, Escape cancellation, a busy live status, and
  restoration of the invoking control; the protected API remains responsible
  for authorization, identity, idempotency, and audit.
- Link generated route fields and function JSON input to descriptions and
  errors with `aria-describedby` and `aria-errormessage`; focus the first
  invalid field or summary and move focus to the result/error heading after a
  completed interaction.
- Announce loading, submission, success, failure, live connection, and filter
  changes through bounded `role="status"`/`role="alert"` regions. Add no new
  `data-testid`; the existing overview IDs remain only for values with no
  better semantic selector.
- Keep the source-level semantic contract test small. Deterministic fixture
  rendering and Playwright role/name flows belong to checkbox `14.15`.
- Mark only `14.14` complete; `14.15` is the next different unchecked unit.

# Task 14.13 inspector source-link decisions

- Keep source metadata project-relative at both the existing API projection
  boundary and the browser model. Invalid, absolute, escaping, and
  protocol-looking paths are discarded rather than displayed or joined to a
  local path.
- Treat editor protocols as an allowlist (`vscode`, `cursor`, `webstorm`) and
  read the configured choice from the local inspector build environment. Do
  not accept a caller-supplied URI template or arbitrary scheme.
- Generate links only in development when the configured backend is absent or
  on a loopback host. Production and test modes, remote backends, and unknown
  editors receive plain source text without a link.
- Reuse one source model/component across route, function, event, resource,
  environment, and diagnostic pages. Do not add an inspector source store,
  API endpoint, project-root disclosure, or runtime/provider import.
- Mark only `14.13` complete; `14.14` is the next different unchecked unit.

# Task 14.12 inspector environment and diagnostics decisions

- Reuse the existing versioned inspector API/client, active-generation
  resolver, safe graph/diagnostic projections, candidate identity, SSE cursor,
  and cache invalidation. Do not add a second environment or diagnostics
  store, and do not import application, runtime, provider, Effect, Hono,
  Pulumi, or fixture packages into the inspector.
- Keep `/env` active-only and value-free because the requested candidate
  distinction belongs to diagnostics. Project only names, safe types,
  required-in metadata, default presence, sensitivity, descriptions, and
  project-relative source locations; omit values, defaults, examples, and
  secret content.
- Keep active diagnostics as a durable slice even when candidate diagnostics
  are present. Candidate diagnostics may be the visible status slice, but the
  response and UI retain active identity, graph continuity, diagnostics, and
  source version while candidate state is loading or failing.
- Normalize or drop non-project-relative source paths at the API boundary.
  Candidate and stream refresh state is an overlay on the last snapshot, not
  a replacement that blanks the active-generation UI.
- Mark only `14.12` complete; `14.13` is the next different unchecked unit.

# Task 14.11 inspector observability decisions

- Reuse the existing versioned observability query/detail endpoints, local API
  client, SSE cursor/reconnect client, redaction, and cache invalidation. Do
  not add an inspector telemetry store or a second runtime boundary.
- Keep filter state local to the page and send only bounded, normalized query
  parameters. Use the backend cursor for pagination and merge only a matching
  redacted live record on the first page; otherwise refresh the bounded page.
- Build request timelines from the existing request timeline projection and
  trace waterfalls from safe span identity/timing/parent fields. Correlated
  request and log links remain ordinary API routes with encoded IDs.
- Render only safe identifiers, status/outcome, timing, message, component,
  and bounded correlation metadata. Bodies, protected headers, cookies,
  prompt/result content, secrets, and arbitrary attributes never cross the
  browser model or UI.
- Mark only `14.11` complete; `14.12` remains the next different unchecked
  unit.

# Task 14.10 inspector tool and agent decisions

- Reuse the existing versioned graph, runtime, observability, capability, and
  local inspector clients. The UI remains an API-only consumer and adds no
  application, runtime, provider, Effect, Hono, Pulumi, or fixture import.
- Join each tool to its target function in the safe graph projection so input,
  output, and declared errors are inherited without giving tools a handler.
  Keep agent input/output, logical model profile, allowlisted tool IDs, and
  finite limits visible while omitting agent instructions.
- Project only bounded invocation and model/tool span metadata into the browser
  model. Prompt, tool-argument, result, and arbitrary attribute fields are not
  copied or rendered by default.
- Keep pending approval controls behind the advertised protected versioned
  action paths. Native confirmation, active generation/graph identity,
  capability checks, fresh idempotency keys, server authorization, and audit
  metadata all remain owned by the existing action boundary.
- Mark only `14.10` complete; `14.11` is the next different unchecked unit.

# Task 14.9 inspector bucket and cache decisions

- Reuse the existing graph/runtime collection endpoints and local inspector
  client; do not add a provider, storage, action, or browser persistence seam.
- Join graph descriptors to projected runtime items by `bucketId`, `cacheId`,
  or `id`, then copy only the fixed safe profile, capability, operation,
  state, schema, policy, and counter fields needed by the pages.
- Derive operation metadata from the public bucket/cache operation contracts.
  Optional signed-URL and increment operations are supported only when the
  corresponding runtime capability is advertised; capability absence stays
  visible as unavailable metadata rather than enabling a browser action.
- Keep cache key/value schemas as non-secret graph metadata, while dropping
  runtime keys, values, provider roots, and arbitrary runtime objects before
  the browser model or tests can expose them.
- Mark only `14.9` complete; `14.10` is the next different unchecked unit.

# Task 14.8 inspector event decisions

- Reuse graph event nodes, `publishes-event` edges, generic event-trigger
  nodes, `listens-to-event` edges, and their expanded `id@version` selector
  pairs for the event list/detail pages; do not create a second browser graph
  or an application-owned resource kind.
- Keep event runtime data behind the existing versioned inspector runtime
  boundary. Query the local `zsys.events.admin` protocol through the generation
  service, then project only safe contracts, schemas, policies, attempts,
  publications, deliveries, and dead letters; never import provider code or
  expose handlers, provider details, publication payloads, or failure data.
- Use event, event-trigger, listener, publisher, delivery, and dead-letter
  terminology in the UI and tests. The listener model is a generic trigger
  binding, not a new application resource.
- No local event mutation action was requested by 14.8; keep the page read-only
  and leave later inspector surfaces to their own units.
- Mark only `14.8` complete; `14.9` is the next different unchecked unit.

# Task 14.7 inspector job decisions

- Reuse graph job descriptors for retry policy, target, schedules, and input
  schemas; use the versioned runtime list for bounded queue entries and derive
  state counts only from projected state fields, without importing provider
  queues or job admin implementations into the browser.
- Preserve safe runtime `nextRunAt`, `nextFireAt`, `nextRun`, and `schedules`
  metadata in the existing inspector projection so schedule next-run values
  cross the same redaction boundary as other runtime state.
- Read the versioned API root capabilities before enabling local retry/cancel
  buttons. A capability-missing action stays disabled, and an enabled action
  still requires native confirmation, active generation/graph identity, and a
  fresh idempotency key before the protected action endpoint is called.
- Render only safe attempt identity/state/timestamps and failure code/message;
  never render job input, lease owners, or failure payload data.
- Mark only `14.7` complete; `14.8` is the next different unchecked unit.

# Task 14.6 inspector function decisions

- Reuse the existing graph detail projection for schemas, dependencies, source,
  limits, and declared/observed edges; do not add a second inspector data model
  or import runtime objects into the UI.
- Keep local invocation in the existing versioned client boundary. The browser
  sends only JSON input, the active generation ID, graph hash, and an
  idempotency key to the protected function action; the server remains the
  owner of validation, execution, redaction, and audit.
- Query logs and traces by the function ID through the observability protocol,
  display only bounded safe correlation fields, and refresh those pages after
  invocation rather than inventing a browser-side telemetry store.
- Mark only `14.6` complete; `14.7` is the next different unchecked unit.

# Task 14.5 inspector route decisions

- Reuse the existing versioned graph and observability clients for route list,
  detail, and recent-request data; the page stays an API-only consumer and
  does not import application, runtime, provider, Effect, Hono, Pulumi, or
  fixture packages.
- Derive composer fields from the serializable request mapping and target input
  schema. Required/default/optional fields, path/query/header/cookie/body,
  whole-body, and multipart values are validated and encoded at the browser
  boundary before invocation.
- Derive the displayed OpenAPI operation locally from the same safe contract
  projection, including parameters, media-specific request bodies, response
  schemas, validation fallback, source metadata, middleware, and transforms;
  importing the server OpenAPI package would violate the inspector boundary.
- Send composer requests through the configured active-backend URL using the
  local client boundary, preserve correlation headers, and read response
  `x-request-id`/`x-trace-id` values for direct request and trace links.
- Mark only `14.5` complete; `14.6` remains the next different unchecked unit.

# Task 14.4 inspector graph UI decisions

- Keep graph loading in a small client hook that uses only the existing local
  versioned API/SSE clients. A browser-relative fetch keeps the Next page
  build-time side-effect free and avoids a second server-side API boundary.
- Normalize only versioned graph identity, node IDs/kinds, and edge endpoints;
  do not copy arbitrary node metadata into the UI model. The existing API
  projection remains the sole source of graph/observed-edge data and already
  redacts handlers, provider files, and secrets.
- Sort nodes and edges with a code-point comparator, then place nodes in a
  fixed square grid. This keeps the commerce fixture byte/re-render stable
  and gives 1,000-node graphs O(nodes + edges) layout work with a scrollable
  viewport instead of force simulation or per-node state.
- Render declared edges as solid teal lines and observed edges as dashed amber
  lines. Repeat the distinction in a labeled legend and a semantic relationship
  list so color/line style is not the only accessible signal.
- Mark only `14.4` complete; `14.5` is the next different unchecked unit.

# Task 14.3 inspector client decisions

- Keep the browser client protocol-only and define the small JSON-safe
  envelope/types locally; the inspector boundary rejects importing the
  `@zsys/inspector-api` package into `apps/inspector`. Graph/runtime responses
  use `zsys.inspector`, while request/log/trace pages use the distinct
  `zsys.observability.query` envelope and are validated explicitly.
- Use native `fetch`, `ReadableStream`, and `localStorage` rather than adding
  an EventSource or client dependency: the cursor must be sent in both the URL
  and `Last-Event-ID`, and the stream needs bounded retry/drop accounting.
- Persist each accepted cursor before notifying listeners, count monotonic
  gaps plus explicit drop metadata, invalidate only the cache tags affected by
  each event, and clear all cached data when a retained cursor expires.
- Split validation/protocol helpers from the two public clients so every
  implementation file remains within the repository's 200-line guard.
- Mark only `14.3` complete; `14.4` remains the next different unchecked unit.

# Task 14.2 inspector overview decisions

- Keep the shell presentational and API-only. The active generation, graph hash,
  connection state, and dropped-event count are bounded props so checkbox
  `14.3` can wire the versioned HTTP/SSE client without adding a second data
  source or letting the UI inspect application/runtime objects.
- Use native anchors, grouped `nav` sections, `aria-current`, a skip link,
  live connection status, semantic headings, and responsive CSS; no component
  library or client-side routing dependency is needed for the shell.
- Show safe empty-state labels until the API client is installed. Bound
  metadata labels and dropped-event counts, and never render error messages,
  request/response bodies, cookies, authorization values, secrets, or provider
  clients by default.
- Keep Next's missing `@types/react`/`@types/node` auto-install outside this
  unit because 14.1 fixed the exact dependency scope and the root repository
  checks do not include a Next build. Do not mask the issue with ignored build
  errors or an ad hoc type shim.
- Mark only `14.2` complete; `14.3` remains the next different unchecked unit.

# Task 14.1 inspector dependency decisions

- Reuse the existing Gate 12 approval packet and rerun its exact
  supervisor/inspector API contract command; adding a second API harness would
  duplicate the 13.13/13.14 coverage.
- Keep the existing compatible Next baseline at exact `16.3.0` and pair it
  with exact React and React DOM `19.2.8` in `apps/inspector`.
- Keep browser E2E tooling at the root because the reserved `test:e2e` command
  runs from the workspace root; pin `@playwright/test` to `1.62.1`, which
  provides the matching `playwright` package in the lockfile.
- Reuse the established inspector boundary rule and Phase 0 negative tests;
  no duplicate import scanner or UI code is needed for this dependency unit.
- Mark only `14.1` complete; `14.2` is the next different unchecked unit.

# Task 13.16 Gate 12 evidence decisions

- Reuse the existing 13.13 regression and 13.14 contract matrices as the
  Gate 12 rejection evidence; adding another harness would duplicate tested
  seams without increasing coverage.
- Treat candidate verification, token-scoped output, compare-and-switch,
  readiness, API-only projection, and production-protection assertions as
  the acceptance boundary. Do not implement Phase 13 UI or redesign runtime
  controls in an evidence-only task.
- Record configured deadline values with the drain and health evidence so the
  packet remains deterministic without introducing flaky wall-clock claims.
- Mark only `13.16` complete; `14.1` is the next different unchecked unit.

# Task 13.15 Gate 12 verification decisions

- Use the existing 13.13 supervisor/CLI regression evidence and 13.14
  inspector-api contract fixtures as the Gate 12 evidence source; do not add a
  second gate harness or change runtime behavior for an evidence-only unit.
- Record configured drain and health deadlines alongside the asserted reports
  so cancellation evidence remains deterministic without turning timing into
  a flaky wall-clock threshold.
- Keep the root verifier's `test:inspector` entry as its explicit later-suite
  placeholder; the assigned package/test-root command is the actual 13.15
  reproduction and its result is recorded without mislabeling the placeholder
  as tested.
- Mark only `13.15` complete; `13.16` remains the next implementation unit.

# Task 13.14 inspector contract decisions

- Drive the contract matrix through the existing router, projection,
  authorization, observability, and action seams with inert fixtures; do not
  import application handlers, provider files, registries, or runtime objects.
- Apply common API-version header negotiation to observability routes while
  leaving their query \`protocol\`/\`version\` parameters available for the
  observability protocol. Advertise the installed graph detail, source detail,
  observability, and action paths from the API root without duplicate entries.
- Use throwing accessors for \`handler\` and provider-file fields plus synthetic
  secrets to make unsafe endpoint reads fail immediately and to verify safe
  projections rather than relying only on response snapshots.
- Split the contract fixtures and matrix into focused files so every checked
  TypeScript file remains within the repository's 200-line guard.
- Mark only \`13.14\` complete; \`13.15\` remains the next implementation unit.

# Task 13.13 regression decisions

- Use real bounded `startDev` sessions with generated Bun candidates for the
  compile/start/hash/API/readiness failure matrix so each failure proves stable
  active traffic, token-scoped output cleanup, and no active-target change.
- Keep the rapid-save test synchronized on the first candidate's abort signal;
  the older candidate must reject before the newer candidate can activate.
- Keep old-request completion in the CLI integration path and drain-time
  cancellation at the supervisor proxy/drain seam. A real Bun server surfaces
  an intentionally aborted handler as a rejected server fetch, while the
  supervisor contract is the abort signal plus retired-traffic rejection;
  `packages/supervisor/proxy.test.ts` already covers that seam directly.
- Split the CLI regression fixture from its test file so both remain below the
  repository's 200-line implementation guard without adding runtime helpers.
- Mark only `13.13` complete; `13.14` remains the next implementation unit.

# Task 13.12 production protection decisions

- Keep production inspector graph and observability routes disabled by
  default. Explicit enablement must provide a bearer token or authorization
  callback, preserving the existing local/test defaults.
- Treat configured authorization callbacks as real deny-capable guards. A
  `false` callback result cannot fall through to an allow when no bearer token
  exists; when both mechanisms are configured, a valid bearer token remains an
  alternative successful credential.
- Keep local control actions available only through the existing development/
  test action seam. Production requests are rejected after authorization and
  before dispatch, so read-only production access cannot mutate runtime state.
- Apply the same callback-denial correction to the lower-level runtime endpoint
  guard because it owns the earlier graph/observability endpoint path.
- Mark only `13.12` complete; `13.13` remains the next implementation unit.

# Task 13.11 CLI development decisions

- Keep `startDev`/`runDev` as plain Promise-facing APIs around one
  `DevSession`; compilation stays injectable because the repository has no
  single supervisor compiler entrypoint yet.
- Use the existing stable proxy and dynamic candidate contracts. Register one
  generation drain before activation so proxy admission, retirement, and
  shutdown share the same bounded lease owner.
- Start an inspector child only when an explicit command is configured. Pass
  stable backend/inspector ports through environment variables and keep the
  UI out of this unit.
- Install process signals and external abort handling through one removable
  cleanup seam. Route lifecycle messages through the existing Effect logger;
  direct stderr output is confined to the final logger sink.
- Mark only `13.11` complete; `13.12` remains the next implementation unit.

# Task 13.10 inspector action decisions

- Keep actions protocol-only and generation-scoped. The action layer receives
  explicit function, job, event, approval, and audit callbacks; it never
  imports or resolves provider files, handler objects, registries, or runtime
  implementation objects.
- Re-resolve the active generation for every action, require the submitted
  generation ID and graph hash to match, reject production mutations, reuse
  inspector authorization/version negotiation, and retain one in-process
  idempotency result per installed API.
- Delegate local job/event mutation to the versioned admin request shapes, but
  check supplied status seams before dispatch and reject ineligible retry or
  terminal cancel states. The current local event admin contract owns retry
  only, so event cancel is an optional explicit action seam rather than a
  fabricated provider operation.
- Project only safe action metadata and redacted function output. Audit records
  contain action identity, generation identity, mode, idempotency key, outcome,
  bounded reason, and safe error code; they never capture action input/output
  content or implementation objects.
- Mark only `13.10` complete; `13.11` remains the next implementation unit.

# Task 13.9 inspector API decisions

- Keep the API protocol-only: active-generation identity and safe snapshot/list/query seams are injected, while inspector-api does not import runtime-effect, engine, supervisor, provider, manifest, or handler modules.
- Serve graph nodes/descriptors and environment metadata from the active generation's canonical graph; normalize source locations through the contracts helper and never resolve the environment service, so secrets cannot enter the API path.
- Reuse the existing inspector observability endpoint installer and redaction boundary. Add only v1 root/version negotiation, bounded numeric cursors, production protection, and read-only graph/runtime projections; actions and subscriptions remain later units.
- Whitelist runtime state fields for functions, jobs, events, buckets, cache, tools, and agents. Explicit snapshot/list/query/get callbacks may supply state, but handler objects, provider roots, raw cache keys/values, and generic service-registry access stay outside the boundary.
- Mark only `13.9` complete; `13.10` remains the next implementation unit.

# Task 13.8 observability decisions

- Adapt the existing supervisor telemetry listener instead of adding a second
  lifecycle event bus. The adapter emits only the already-versioned
  `GenerationRecord`/`DiagnosticRecord` model values and routes them through
  the existing collector, stream, and optional segment append seams.
- Require an explicit graph-hash string or per-token resolver at the adapter
  boundary. A missing hash is an error rather than a placeholder, so generation
  isolation remains queryable and no record can silently lose graph identity.
- Carry the retired token on switch/drain outcome telemetry. This lets the
  adapter emit `draining`/`stopped` records for the old generation while
  preserving the new active token and graph hash.
- Use the existing redaction admission function before every configured sink;
  sink errors are swallowed so telemetry cannot change last-known-good
  lifecycle behavior. Append writes are serialized and exposed through one
  `flush` promise for deterministic tests.
- Add `generationId` and `graphHash` as bounded query/index filters rather than
  a new query protocol or subscription. Mark only `13.8` complete; `13.9`
  remains the next implementation unit.

# Task 13.7 drain decisions

- Keep one `SupervisorGenerationDrain` per retired 13.2 token. Its leases are
  the only admission path for old-generation work, so starting drain closes
  admission and prevents a late proxy request from entering the retired
  target.
- Give each lease its own abort signal and optional interrupt callback. The
  deadline first permits normal completion, then aborts/calls interruption for
  the remaining leases before provider and `StartedCandidate.dispose` cleanup.
- Reuse the 13.4 candidate's idempotent `dispose` contract, close the candidate
  before providers, close providers in reverse registration order, and bound
  every cleanup action against the same deadline. A report records completion,
  interruption, remaining work, cleanup status, and bounded failures without
  exposing lifecycle implementation details.
- `drainPreviousGeneration` checks the state machine's active/previous tokens
  and `draining-previous` state before cleanup, then calls the existing
  `drainSucceeded`/`drainFailed` transition. A stale completion cannot replace
  the active generation.
- Extend the stable proxy only with an optional structural lease tracker; the
  proxy still selects the immutable target before forwarding, preserves its
  target semantics, and composes request cancellation with the drain signal.
- Mark only `13.7` complete; `13.8` remains the next implementation unit.

# Task 13.6 proxy decisions

- Bind one Bun listener for the supervisor lifetime, defaulting to the v3
  development port `3000`; candidate ports remain the dynamic 13.4 ports and
  are never exposed as the public development address.
- Store only an immutable normalized `{ hostname, port, token }` target and
  replace it synchronously through compare-and-switch. Require the expected
  token and strictly newer source/generation tokens so stale candidates cannot
  become active or route new requests.
- Select the target before the first forwarding await. This lets an already
  admitted request or SSE stream finish on its generation while every request
  admitted after the switch uses the new target; drain ownership remains 13.7.
- Copy request metadata, including request/trace IDs, `Accept`, and
  `Last-Event-ID`, while removing hop-by-hop transport headers. Return the
  candidate response directly so SSE headers and streaming bodies are not
  buffered or reconstructed.
- Mark only `13.6` complete; `13.7` remains the next implementation unit.

# Task 13.5 candidate verification decisions

- Probe the candidate's fixed v1 internal endpoints with one overall deadline,
  retrying only transient health unavailability; do not treat child-process
  existence as readiness.
- Require safe graph/manifest metadata from the candidate API and compare both
  hashes, all contract/generator versions, and the 13.2 source/generation token
  before returning verification success.
- Treat environment and provider readiness as separate required health fields.
  On failure, call the 13.4 candidate's idempotent disposer and never touch the
  active generation; the caller advances `verificationSucceeded` only after
  this function resolves.
- Keep verification in supervisor-owned files with a contracts dependency;
  proxy, drain, CLI, inspector API, and runtime endpoint expansion remain
  later units.
- Mark only `13.5` complete; `13.6` remains the next implementation unit.

# Task 13.4 candidate decisions

- Use the existing 13.2 token as the candidate identity and place output in a
  token-scoped generation directory. Validate the entrypoint and cleanup path
  before removing anything, so failed cleanup cannot reach the active
  generation.
- Keep compilation injectable because the compiler graph has no single
  supervisor compile entrypoint yet. Start the generated entrypoint with
  `Bun.spawn` and port `0`, then expose the selected internal port for later
  verification and proxy units.
- Share one byte budget across stdout and stderr and emit bounded startup
  chunks through the candidate logger. Stop with SIGTERM, escalate to SIGKILL
  after the bounded timeout, and make stop/dispose idempotent.
- Mark only `13.4` complete; `13.5` remains the next implementation unit.

# Task 13.3 watcher decisions

- Keep watch orchestration in a small supervisor-owned class with an injected
  compile callback; candidate directories, processes, readiness, switching, and
  draining remain owned by later units.
- Allocate a 13.2 source/generation token for each accepted notification so a
  newer save obsoletes the prior candidate immediately, while only the latest
  coalesced batch starts after the debounce window.
- Abort the prior compile with a native `AbortController` and pass an
  `isCurrent` guard to the callback. Late completions still route through the
  state machine, which emits `candidate-stale` and rejects the old token.
- Mark only `13.3` complete; `13.4` remains the next implementation unit.

# Task 13.2 state-machine decisions

- Keep the state machine pure and synchronous: it owns tokens, lifecycle
  transitions, stale-candidate rejection, and telemetry, while later units own
  file watching, candidate processes, verification, proxying, and draining.
- Represent source and generation identity as positive safe-integer pairs. A
  new source batch allocates both counters before compilation; callbacks for a
  superseded pair emit `candidate-stale` and cannot change active state.
- Record transition and outcome events in one ordered telemetry log. Failure
  outcomes use the existing active generation when available and otherwise
  return to `idle`; no failure lifecycle state was added.
- Split the telemetry buffer and transition table into same-owner helpers so
  the primary implementation remains within the repository's 200-line limit.
- Mark only `13.2` complete; `13.3` remains the next implementation unit.

# Task 13.1 prerequisite decision

- Keep `13.1` evidence-only and reuse the approved Gate 3–11 packets plus the
  existing compiler, runtime, provider, and observability tests; do not add a
  second gate harness or start supervisor/inspector/CLI implementation here.
- Treat the two commerce-fixture warning assertions as the recorded optional
  mismatch, and keep the root verifier's later-suite output honest as explicit
  `NOT RUN` placeholders. The focused checks remain merge-blocking.
- Mark only `13.1` complete. The next unit is `13.2`, which owns supervisor
  state-machine implementation.

# Task 12.16 Gate 11 decision

- Approve Gate 11 using the existing 12.1–12.15 contracts, matrices, tests,
  recursive security scan, and source scan; do not add a report generator or
  duplicate observability harness.
- Treat the focused inspector API rerun as the evidence for versioned,
  correlated query/detail/SSE behavior. The root verifier's security entry
  remains an honest `NOT RUN` placeholder; the prescribed security directory
  suite is the verified security check.
- Mark only `12.16` complete. The known optional commerce-fixture telemetry
  warning mismatch and protected `repos/effect` discovery limitation remain
  outside this gate and non-blocking.

# Task 12.15 verification decision

- Reuse the existing package, integration, and security tests as the Gate 11
  evidence source. Their focused matrices already cover all six outcomes,
  cross-signal correlation, bounded retention/index repair, cursor replay,
  subscriber overflow, and recursive zero-secret scanning.
- Record the matrix results in `PROGRESS.md` rather than adding a report
  generator or duplicating the observability harness. The root verifier's
  security placeholder remains an honest `NOT RUN` entry; the prescribed
  security directory suite is the verified 12.15 security check.

# Task 12.14 collector admission decision

- Use a nominal, in-memory `WeakSet`-backed redacted-record brand at the
  existing admission boundary. This proves sink inputs came through the
  redactor without changing the JSON record shape or adding a second pipeline.
- Keep raw records only at explicit input boundaries; collector consumers,
  storage/index/query, and logger sinks accept the branded output. Stream
  payloads keep the existing generic redaction path for non-record data.
- Extend the existing logger source check with one small AST scan over the
  observability source roots. Only existing owned adapters may serialize
  records or write direct output; broader recursive Gate 11 scanning remains
  assigned to `12.15`.

# Task 12.13 security/redaction decision

- Reuse the existing collector, logger, storage/index/query, stream, runtime
  internal endpoints, inspector API, and deterministic testing harnesses; the
  security unit needs one recursive assertion helper, not a second telemetry
  pipeline or scanner framework.
- Use the exact synthetic password, bearer token, cookie, and API key across
  logger, request, trace, agent, job, and event inputs, and scan only captured
  telemetry/API surfaces. The event provider's raw application envelope is
  input data for the handler rather than an observability sink; event
  invocation telemetry is scanned.
- Keep this unit test-only. Collector-consumer/source enumeration belongs to
  `12.14`, and the broader Gate 11 suite remains owned by `12.15`.

# Task 12.12 observability test decision

- Extend the existing focused package suites instead of adding a new harness:
  request-record tests cover the six outcomes and correlation fields,
  redaction tests cover body capture modes, and the existing runtime logger
  test covers the human/JSON format seam.
- Treat the already-owned storage and stream tests as the smallest evidence
  for rotation, retention, rebuild, repair/quarantine, reconnect,
  backpressure, and drop counters; do not duplicate those bounded scenarios
  in a second integration framework.
- Keep all test inputs deterministic and secret-safe, and leave endpoint
  behavior, recursive security scanning, and later instrumentation migration
  to their assigned checkboxes.

# Task 12.11 inspector API observability decision

- Mount the endpoint adapter with the existing Hono convention in
  `@zsys/inspector-api`, while keeping query parsing, redaction, pagination,
  cursor semantics, and stream retention in `@zsys/observability`. This keeps
  the HTTP layer thin and avoids a second query or stream protocol.
- Treat URL cursors and `Last-Event-ID` as strict decimal cursors, cap query
  limits at the existing 100-record contract maximum, and let the existing
  query/stream implementations perform retained-cursor and semantic filter
  validation.
- Use a pull-driven native `ReadableStream` for SSE so one pending subscriber
  read is bounded and `cancel`/request abort closes the existing subscription.
  Event filtering is applied at the adapter boundary without changing 12.10
  stream behavior.
- Reuse the established development/test/production mode, bearer token, and
  authorization-hook rules. Production observability endpoints are off by
  default; enabling them without one protection hook is a configuration error.
  HTTP failures expose only stable safe codes and never underlying causes.

# Task 12.10 observability stream decision

- Keep live stream retention as a separate bounded in-memory ring over the
  existing versioned model/collector seams; `12.11` can adapt its pages to
  HTTP/SSE without making the stream depend on Hono or a network.
- Assign cursors only on accepted events and never reset them when retention
  evicts old entries. Explicit cursors older than the retained predecessor are
  rejected as expired so reconnects cannot silently claim complete replay.
- Give every subscriber a bounded async queue. Default overflow drops the
  oldest queued event to preserve the newest live state; callers may choose
  drop-newest or disconnect. Retention and subscriber drops remain distinct in
  observable counters.
- Admit `{ type, record }` inputs through the existing collector and admit
  generic data through the existing redaction policy. Keep the ten required
  stream event names versioned and reject unknown types; do not add endpoint,
  SSE, or instrumentation wiring in this unit.

# Task 12.9 observability query decision

- Keep query pagination on the 12.8 index's monotonic cursors. Time filters
  use indexed timestamps; request-ID matching also accepts `correlationId` so
  child records from the existing runtime vocabulary remain discoverable
  without changing the storage contract.
- Expose one small versioned query protocol with bounded request/log/trace
  pages and request/log/trace detail methods. Trace pages/details include both
  `trace` and `span` records; no SSE, inspector endpoint, or later
  instrumentation migration is introduced.
- Re-admit every offset read through the existing redaction policy before it
  enters a response, and cap detail collection at the query bound. This keeps
  storage/index seams authoritative while preserving secret-safe defaults.

# Task 12.8 observability index and retention decision

- Use one atomic `index/index.json` containing only versioned record metadata,
  relative segment paths, byte offsets/lengths, safe correlation/filter fields,
  and monotonic cursors. Rebuild it from repaired valid segments on startup
  instead of trusting a stale or malformed index file.
- Keep the live index in `Map` instances bounded by `maxEntries`; pagination
  returns at most the configured page size and reads records by offset. A
  bounded map scan is retained for filters, with a `ponytail` ceiling and no
  ordinary query-time disk scan or unbounded result array.
- Enforce age and total-byte retention at finalized-segment boundaries. Delete
  whole oldest eligible segments, never an active segment, then atomically
  rewrite the index. Startup rebuild and rotation both run the same retention
  path, so repair and live append state converge.
- Make `segments.ts` accept the optional index writer for append offsets and
  active-to-final rename updates. The index remains a separate storage seam;
  query/detail APIs, SSE, inspector endpoints, and security-suite work stay
  owned by 12.9–12.16.

# Task 12.7 observability segment storage decision

- Keep `segments.ts` as the public store seam and split only filesystem repair
  helpers into `segment-files.ts` to preserve the repository's 200-line
  implementation limit.
- Route request records to `requests`, structured logs to `logs`, and the
  remaining versioned model signals to `traces`; the model's signal/version
  remains the line contract and no parallel envelope is introduced.
- Write to `.active.ndjson`, sync before rotation, and atomically rename to a
  numbered `.ndjson` segment. Startup rewrites only the valid prefix and
  stores a safe quarantine marker rather than copying malformed bytes, keeping
  the disk sink secret-safe even when a damaged tail is not parseable.
- Treat the supplied collector as the admission authority; without one, use
  the existing redaction policy directly. Indexes, retention, queries, SSE,
  and inspector exposure remain owned by 12.8–12.11.
- Preserve an earlier non-success request outcome when lifecycle finalization
  infers success, and return the retained outcome so the terminal response
  detail stays consistent. This fixes non-throwing validation responses without
  guessing that every 4xx response is a validation failure.

# Task 12.6 HTTP request records decision

- Build the request record at the HTTP middleware seam and admit it through
  the existing bounded collector; do not add a second sink, storage, or query
  path. The builder keeps only metadata and an ordered bounded-by-admission
  timeline, while collector redaction remains the memory boundary.
- Reuse the existing HTTP `correlationId` propagated by the engine. Match
  completed invocation and span records by trace plus correlation, then map
  already-safe resource, job, event, and tool model records to detail kinds.
- Keep body/headers/cookies/prompts/results out of the default record and use
  safe normalized failure outcomes for all route/mapping/invocation paths.
  Response mapping, storage, retention, query, SSE, inspector, security, and
  broad instrumentation changes remain later work.

# Task 12.5 runtime-effect logger decision

- Reuse the versioned `@zsys/observability` `LogRecord` and 12.4 collector;
  the runtime-effect workspace dependency preserves the existing dependency
  direction because observability depends only on contracts.
- Keep the Phase 4–10 `redact` hook as a compatibility pre-admission step, but
  make the collector the final admission authority before either sink runs.
  The default logger creates a bounded collector so its default human sink
  also receives only admitted records.
- Project Effect cause reasons through the existing failure-redaction helper
  instead of exposing raw `Cause` values. Keep direct console/process output
  only in the named final human/JSON sink adapters.

# Task 12.4 observability collector decision

- Keep `packages/observability/src/collector.ts` as the only bounded runtime
  admission point. It calls the existing redaction policy before memory
  retention, stores a newest-record window, and exposes only safe model
  records; no sink, file, query, stream, or inspector adapter is introduced.
- Normalize existing Phase 4–10 hook envelopes at the observability package
  boundary. Engine and agent sinks, plus HTTP lifecycle hooks, remain
  structurally compatible with the collector so descriptor packages do not
  depend on `@zsys/observability`; direct model records cover job, event,
  resource, tool, trace, diagnostic, generation, and request signals.
- Retain invocation/span hook events for compatibility inspection, but admit
  only their safe invocation/span model projections. Completion records use
  the existing completion envelope; release and edge notifications remain
  hook-only until their owning later telemetry contracts require retention.
- Keep HTTP lifecycle conversion as correlated log metadata for `12.4`.
  Request records/timelines, logger sink integration, storage/query/SSE, and
  inspector exposure remain explicitly deferred to their assigned checkboxes.

# Task 12.3 observability redaction decision

- Keep `packages/observability/src/redaction.ts` as the only admission seam
  and reuse `@zsys/contracts` canonical JSON/deep-freeze utilities; no runtime
  package or instrumentation caller is migrated before checkbox `12.4`.
- Use omission for protected fields in default mode. Development capture is a
  separate explicit `development-redacted` operation with built-in and
  configured key matching, text credential masking, and a required positive
  byte limit; captured replacement markers are safe JSON values.
- Treat unknown/non-JSON, accessor, cyclic, binary, and non-finite values as
  unavailable/redacted rather than serializing them. Sort object keys and
  clone/freeze the result so the returned record is deterministic and safe at
  the memory boundary.

# Task 12.2 observability model decision

- Keep the public model versioned with a `version` and `signal` discriminator,
  and re-export the small shared, records, and traces modules through
  `packages/observability/src/model.ts` so each implementation file stays
  within the repository's 200-line limit.
- Reuse `@zsys/contracts` JSON primitive/value types. Shared correlation fields
  cover request, trace, invocation, generation, graph, and correlation IDs;
  the completed request record preserves the exact v3 six-outcome union and
  its ordered detail timeline.
- Preserve the Phase 4–10 invocation, span, resource, job, event, logging, and
  agent vocabulary. Records carry metadata, IDs, timings, statuses, outcomes,
  and byte counts; request bodies, protected headers/cookies, binary content,
  environment values, and model prompt/result content are not model fields.
- Keep redaction admission, collection, sinks, storage, query, SSE, and
  instrumentation migration for their later checkboxes; 12.2 adds no runtime
  behavior beyond the public model exports.

# Task 12.1 Gate 4–10 prerequisite decision

- Keep checkbox `12.1` evidence-only. The checked Gate 4–10 reviews remain
  approved, and the focused engine, HTTP, provider, job, event, and agent
  selectors pass without network access.
- Keep the two full HTTP/jobs commerce fixture assertion failures as the
  existing non-blocking telemetry-warning mismatch. The assertions expect an
  empty diagnostic list even though the established restricted telemetry
  wildcard warning is present; fixing that unrelated expectation would exceed
  12.1 and risk changing prior phase behavior.
- Do not edit Phase 11 packages, security tests, instrumentation call sites,
  protected v3 documents, or `repos/effect` in this prerequisite unit.

# Task 11.14 Gate 10 decision

- Approve Gate 10. All seven rejection conditions pass using the existing
  model-turn validation, approval enforcement, handler-free tool, common-engine,
  capture-policy, authoring/declaration, and network-free fake-model evidence.
- Keep the focused file-selector tests as the merge-blocking check. The broad
  package-root selector's failure is limited to protected `repos/effect`
  discovery after all ZSYS assertions pass; it is not a ZSYS implementation
  failure and must not trigger vendor dependency changes.
- Do not add a new runtime abstraction or test framework for this evidence-only
  unit. Phase 11 remains untouched; default capture stays off and fake local
  model scripts remain the deterministic test seam.

# Task 11.13 agent evidence

- Reuse the existing 11.10 matrix, 11.8 fake model, 11.9 harness, 11.11
  commerce fixture, and 11.12 scans as Gate 10 evidence; 11.13 adds no new
  runtime abstraction or test framework.
- Treat the exact package-root selector's protected `repos/effect` discovery
  failure as a known non-blocking limitation because every ZSYS assertion is
  green and the explicit file selectors are the network-free merge-blocking
  check. Do not install dependencies in or otherwise modify the vendor tree.
- Record capture as metadata-only by default, with content available only
  through the already tested bounded `development-redacted` policy.

# Task 11.12 agent boundary scans

- Extend the existing public declaration and authoring scanners instead of
  adding a new boundary framework. The declaration scan reuses its
  handler-free check for tools and adds a small AST check for provider or
  credential fields on public agent types; source checks cover vendor model
  names and provider details on `defineAgent` options.
- Keep the `@zsys/testing` public declaration exception narrow: its intentional
  test seams may import internal provider/runtime types, so only the internal
  provider-SDK pattern is skipped for declarations under `packages/testing`.
  All other public declaration leak rules still apply.
- Reuse the 11.11 commerce compiler test for graph and generated-artifact
  evidence. It now asserts handler-free tool nodes, data-only agent nodes, and
  exactly one marked generated-agent function in both graph and manifest.
- Keep these merge-blocking checks network-free and leave 11.13/11.14 to their
  owning units.

# Task 11.11 commerce agent fixture

- Reuse the existing commerce fixture's function/tool/agent descriptors and
  change only their placeholder IDs to the normative `orders.get.tool` and
  `support.order`; adding duplicate tools or handlers would leave two graph
  paths for one acceptance scenario.
- Reuse `@zsys/testing`'s isolated fake-model harness and provide a minimal
  structural engine adapter backed by `invokeFunction(getOrder, ...)`. This
  proves the tool target uses the common engine without adding a second agent
  runtime or a vendor model dependency.
- Assert hierarchy by joining the existing agent/model/tool span records with
  the common-engine function span whose parent is the tool span. Keep raw
  prompt/result checks on the default `capture: off` trace rather than the
  fake provider's intentional request transcript inspection.
- Keep the fixture's existing simple support input/output schemas; this unit
  owns the scripted execution and trace/privacy acceptance, while later scans
  own declaration and source-leak coverage.

# Task 11.10 focused tool/agent matrix

- Keep the matrix in `@zsys/testing` tests so it composes the existing isolated
  fake model and `createTestAgent` contract; use the existing engine package
  only through a test-supplied structural tool engine adapter.
- Preserve declared target error IDs as model-visible safe error codes only
  when they are declared on the target function. Framework `ZSYS_*` codes stay
  visible; arbitrary provider/defect-like codes collapse to
  `ZSYS_TOOL_FAILED`.
- Split the focused matrix into small helper/tool/agent test files because the
  repository verifier applies its 200-line scan to files beneath `packages`,
  including tests. No verifier rule or 11.9 helper was broadened.

# Decisions

# Task 11.9 testing agent harness

- Keep the harness in `@zsys/testing` and require the caller to supply the
  existing structural tool engine; the helper must exercise the same agent and
  tool runtime seams rather than implement a second invocation path.
- Create one fake model provider per `createTestAgent` call. Script updates use
  the 11.8 provider's reset/inspection behavior, so concurrent tests cannot
  consume or observe another test's model turns.
- Represent helper approvals as `approved`, `denied`, or explicit `pending`.
  Pending mode stores only the existing argument-free `PendingApproval` record
  and resolves it through `approve`/`deny`; it does not retain model arguments
  or results.
- Capture existing 11.7 span/edge hooks for assertions and validate parent
  references without adding a second telemetry protocol. The helper's named
  `model.after-tool-call` injection wraps the supplied engine result and lets
  the existing agent loop map it to its safe tool error path.

# Task 11.8 deterministic fake model provider

- Keep the fake at the local-provider boundary and implement the existing
  `@zsys/agents` `ModelProvider` contract directly; no vendor SDK, fetch
  adapter, live model profile, or generation resource is needed for this
  deterministic test seam.
- Normalize every scripted turn with the existing bounded `createModelTurn`
  contract, copy the incoming request without its `AbortSignal` for inspection,
  and reset the cursor/transcript when a new script is installed. An already
  aborted request returns a safe cancelled turn without consuming scripted
  work.
- Expose the provider itself with `script`, `inspect`, `calls`, and `reset` so
  later agent helpers can compose it without a second model abstraction. Keep
  helper orchestration and the complete matrix in checkboxes `11.9` and
  `11.10`.

# Task 11.7 agent/model/tool observability

- Reuse the existing `onSpanStart`, `onSpanComplete`, `onObservedEdge`, and
  versioned `observability.emit` hook vocabulary at the agent boundary. The
  agents package remains independent of `@zsys/engine`; tool requests forward
  hooks and parent metadata structurally to the common engine seam.
- Represent agent, model, and tool spans with safe IDs, parent span IDs,
  logical profile/tool metadata, byte counts, and bounded outcomes. Model spans
  are children of the generated agent span; tool spans are children of the
  model span, and the target engine receives the tool span as its parent.
- Default capture is `off`. `development-redacted` capture requires a positive
  byte bound, merges built-in secret-key protection with caller keys, redacts
  key/value and bearer-token patterns before hook delivery, and returns a
  truncation marker on overflow or non-JSON content. Capture failures cannot
  mask the agent result.
- Emit observed `uses-provider-profile`, `uses-tool`, and
  `targets-function` relationships at the operation boundary. The canonical
  graph remains unchanged; these are runtime observations only.
- Keep fake model/provider, full tool/agent matrix, fixture, inspector query
  models, and later security coverage in their assigned checkboxes (`11.8`–
  `11.14` and Phase 11), with no network model call added here.

# Task 11.6 bounded agent runtime

- Reuse `@zsys/tools` for catalog lookup, allowlist enforcement, argument
  validation, and engine invocation through its structural `ToolEngine` seam;
  do not add an `@zsys/engine` dependency or duplicate tool execution logic.
- Validate descriptor input/output at the runtime boundary and keep model
  messages, turns, tool arguments, and tool results within canonical JSON byte
  bounds. Require the provider's logical profile and cancellation capability to
  match the agent contract before entering the loop.
- Tie every approval to the same invocation and model tool-call IDs. Preserve
  pending approval as an explicit `ApprovalRequiredError` when no handler is
  supplied, while denied/failed tool calls become safe bounded model-visible
  errors.
- Keep prompt/result retention and observability out of this unit; those
  concerns remain owned by later Phase 10/11 checkboxes, especially `11.7`
  and `11.10`.

# Task 11.5 generated agent functions

- Represent each agent's executable identity as one normal function node and
  one normal manifest handler keyed by `zsys.agent.<agentId>.invoke`; retain
  the JSON-safe generated marker on both the agent node and function node.
- Reuse the existing graph/manifest uniqueness checks and function registry so
  generated handlers cannot be missing, duplicated, or executed outside the
  common engine. The generated factory accepts an optional later-bound
  executor; compiler output only creates the marked identity, leaving the
  bounded model/tool loop to checkbox `11.6`.
- Keep the generated ID formula duplicated only at the compiler/package
  boundary needed to avoid a compiler-to-agent dependency; both sides derive
  it from the same normalized stable ID and source paths never participate.

# Task 11.4 model-provider contracts

- Keep the agent/provider boundary vendor-neutral: an agent request carries a
  normalized logical profile, JSON-safe conversation/tool metadata, an explicit
  output byte bound, and optional cancellation; a provider returns only a
  discriminated tool-call/final/error/cancelled turn.
- Use the existing canonical JSON serializer to measure input and output bytes,
  then clone and freeze accepted content. This gives later runtime and fake
  providers one bounded content contract without importing schema, SDK, client,
  or credential types into `@zsys/agents`.
- Represent capability metadata with tool-call/cancellation support and finite
  input/output byte limits. Provider implementations remain responsible for
  mapping those logical fields to their concrete model API; loop behavior,
  approval integration, telemetry, and scripted providers remain owned by
  checkboxes `11.5`–`11.14`.

# Task 11.3 approval state

- Model one tool-call approval as an immutable, argument-free record containing
  only normalized invocation/tool-call/tool IDs, side-effect classification,
  policy, whether approval is required, and its `pending`/`approved`/`denied`
  state. The record is therefore safe to pass to later telemetry and inspector
  code without copying model arguments or tool results.
- Interpret `never` as no approval gate, `on-write` as a gate for `write` and
  `external`, and `always` as a gate for all four classifications. Calls that
  do not require approval start `approved` by policy; required calls start
  `pending` and can transition only once to `approved` or `denied`.
- Keep the approval module independent of `@zsys/engine`; it reuses the
  existing stable-ID contract and tool policy/classification types. Broader
  model-loop, fake-provider, inspector, and approval-matrix coverage remains
  owned by checkboxes `11.4`–`11.14`, especially `11.10`.

# Task 11.2 tool runtime

- Keep the runtime package-independent from `@zsys/engine`: a structural
  `ToolEngine` seam avoids the existing `engine -> app -> tools` dependency cycle
  and still requires every target call to use `engine.invoke` with `source: "tool"`.
- Resolve the immutable target function reference already copied by `defineTool`
  rather than reintroducing a handler. Forward its input/output schemas and
  declared error descriptors to the engine; the engine remains responsible for
  final output/error normalization and the target's effective deadline.
- Treat the tool catalog as the unknown-tool boundary and the optional allowed
  tool list as the agent allowlist. Parse model JSON text, validate arguments
  before engine work, and pass the original parsed input so engine transforms and
  defaults retain their existing semantics.
- Keep approval policy out of this unit; checkbox `11.3` owns approval state and
  enforcement. Keep durable runtime tests out of this unit; checkbox `11.10`
  owns the full tool/agent test matrix, so validation used focused executable
  self-checks only.

# Task 11.1 Gate 5/7/9 prerequisite verification

- Reuse the approved Gate 5, Gate 7, and Gate 9 reviews at checkboxes `6.14`,
  `8.15`, and `10.16`; this prerequisite unit needs current reproduction
  evidence, not a second gate harness or implementation.
- Treat the existing event contract/restart command, public type fixtures,
  engine/testing suite, provider contract suite, event source/export scan, and
  commerce compiler fixture as the relevant pre-agent coverage. Their current
  runs pass without changing the agent/tool/runtime owners.
- Preserve the exact missing `tests/integration/events` path note from Gate 9:
  Bun accepts the selector and runs the existing event contract/restart files,
  but the repository has no separate file at that path.
- Keep the nine `bun run verify` later-suite placeholders explicit; they are
  owned by later phases and are not evidence for 11.1.

# Task 10.16 Gate 9 evidence and rejection review

- Keep checkbox `10.16` evidence-only. The completed 10.11–10.15 contract,
  recovery, fixture, and source/export work already supplies the required
  selector, fan-out, correlation, restart, duplicate, dead-letter, and scope
  evidence; a second implementation or duplicate harness would add no signal.
- Treat the compiler's sorted `eventId@version` expansion as the sole routing
  authority. The local router may retain selector metadata for inspection but
  must not evaluate patterns at delivery time.
- Treat durable acknowledgement as a post-handler transition. The named
  acknowledgement-gap boundary and child-process duplicate proof are the
  evidence for at-least-once behavior; capability metadata explicitly keeps
  `exactlyOnce` false and ordering unsupported.
- Preserve the intentionally uncommitted normal checkout and do not stage or
  commit. This worker's requested scope is the evidence/rejection review and
  the current shared-checkout workflow; no commit or PR authority was supplied.

# Task 10.15 Gate 9 event evidence

- Keep this unit evidence-only. The 10.11 contract suite, 10.12 child-process
  recovery suite, 10.13 commerce compiler assertions, and 10.14 source/export
  scan already cover the requested selector, fan-out, envelope, restart, and
  scope behavior; adding a duplicate integration harness would add no signal.
- Record the exact Bun result honestly: the requested `tests/integration/events`
  selector has no dedicated matching file in the current checkout, while the
  command still exits successfully after running the existing contract and
  restart event suites.
- Treat the compiler graph hash and selector/edge projection as the Gate 9
  selector golden snapshot rather than adding a second checked-in artifact.

# Task 10.14 event terminology scans

- Extend the existing `packages/events/source-export.test.ts` guard rather
  than adding a scanner package or runtime hook. Its repository roots already
  cover public/application source, generated `dist`/fixture JSON, graph/API
  contracts, and inspector sources; optional `.zsys/generated` and `.zsys/build`
  roots are included when present.
- Match the application concept as a family (`defineSubscription`, singular
  or plural names, and `Subscription*`/`subscription*` kind/package/navigation
  forms) while keeping the `.subscription.ts` filename rejection unconditional.
- Keep the allowlist path-based and narrow to provider implementations and
  provider-internal event test fixtures. Public exports, application code,
  generated artifacts, graph/API contracts, and inspector terminology remain
  clean.

# Task 10.13 commerce event fixture

- Keep the existing `orders.created` durable receipt trigger as the single-event envelope example, then add `orders.updated` and `orders.cancelled` so the fixture exercises both a sorted `anyOf` expansion and the equivalent `orders.*` pattern expansion against three known event/version pairs.
- Use separate `orders.project-change` and `orders.audit-change` functions with the same discriminated envelope schema. This keeps each trigger target explicit while the compiler verifies the full event envelope rather than a payload-only shortcut.
- Model raw telemetry as `events.all({ payload: "unknown", purpose: "telemetry" })` with ephemeral delivery and a telemetry tag. The compiler warning is expected policy evidence; the selector has no runtime expansion and remains restricted to the telemetry target.
- Represent the telemetry payload as a required JSON-value union because the current `z.unknown()` inference makes an object field optional. It retains raw JSON payload coverage while allowing the fixture's strict `UnknownEventEnvelope` type assertion to prove the target boundary.
- Reuse the existing fixture compiler acceptance test and authoring assertion module rather than adding another harness. The new assertions cover descriptor uniqueness, trigger count/IDs, exact expansion/edge projections, the telemetry warning, and any-of/pattern/raw envelope assignability.

# Task 10.12 event child-process recovery coverage

- Reuse `@zsys/testing`'s event fake and caller-owned state root so the child
  tests exercise the existing event log, durable delivery ledger, lease
  recovery, engine target path, and ephemeral memory-only path without adding
  a second restart harness or provider implementation.
- Model durable process loss inside the target after the lease is acquired,
  and model the acknowledgement gap with the existing named
  `event.after-handler-success-before-ack` boundary before sending `SIGKILL`.
  This keeps the tests aligned with the documented at-least-once contract and
  makes the duplicate observable through attempt `2`.
- Treat an accepted ephemeral event log record as distinct from delivery
  recovery: after restart the envelope remains inspectable, but zero delivery
  state, pending work, or completion is the expected honest capability.
- Keep fan-out isolation in the same child-process suite with a one-attempt
  failing listener and a successful sibling; assert the failure dead-letters
  independently instead of relying only on the existing in-process router
  regression.

# Task 10.11 event provider contract coverage

- Reuse the existing compiler normalization, graph compatibility diff, event
  router, durable delivery adapter, and deterministic testing fake. A
  reusable contract suite plus one local testing-provider adapter gives the
  required provider coverage without another event implementation or state
  format.
- Keep capability claims explicit: ephemeral delivery reports no persistence
  and no restart recovery; durable delivery reports restart recovery and
  at-least-once behavior, with `exactlyOnce: false` and per-key ordering
  unsupported. The suite asserts unsupported behavior as metadata rather than
  inventing an ordering guarantee.
- Model ephemeral loss by stopping an in-flight delivery and reopening the
  same state root, then assert no durable pending work or delivery ledger is
  recovered. The accepted publication log remains separate from listener
  delivery state.
- Use a declared retryable test error only in the adapter so durable retry
  tests exercise the existing engine failure classification and queue retry
  machinery. Fatal listener errors remain independent dead letters.
- Assert the forbidden graph kind through a dynamically constructed probe so
  the contract test itself continues to pass the repository scope scanner.

# Task 10.10 deterministic event testing harness

- Build the fake on the reviewed event client, accepted event log, event
  materializer, explicit-expansion router, ephemeral limiter, and durable
  adapter. Add only `route(..., { run: false })`, durable `accept`, and router
  `runNext`/`drain` seams so admission and execution can be asserted separately;
  preserve the existing immediate `route()` behavior for all prior callers.
- Make publication identity and time local to the fake: event instances are
  `test-event-<eventId>-<n>`, traces are `test-trace-<n>`, and timestamps come
  from the deterministic test clock. Reopen the same state root with a new
  owner generation so durable leases and acknowledgement-gap duplicates remain
  observable without sleeps.
- Persist and expose the full accepted envelope before fan-out. Treat
  `attempts` as actual delivery execution results (not admission observations),
  and expose the current durable ledger separately through `deliveries`; this
  keeps attempt numbers and duplicate recovery assertions unambiguous.
- Inject named boundaries after persistence, after fan-out, after handler
  success/before acknowledgement, and after acknowledgement. The harness
  routes all listener work through `materializeEvents` and the common event
  invocation engine; no direct handler bypass, subscription abstraction, or
  10.11+ contract suite is introduced.
- Split the implementation behind `events.ts` into focused runtime/type files
  only to keep each implementation file within the repository's 200-line
  limit.

# Task 10.9 event inspector contracts and safe retry

- Keep the event schema `version` distinct from the inspector protocol
  version. Event, publication, delivery, and dead-letter projections retain
  their event version and expose `protocolVersion`; query and admin envelopes
  reuse the reviewed `protocol`/`version` shape.
- Reuse the completed router snapshot, event log, durable delivery adapter,
  queue retry transition, and job-admin gating/audit pattern. The query layer
  projects safe publication metadata without payloads and exposes compiled
  selector expansions plus explicit capability flags.
- Permit only a validated local/test retry of an existing dead-letter delivery.
  Production mutations stay disabled, every attempt records an action, and
  retry preserves the existing delivery ID, cursor, lease, and duplicate
  semantics. No new application resource or runtime routing abstraction is
  introduced.

# Task 10.8 durable event delivery

- Reuse one existing job store and queue per durable trigger under
  `triggers/<id>`. Queue records are the fan-out ledger, and the store
  checkpoint sequence is the durable cursor; no second ledger or subscription
  abstraction is needed.
- Admit each delivery as accepted-to-available before invocation. Acquire a
  lease before running it, recover expired leases on restart, and transition to
  completed only after handler success and the explicit acknowledgement
  boundary. Apply the existing deterministic retry/delay/dead-letter and safe
  failure machinery for handler errors.
- Reserve a per-trigger active slot with a configurable limit and no hidden
  backlog. Expose retries and acknowledgement-gap duplicates through the
  delivery result and attempt count. Declare at-least-once delivery,
  `exactlyOnce: false`, and `ordering: "unsupported"` with
  `orderedByKey: false`; the adapter makes no false per-key ordering claim.
- Keep the 10.6 explicit-expansion router and 10.7 ephemeral limiter intact.
  Read legacy accepted records during upgrade, use the materializer's engine
  binding, and do not add a subscription concept.

# Task 10.7 bounded ephemeral event delivery

- Define ephemeral capacity as the maximum simultaneous in-process deliveries
  per trigger. Use a configurable default of 100 and no hidden queue; when the
  cap is full, drop the newest event immediately so memory and latency remain
  bounded and loss is observable rather than deferred.
- Report overflow as data, not an unhandled rejection: `accepted: false`,
  `persisted: false`, `status: "dropped"`, `dropReason: "capacity"`, the active
  capacity/drop policy, and `restartRecovery: false`. Safe snapshots contain
  counters only and state `persistence: "none"`; no envelope or result is
  retained after completion.
- Reuse the completed explicit-expansion router and its materializer-supplied
  engine invocation function. Keep durable records, leases, retries,
  dead-lettering, ordering, and restart recovery in checkbox `10.8`; add no
  subscription concept.
- Move the unchanged durable acceptance append into `router-records.ts` only
  to preserve the repository's 200-line implementation limit after wiring the
  limiter. Durable persistence-before-invocation behavior remains unchanged.

# Task 10.6 local event router

- Treat the compiler-provided sorted ID/version expansion as the sole runtime
  routing authority. The router compares one canonical `eventId@version` pair
  and does not re-evaluate source selector patterns.
- Give each durable trigger its own job-style store under the router root.
  This keeps a persistence or acknowledgement-boundary failure local to that
  trigger while sibling fan-out branches continue independently; the later
  delivery ledger/lease unit can add shared recovery semantics without
  changing this boundary.
- Persist the durable delivery record before invoking its target. Collect
  persistence and handler failures per branch and expose them in the fan-out
  result; accepted sibling records are never rolled back. Retry, leases,
  dead-lettering, and bounded ephemeral delivery remain later checkbox scope.
- Keep registration structurally compatible with the event materializer and
  use deterministic clock/boundary seams already provided by the local job
  store. Do not add a public subscription or selector registry abstraction.

# Task 10.5 local durable event log

- Reuse `createJobStore` for event persistence instead of creating a second
  append/checkpoint implementation. Event records use the existing versioned
  record envelope with `kind: "accepted"` and store the complete event
  envelope as canonical JSON; the event-log adapter exposes `accepted: true`
  and the typed envelope to later router/delivery units.
- Add one optional `validateData` callback to the existing job store recovery
  seam. Job behavior is unchanged when it is omitted, while event startup can
  quarantine semantically malformed envelopes through the same atomic repair
  path as malformed JSON, indexes, and checkpoints.
- Treat the record fsync as the publication acknowledgement boundary. An
  append that fails after fsync is rejected but remains recoverable, preserving
  the documented durable at-least-once acknowledgement-gap semantics; no
  router, delivery lease, ephemeral queue, or subscription concept belongs to
  this checkbox.
- Validate stable event/instance IDs, positive event versions, required times,
  trace/attributes, optional correlation/causation/key fields, and JSON-safe
  payloads before append. Preserve event version and correlation metadata
  exactly for the later explicit-expansion router.

## Task 10.4 event contract and trigger materialization

- Carry graph event nodes through an optional `RegistrationPlan.events` seam so
  older hand-built plans remain compatible while generated plans expose event
  contracts to the materializer.
- Validate all listener targets from the graph function registrations before
  resolving providers or registering anything. Resolve provider profiles first,
  then register contracts and explicit compiler expansions in deterministic plan
  order; do not add provider persistence, fanout, lease, retry, or subscription
  behavior.
- Bind each listener through `engine.invoke` with `source: "event"`, the full
  event envelope as input, and the envelope correlation/causation/trace values
  plus caller deadline and cancellation signal. The root `check` command now
  targets the checked-in boundary script rather than the missing `scripts/check.ts`.

## Task 10.3 event selector compiler/type fixtures

- Keep the existing `EventEnvelope` field contract as the single-event target
  shape and express any-of/match targets as a JSON Schema `anyOf` of variants
  with literal event ID/version discriminators. The compiler checks each
  stored expansion pair against a matching variant and its payload schema,
  while retaining the earlier payload-only compatibility used by existing
  fixtures.
- Reuse `NormalizationWork.selectorExpansions` and the graph projection for
  `match`; do not re-match patterns at runtime or add a second expansion
  representation. Restricted raw-all remains non-expanding, uses the public
  unknown envelope type, and emits the existing purpose warning.
- Keep the implementation limited to compiler compatibility and public type /
  semantic fixtures. No subscription API, event materializer, provider log,
  delivery state, restart path, or commerce fixture change belongs to this
  checkbox.

## Task 10.2 typed event publication client

- Keep the canonical publish result shape in the shared functions client
  types so `FunctionContext.events` stays dependency-safe; expose the public
  `EventEnvelope` from `@zsys/events` by deriving it from that result without
  creating a second field definition or an app-barrel export collision.
- Make the event client the single trust-boundary path for payload validation,
  option/attribute normalization, versioned envelope assembly, and edge
  observation. Providers receive only validated payloads and normalized options;
  the engine supplies the invocation bridge, active clock, correlation,
  causation invocation ID, and trace ID.
- Require explicit client event versions, preserve descriptor versions through
  dependency construction, and keep the fallback version only for existing
  loose runtime test doubles that do not carry a typed event declaration.
- Reuse the existing engine bridge and durable job-era timing/error patterns;
  do not duplicate event persistence, lease, retry, materialization, or
  delivery behavior in this client unit. Keep the no-subscription decision.

## Task 10.1 Gate 8 prerequisite verification

- Treat `10.1` as an evidence-only prerequisite unit. The recorded local
  Gate 5, Gate 7, and Gate 8 approvals are sufficient, and the exact Gate 8
  reproduction was rerun unchanged before any event work.
- Reuse the reviewed durable record, lease, retry, deterministic-clock, and
  restart seams for the event phase; do not duplicate their implementations
  or add an event seam in this verification unit.
- Keep the normal uncommitted checkout visible and preserve the user-owned
  files and vendor paths named in the worker prompt. The next implementation
  unit is `10.2`.

## Task 9.16 Gate 8 evidence and rejection review

- Approve Gate 8 from the exact 9.15 contract/integration/restart command plus
  the focused supporting store, queue, retry, scheduler, admin, materializer,
  and deterministic-harness tests. The task is evidence-only; no new runtime
  seam or duplicate test implementation is justified.
- Treat persistence-before-ack and completion-after-engine-success as
  separate boundaries. The store fsync test, queue append-ack test, and
  materializer source/transition assertions cover both without conflating
  durable acceptance with in-memory availability.
- Use the versioned admin query/status contract as the Gate 8 state-consumer
  evidence. Inspector UI work is later; the API must already agree with queue
  and restart-visible state and must remain redacted.
- Preserve the at-least-once contract and explicit `exactlyOnce: false` test
  capability. The acknowledgement-gap duplicate is required evidence, not a
  defect to hide with an exactly-once claim.
- Keep the normal uncommitted checkout visible per the worker contract; this
  local gate packet does not create Git publication state.

## Task 9.15 Gate 8 job evidence

- Treat checkbox `9.15` as evidence-only: the existing contract,
  integration, and restart suites already exercise the required durable queue,
  engine, scheduler, idempotency, concurrency, restart, and quarantine seams.
  No implementation or test seam was needed.
- Record exact deterministic observations from the passing assertions: retry
  becomes available at `125` from time `100`, lease expiry at `10` recovers to
  `available`, acknowledgement gaps expose attempts `[1, 2]`, idempotency
  expires at `110` and accepts a new instance at that boundary, concurrency is
  limited to one active function, and one malformed record is quarantined while
  valid work remains runnable.
- Keep Gate 8 approval/rejection and its rejection matrix in checkbox `9.16`;
  this unit only captures reproducible evidence and advances `9.15`.

## Task 9.14 commerce receipt job and schedule integration

- Reuse the commerce fixture's completed receipt job and schedule descriptors,
  compiler graph, and registration plan. The test should prove their edges and
  materialization rather than add a second fixture definition.
- Expose the existing admin protocol and invocation hooks through the
  deterministic testing fake as the minimum read-only inspection seams needed
  for integration assertions; leave production queue transitions and engine
  behavior unchanged.
- Drive the schedule and restart with injected time and a caller-owned state
  root. Read logs and spans from the existing engine hooks so the test remains
  deterministic and uses no wall-clock sleep.

## Task 9.13 child-process job restart tests

- Use one small Bun worker entrypoint for both crash points so the tests share
  the public deterministic job harness rather than reproducing queue or
  materializer setup.
- Let the worker send itself `SIGKILL` only after the harness has persisted the
  lease, or after the handler has returned and the acknowledgement seam has
  rejected. This models process loss at the exact existing failure controls
  without adding a runtime export or test-only production branch.
- Restart with the same unique caller-owned root at deterministic time `10`
  after a `10` millisecond lease. Compare the pre-crash append-log records as
  an exact prefix and record handler attempts in a root-local NDJSON file so
  the tests can distinguish lease recovery from the expected acknowledgement
  gap duplicate.

## Task 9.12 shared job contract tests

- Use one reusable `registerJobContractSuite` with a thin deterministic
  `@zsys/testing` adapter. The harness already composes the public job client,
  materializer, local queue, and durable store, so a second queue/provider test
  implementation would only duplicate behavior.
- Keep capability metadata explicit and honest: durability, at-least-once
  delivery, restart recovery, idempotency, scheduling, concurrency,
  quarantine, and cancellation are true; `exactlyOnce` is explicitly false.
- Drive retries, lease expiry, idempotency expiry, schedules, and restart with
  injected timestamps and named failure controls. The overlap assertions use
  promise gates, and malformed state is appended only under the harness-owned
  temporary root; no arbitrary sleeps or runtime seams are added.
- Test cancellation at the public enqueue boundary with an abort-aware provider
  wrapper. It proves validation/acceptance does not create work while leaving
  administrative cancel behavior owned by the completed 9.10 seam.

## Task 9.11 deterministic job harness

- Keep the testing fake as a thin one-job wrapper around the existing typed
  client, provider-neutral materializer, local queue, and append-only store.
  This exercises the production path without introducing a second queue or
  state format.
- Validate enqueue input through `createJobClient`, then promote the durable
  accepted record to `available` so a test can run it immediately. Promote
  delayed records only when the injected clock says they are due; no wall-clock
  sleeps are used.
- Check `job.after-lease` before invoking the handler and
  `job.after-handler-success-before-ack` before the completed transition. A
  restart therefore retains the leased record for normal expiry recovery and
  permits the specified at-least-once duplicate.
- Use the existing deterministic clock, injectable random values, process-like
  owner tokens, and stable synthetic instance IDs. Restart closes and reopens
  the same state root; temporary roots retain the existing cleanup behavior.
- Export only the existing job-store constructor/types needed to compose the
  fake. Do not widen normal queue transitions or implement the later shared
  contracts, child-process tests, or fixture work.

## Task 9.10 local job administration

- Use one versioned `zsys.jobs.admin` contract family at the shared protocol
  version. Status/query payloads expose state, timing, attempts, counts, and
  safe failure metadata, but never raw input, lease ownership, or idempotency
  keys; cursor paging uses the queue's deterministic acceptance order.
- Keep `createJobAdmin` as a thin inspector seam over the completed queue. The
  default development/test modes may mutate, production remains disabled even
  when the generic enabled flag is true, and retry accepts only dead-lettered
  jobs. Cancel/dead-letter accept only nonterminal jobs and retain explicit
  safe failure metadata.
- Preserve the normal worker state graph. Retry and administrative
  dead-lettering use a serialized, store-backed queue-admin seam that recovers
  eligible leases before applying the requested durable state update.
- Record both applied and rejected actions locally and through an optional
  sink. A sink failure cannot erase the local audit record or change the job
  action result. No second audit store or inspector transport was introduced
  before its owning checkbox.

## Task 9.9 job materialization boundary

- Keep `materializeJobs` provider-neutral: it accepts already-created queue
  handles or a queue factory invoked after the plan's function/resource phase,
  then reuses the local queue's `ready`, lease, transition, retry, and
  idempotency seams. No second queue/store/schedule format was introduced.
- Use one generation-local `ConcurrencyAdmission` and calculate the effective
  limit as the minimum of function, job, and consumer limits. Pass the limit
  through `engine.invoke` as `triggerLimit` and through the existing admission
  callback so the common engine remains the execution boundary.
- Treat queue acknowledgement as a durable state transition: a successful
  invocation must complete the leased entry with `expectedState: "leased"`;
  an error must first pass through `applyRetry`, classification, and safe
  metadata before delayed/dead-lettered state is returned. Completion-transition
  failures are not misclassified as handler failures.
- Adapt registration-plan composite schedule IDs containing `:` to stable
  dotted IDs only in `scheduleDefinition`; this bridges the existing plan and
  completed scheduler contracts without modifying either prior scheduler or
  graph behavior.
- Keep the implementation split below the 200-line limit and add only one
  focused materializer test file. Admin/query mutation, testing harness,
  restart coverage, and fixture work remain in later checkboxes.

## Task 9.8 scheduler boundary and overlap behavior

- Keep schedule compilation and runtime scheduling in
  `packages/providers-local/src/jobs/scheduler.ts`, reusing the already pinned
  `nextCronFire` adapter; require exactly five normalized cron fields and let
  the adapter validate the IANA timezone before registration succeeds.
- Canonicalize and deep-freeze static input at compilation so every scheduled
  emission reuses JSON-safe immutable data. Reject missing input, invalid JSON,
  duplicate schedule IDs, invalid dates, and unsupported overlap values before
  a schedule enters the scheduler.
- Inject either a `clock.now()` source or a `now()` function returning a Date or
  millisecond number. `runDue` advances each schedule's next fire before
  dispatching it, which avoids re-emitting a fire when an enqueue path fails or
  a clock jumps forward.
- Define the output seam as `ScheduleEnqueue(input, context)` rather than a
  handler callback. The scheduler tracks pending enqueue/invocation promises
  for `skip`; `allow` admits another fire while one is pending. Engine binding,
  queue consumption, and handler invocation remain checkbox `9.9` scope.
- Do not add a second durable schedule log or modify the completed queue,
  retry, or idempotency record format. The scheduler is clock-driven and
  in-memory; the existing store-injected queue remains the persistence
  boundary for future materialization.

## Task 9.7 idempotency retention and duplicate acceptance

- Store the validated extracted idempotency key and absolute expiry on the
  accepted queue entry. This reuses the existing append-only, store-injected
  queue record and restart recovery seam instead of adding a second persistence
  format or provider-owned file.
- Extract only a non-empty string from the configured input object field,
  normalize surrounding whitespace, require positive safe-integer retention,
  and reject invalid input before the accepted record is durably appended.
- Serialize enqueue admission so an active key returns the original instance
  with `duplicate`, key, and expiry metadata without appending another job.
  Expired records are ignored at admission, allowing a new instance while the
  old durable history remains recoverable.
- Extend the existing public enqueue result with optional duplicate/key/expiry
  fields. No scheduler, engine materialization, admin API, testing harness,
  restart suite, or fixture job was wired early; delivery remains at-least-once.

## Task 9.6 retry policy and dead-letter metadata

- Reuse the existing runtime failure normalizer and public failure envelope so
  only declared application failures marked `retry: "later"` are retryable;
  provider, cancellation, timeout, defect, and declared `retry: "never"`
  failures dead-letter without inventing a second failure taxonomy.
- Treat `attempt` as the one-based attempt that just failed. Retry while it is
  below `maxAttempts`, compute `initialDelayMs * multiplier ** (attempt - 1)`,
  cap before jitter, and support the declared `none`, `full`, and `equal`
  jitter modes through an injected `[0, 1)` random source.
- Apply the result through the existing store-backed queue transition with an
  expected `leased` state. Delayed and dead-lettered entries retain only
  canonical public failure metadata; raw causes and stacks never cross the
  durable record boundary.
- Keep retry execution separate from idempotency, scheduling, engine
  materialization, admin controls, and test/restart harnesses owned by later
  checkboxes.

## Task 9.5 lease ownership and startup recovery

- Generate one process owner token per queue instance, with an explicit option
  for deterministic tests; persist it as `leaseOwner` and require the active
  queue owner for renewal and leased-state transitions.
- Use a 30-second default lease duration while accepting an explicit absolute
  expiry or duration. Every lease operation reads the injected `now` clock;
  no wall-clock timer or sleep is introduced.
- Start recovery when the queue is created and expose `ready()` so accepted
  records and expired leases are durably appended as `available` before a
  restarted worker claims work. Recovery clears lease ownership and never
  creates a new state.
- Keep the queue store-injected and serialize lease/recovery mutations through
  the existing queue tail; publish each in-memory entry only after the store
  append acknowledges.

## Task 9.4 durable queue state machine

- Keep the queue store-injected and separate from local provider generation;
  lifecycle construction currently owns only bucket/cache roots, while later
  job materialization can pass the existing `<stateRoot>/jobs` store.
- Persist the complete job snapshot in every state-named store record. The
  store's append sequence remains the durability boundary, while the queue's
  persisted acceptance `order` gives FIFO-like deterministic selection without
  deriving identity from time or source paths.
- Allow only the state-machine edges from the v3 model: accepted to available,
  available to leased, leased to available/delayed/completed/dead-lettered,
  and delayed to available. Terminal states do not transition in this unit.
- Treat accepted work and expired leases as recovery candidates and return
  both to `available`; leave delayed timing/promotion to retry task 9.6 and do
  not add a `recovered` state.
- Serialize queue mutations independently of the store's write tail and update
  the in-memory map only after `store.append` resolves. This keeps a failed
  acknowledgement from publishing a partial queue transition while allowing
  the durable log to recover it on restart.

## Task 9.3 durable job store

- Pass the existing provider-owned state root plus `jobs` from later local
  provider wiring instead of changing the Phase 7 lifecycle surface in this
  store-only unit. The store creates and owns its exact directory and does not
  expose raw files through the public provider index.
- Use one canonical `records.ndjson` append log as recovery truth. Each record
  carries version `1`, a monotonic sequence, instance ID, kind, timestamp, and
  JSON-safe data; `index.json` records the latest instance offset and
  `checkpoint.json` records the committed sequence/offset/count.
- Make each append durable before acknowledgement: fsync the log, fsync each
  temporary metadata file, rename it into place, and fsync its directory. The
  index and checkpoint share a commit sequence; startup treats a mismatch as a
  recoverable torn pair and rebuilds both from the append log.
- Quarantine a malformed log as one forensic source file, rewrite only valid
  records to a fresh log, and quarantine malformed metadata files individually.
  This preserves valid history without pretending a malformed record is safe.
- Serialize writes with one store-wide Promise tail because Phase 8 local job
  state is a single bounded POC store; sharding is deferred until measured
  multi-writer throughput requires it.

## Task 9.2 job Promise client

- Keep the public enqueue/status types in the existing functions client
  contract and re-export them from `@zsys/jobs`; this preserves the existing
  typed `FunctionContext.jobs` surface without duplicating public types.
- Resolve only logical profiles at the client boundary: a direct provider,
  profile map, provider handle, or explicit resolver can supply the selected
  profile, while provider/runtime details remain outside public declarations.
- Emit the engine's declared edge once during dependency construction and an
  observed edge per enqueue; direct job-client callers can use the equivalent
  hooks without importing the engine.
- Keep provider work inside the supplied invocation bridge and pass the active
  signal, deadline, and correlation ID through both bridge metadata and the
  provider context. Validation runs before provider work.
- Preserve the existing inert engine fixture providers by normalizing a
  provider response without acceptance metadata to a local accepted envelope.
  This is only a compatibility shell for the Promise client; durable
  persistence, strict acceptance ordering, and durable status transitions
  remain owned by checkbox `9.3` and later job units.

## Task 9.1 cron parser adapter

- Own the parser in `@zsys/providers-local`, matching the normative Phase 8
  ownership of `packages/providers-local/src/jobs/scheduler.ts`; keep the
  public `@zsys/jobs` descriptor package free of runtime dependencies.
- Pin `cron-parser@5.10.0` exactly. It is the selected parser for this phase;
  its vendor API and `luxon` dependency stay behind the internal adapter.
- Keep `packages/providers-local/src/jobs/cron.ts` outside the package export
  map and expose only `nextCronFire(expression, { timezone, currentDate })`,
  which returns a native `Date`. This keeps vendor classes/types out of the
  public declaration boundary.
- Normalize v3's five-field cron syntax by prepending a zero seconds field
  before strict parser validation. No schedule materialization or next-fire
  runtime was added; checkbox `9.8` owns that behavior.

## Task 8.15 Gate 7 evidence and rejection review

- Approve Gate 7 from the direct `8.14` reproduction results plus retained
  `8.13` graph-safety evidence; this unit assembles/reviews evidence and does
  not redo provider or fixture implementation.
- Treat local/test provider differences as explicit capability metadata: local
  pagination/eviction and test-fake failure injection are target-specific,
  while signed URLs and unsupported increment remain explicit failures.
- Use the registry requirement map and generation-scoped factory result as the
  provider-ownership evidence: logical profiles share a capability provider
  within one generation, and functions receive declared clients rather than
  constructing providers.
- Use injected clocks and explicit `advance` calls as the TTL evidence; no
  real-time sleep or timing heuristic is accepted for this gate.
- Preserve the intentionally uncommitted normal checkout and the protected
  files/vendor per the user-scoped worker contract; this local evidence review
  does not create Git publication state.

## Task 8.14 Gate 7 evidence

- Treat the reusable contract suites as the capability matrix source: local
  providers and test fakes each prove shared behavior, while pagination,
  eviction, and named failure injection remain explicit target-specific
  capabilities rather than silently skipped cases.
- Record startup/release order from the existing generation service seams and
  retain the prior 8.13 graph-safety scan as evidence because 8.14 is a
  verification unit and must not independently redo 8.13's compiler fixture
  work.
- Use the exact integration test's caller-owned state root and deterministic
  clock evidence for restart/cache-time claims; no new sleeps, fixtures, or
  provider implementation are needed.

## Task 8.13 commerce resource fixture

- Reuse the existing `assets` and `prices` logical descriptors rather than
  adding provider-specific fields; `receipts.send` owns bucket writes and
  `orders.create` owns cache reads, matching the function-only and declared
  dependency contracts.
- Exercise restart behavior through `bindLocalProviderFactory` with a
  caller-owned `stateRoot`, using real local bucket/cache providers and small
  inert event/job sources only for the fixture function's already-declared
  neighboring dependencies. This avoids adding a Phase 8 jobs/events runtime
  to a Phase 7 task.
- Keep descriptor safety assertions scoped to bucket/cache projections, where
  the logical resource contract forbids filesystem/vendor details; global app
  provider configuration remains the approved place for concrete runtime
  selection.

## Task 8.12 provider and generation integration tests

- Keep the integration coverage in one new engine test module and use a
  recording provider factory so active environment/profile selection and
  generation-scoped construction are observable without creating filesystem
  state or duplicating local provider behavior.
- Resolve the environment through `createGenerationRuntime` with an explicit
  source, then pass its frozen values to the provider registry. This exercises
  value resolution and runtime-only factory input while keeping graph data
  logical and value-free.
- Use `GenerationServiceDefinition` acquisition/release seams for the two
  required named runtime failure points. This keeps failure injection test
  local until a later harness task owns a public runtime failure-control API.
- Prove declared/observed separation with a real typed cache dependency through
  `createTestRuntime`; compare the canonical graph hash before and after both
  successful declared operations and forged undeclared access.

## Task 8.11 reusable bucket/cache contract suites

- Build the suites as target-agnostic registration modules and keep provider
  construction in thin local/fake runners. This makes future providers reuse
  the same behavior matrix while keeping test-only setup out of provider code.
- Route the suite through `createBucketClient` and `createCacheClient` so
  validation, capability checks, and provider operation boundaries are tested
  exactly as application code uses them.
- Declare feature differences on each target: local provides pagination and
  LRU eviction, while the 8.10 fakes provide named write-failure injection.
  The common suite still exercises all shared operations on both targets and
  does not silently treat an absent capability as success.
- Fix the local bucket overload at its boundary: public client calls pass a
  `BucketOperationContext` as the second `list` argument, so the provider must
  identify that context before treating the argument as pagination options.

## Task 8.10 testing bucket/cache fakes

- Put the fakes behind `createBucketClient` and `createCacheClient`; seed and
  read therefore exercise the public validation, policy, cancellation, and
  capability path instead of introducing a test-only client contract.
- Keep bucket state in an in-memory map with copied bytes and metadata, and
  cache state in canonical JSON-keyed entries with cloned values, deterministic
  expiry, and per-key single-flight. Inspectors expose only test-safe snapshots
  and never become provider file readers.
- Reuse the runtime's injected clock and state root. Direct fakes create a
  unique temporary root; runtime-created fakes use distinct bucket/cache
  subroots beneath the runtime root and clean up idempotently.
- Keep persistent failure controls and add one-shot controls for the three
  named boundaries. `bucket.after-write-before-ack` throws after visibility is
  committed, while the other two points fail before mutation.

## Task 8.9 local provider lifecycle and state ownership

- Resolve one provider-owned state root per local generation from the explicit
  runtime override, the declared `stateDirectory`, or
  `process.cwd()/.zsys/state`; create only the `buckets` and `cache` profile
  subtrees needed by the selected local provider set.
- Keep the generic generation capability map pointed at the default bucket and
  cache profiles while retaining named profile providers in factory-owned
  maps. This preserves the existing engine contract without exposing storage
  internals to application code.
- Treat bucket envelopes and cache snapshots as internal versioned records:
  validate metadata, canonical keys, sizes, counters, and content hashes on
  recovery, quarantine malformed state, and use atomic temporary-file renames
  for writes.
- Use restart-recovery capabilities only for factory-created cache profiles;
  independently constructed caches remain the 8.8 generation-local,
  memory-only provider. Keep snapshot callbacks metadata-only.
- Run provider readiness during generation startup, release cache before
  bucket resources, and make release/dispose idempotent. Do not add public raw
  file-read or file-mutation APIs.

## Task 8.8 local cache provider

- Keep the concrete local cache instance generation-scoped and parameterized by
  one logical cache ID plus schema version; namespace keys with the shared
  canonical JSON serializer so insertion order cannot change identity.
- Use LRU eviction with independently validated maximum entry and byte bounds.
  Count canonical key/value UTF-8 bytes, reject an entry larger than the byte
  bound, and use a linear oldest-entry scan because the local POC bounds are
  small and the ceiling is documented in code.
- Inject `clock`/`now` for expiry and deadline checks. Treat an entry as missing
  at `expiresAt <= now`; do not use sleeps or background timers for expiration.
- Keep the optional snapshot hook metadata-only (`onSnapshot`) so diagnostics
  and tests receive counters without raw keys/values. Persistence/file snapshot
  ownership remains with 8.9's state-root/recovery work.
- Report `singleFlight: "generation-local"` and `persistence: "memory-only"`;
  the provider makes no cross-process guarantee and performs no logging.

## Task 8.7 cache Promise client bridge

- Keep cache clients in `@zsys/cache` and re-export the same conditional
  `CacheClient` type through `@zsys/functions`; a value contract whose output
  is wholly numeric receives `increment`, while other public contracts do not.
- Validate keys before provider access and values on writes, producer results,
  reads, and increment results using Standard Schema. A producer is wrapped so
  a provider cannot persist an unvalidated `getOrSet` value.
- Normalize `ttlMs` from the descriptor default or operation option and reject
  non-positive, non-integer, or over-maximum values before provider mutation.
  Provider-specific time/expiry and generation-local single-flight remain
  checkbox `8.8` responsibilities.
- Keep the bridge structural and provider-neutral. Cache edges and operation
  observations remain separate, and telemetry hooks are advisory so they
  cannot change cache results.
- Reject increment at runtime when the value schema cannot validate a numeric
  zero or the provider/capability is absent. This keeps dynamic source values
  safe even when TypeScript contracts have been bypassed.

## Task 8.6 local bucket provider

- Keep the existing public bucket client/list contract unchanged; add concrete
  `listPage` pagination and accept pagination options only on the local provider
  extension so existing clients still receive key arrays.
- Store one validated, versioned object envelope per opaque base64url-encoded key
  beneath the provider root's `objects` directory. This avoids file/directory key
  collisions and lets each put commit content plus metadata with one sibling
  temp-file/rename boundary.
- Reject traversal, absolute/drive-relative paths, nulls, backslashes, dot
  segments, and reserved `.zsys`/`__zsys` prefixes before any storage lookup;
  expose SHA-256 content hashes as `contentHash`/`etag` and verify them on reads.
- Enforce local size/MIME/metadata policy before writing, return sorted bounded
  cursor pages, and report signed URL support as explicit false capabilities plus
  `BucketCapabilityError` failures. The local provider remains independently
  constructible; generation startup/readiness wiring stays with later 8.x tasks.
- Extend the shared metadata type with optional `contentHash` only to expose the
  concrete provider's already-calculated integrity field; no 8.5 bridge behavior
  was changed.

## Task 8.5 bucket Promise client bridge

- Keep the public bucket contract and error types in `@zsys/buckets`, with
  `@zsys/functions` re-exporting the client-facing types. The bridge is a
  structural Promise callback so public declarations do not import Effect or
  runtime internals.
- Keep signed URL methods on every typed client while requiring explicit
  `signedReadUrl`/`signedWriteUrl` capability metadata before provider calls;
  unsupported requests fail explicitly and are observed as `unsupported`.
- Build bucket clients only from declared dependency entries, use the declared
  target ID for edges/operation names, and pass the invocation signal/deadline
  and hooks through the engine. Provider output validation and advisory hooks
  stay at the adapter boundary.
- Leave traversal/path normalization, atomic local writes, policy enforcement,
  and concrete local provider state to checkbox `8.6`; no later resource unit was
  pulled forward.

## Task 8.4 compiler and manifest projection

- Keep provider graph nodes serializable by preserving logical profile/capability names, selection source, and environment variable names while projecting each provider configuration to sorted dotted names per environment. Nested environment/sensitive markers and client-shaped configuration are treated as leaves, so configured values never cross the graph boundary.
- Emit a deterministic `providerFactories` object in the runtime manifest, keyed by recipe tag with explicit factory slots, and expose it through both `providers` and `providerFactories`. Runtime factory binding remains outside graph serialization and is owned by the runtime/provider boundary.
- Add a recursive graph/browser-contract test with synthetic credentials, endpoints, sensitive metadata, and client-shaped configuration; refresh only the affected compiler graph goldens. Preserve the uncommitted checkout, protected v3 documents, and `repos/effect`.

## Task 8.3 provider registry

- Keep construction at the active recipe-generation boundary: validate every graph-required capability/profile against the selected set first, then call exactly one active recipe factory. Inactive environment sets and unreferenced logical profiles do not trigger factory construction; the generation's capability map serves every resolved handle.
- Treat an absent `default` metadata entry as the global provider default, while an explicit named profile remains capability-scoped. Keep profile/source diagnostics structured and omit raw factory causes so resolved values, credentials, and endpoints cannot enter startup errors.
- Run factory and generation readiness hooks before exposing the registry; on readiness or abort, release the acquired generation. Release/dispose is idempotent and uses the generation's reverse-lifecycle release seam; concrete provider dependency ordering remains with the factory implementation owned by later provider units.
- Split the public contracts and graph/profile helpers into focused files to preserve the repository's 200-line implementation limit. Leave compiler/manifest projection to `8.4` and concrete bucket/cache/provider behavior to later `8.x` units.

## Task 8.2 provider declaration validation and local bindings

- Keep provider declarations as frozen metadata: validate plain data properties recursively, reject executable/non-JSON shapes and cycles, redact sensitive literals, and record only logical profile/capability names plus value-free environment metadata. Keep provider-set tags hidden and exact so factories cannot enter enumerable snapshots.
- Bind only the stable `local` and `test` recipe tags in `@zsys/providers-local`. The AWS tag remains a valid app declaration but `getLocalProviderFactory("aws")` returns no factory until Phase 15. The generation shell retains no resolved values or client/factory references and leaves concrete readiness/lifecycle to checkbox `8.3` and later provider units.
- Leave compiler/graph projection code unchanged for this unit: the existing projection consumes provider metadata, while non-enumerable recipe tags and the runtime-only factory package remain outside graph data. Manifest/compiler factory output remains owned by checkbox `8.4`.
- Preserve the intentionally uncommitted checkout, untracked iterator skill, protected v3 documents, and `repos/effect`; no commit, stage, push, PR, reset, checkout, or vendor change was performed.

## Task 8.1 Gate 2/4/5 prerequisite verification

- Keep 8.1 evidence-only and reuse the approved Gate 2, Gate 4, and Gate 5 reviews plus their existing runtime/type evidence; no second gate harness or Phase 7 implementation is needed.
- Rerun the exact Gate 5 reproduction commands from checkbox 6.13: the engine/testing/integration suite and public type fixtures. Both passed in the preserved checkout.
- Preserve the intentionally uncommitted worktree, the untracked iterator skill, the protected v3 documents, and `repos/effect`; checkbox 8.2 owns the next implementation surface.

## Task 7.16 Gate 6 approval/rejection review

- Keep 7.16 evidence-only and reuse the 7.15 HTTP suite, compiler collision coverage, closure-free descriptor fixture, and public type fixtures; no second gate harness or Phase 7 implementation is needed.
- Approve Gate 6 because the rejection matrix is covered at the owning boundaries: graph-only OpenAPI/client generation and public handler types, serializable route AST validation, compile-time normalized collision rejection, pre-admission content/body/schema guards, real-socket signal cancellation, and direct runtime/OpenAPI/client contract comparisons.
- Retain both canonical generated and source-golden OpenAPI hashes because the checked-in golden is formatted JSON while the generator compares canonical bytes; retain the byte-identical generated client hash as its contract artifact identity.
- Preserve the intentionally uncommitted checkout, untracked iterator skill, protected v3 documents, and `repos/effect`; the known historical formatting and vendored discovery warnings are non-blocking.

## Task 7.15 Gate 6 evidence

- Treat checkbox 7.15 as a reproduction/evidence unit only. The exact Gate 6 HTTP suite and the existing type-fixture command are sufficient to capture route registration, mapping/failure behavior, disconnect cancellation, request hooks, and runtime/OpenAPI/client agreement; Gate 6 approval/rejection remains the separate 7.16 unit.
- Record both the canonical generated OpenAPI hash and the source golden file hash because the golden is formatted JSON while the generator compares canonical JSON bytes. The generated client is already a byte-identical text golden, so its single hash is the contract artifact hash.

## Task 7.14 fixture-commerce HTTP acceptance

- Use the normative v3 `POST /orders` route shape with the fixture's existing `customerEmail` input: `idempotency-key` and `x-customer-email` headers map to function fields, while `sku` and `quantity` come from JSON body fields. The existing `GET /orders/:orderId` route remains the parameterized companion, so the fixture covers both static and parameterized paths without inventing another route.
- Keep acceptance coverage on the existing compiler runner, graph registration planner, Hono in-memory client, and generated OpenAPI/client seams. A recording `engine.invoke` test double is enough to prove route materialization passes each target ID and `source: "http"` through one engine boundary; real function/provider execution belongs to later provider/runtime units.

## Task 7.13 OpenAPI/client contract fixtures

- Treat the implicit 422 validation response as part of the client response contract whenever a route omits an explicit validation mapping. This keeps generated status/error unions aligned with the existing runtime fallback and OpenAPI generator instead of forcing every route author to duplicate framework validation metadata.
- Keep the contract fixture graph transport-neutral and use checked-in generated bytes for OpenAPI/client goldens. Compare those outputs across different source roots and node order while the runtime test uses the same planned graph, so the evidence covers one shared contract without importing Hono into public handler types.
- Ignore only the generated client golden in Prettier because it is an exact artifact-byte fixture; format the source fixture, OpenAPI JSON, and type assertions normally.

## Task 7.12 real-socket disconnect cancellation

- Keep the disconnect assertion on the existing real Bun listener and use barriers for handler start, public-signal abortion, and invocation completion; bounded deadline races detect hangs without introducing timing sleeps.
- Observe the aborted fetch promise immediately, then assert the engine completion outcome and `request.cancelled` lifecycle event so the test proves both transport disconnect and cancellation classification.

## Task 7.11 HTTP integration tests

- Keep the integration matrix on `createTestHttpClient` and use real sockets only in the explicitly separate 7.12 disconnect unit; this keeps ordinary route assertions deterministic and preserves the 7.10 listener boundary.
- Unwrap successful `mapRequest` results in `routeInput` at the shared materialization seam. Mapping failures remain structured results so they still short-circuit before engine admission, while handlers receive the mapped value required by the HTTP contract.
- Assert collision rejection through `normalizeCompilation` and its empty manifest/`activatable: false` result, rather than starting Hono with duplicate routes; collision ownership remains in compiler normalization.

## Task 7.10 HTTP test harness

- Keep the public app seam structural (`request`/`fetch`) so the in-memory adapter accepts the chosen HTTP framework without adding framework types or dependencies to `@zsys/testing` declarations.
- Register one idempotent client close with the owning test runtime and close every tracked real listener before the optional owner hook. Expose real sockets only through the purpose union `disconnect | stream | proxy`, with bounded graceful shutdown and a hard-stop fallback.
- Reuse the engine's inspectable observability hooks and require the existing protocol/version on captured events; leave route/integration scenarios to 7.11 and later.

## Task 7.9 deterministic typed client generation

- Generate the client directly from the serializable graph so mapped input names, target schemas, response contracts, and route IDs remain aligned with runtime/OpenAPI without importing Hono or a runtime package. Sort routes, fields, responses, object keys, and emitted names deterministically.
- Emit public per-route input/success/error/result/status types and methods that use the platform fetch/base URL seam; serialize path, query, header, cookie, JSON, and multipart mappings with no application closures in generated output.
- Keep invalid normalized graphs from producing activatable OpenAPI/client content. The shared writer includes valid content automatically, writes empty content only to clear an existing stale extension, and preserves explicit versioned extension overrides for existing callers.

## Task 7.8 deterministic OpenAPI generation

- Generate only from the serializable graph contract. Route IDs are operation IDs, paths/methods are sorted before emission, and canonical JSON supplies stable key ordering and a trailing newline; Hono is not a source or dependency of the generator.
- Interpret the existing mapping algebra for transport parameters and JSON/multipart bodies, unwrap optional/default/transform nodes for schema projection, and use the target function output/error data schemas plus declared response mappings for status content. The runtime's public application and validation envelope shapes are represented directly.
- Include ordered middleware/transform IDs and contract, graph, and generator versions as `x-zsys` metadata. Leave compiler artifact writing and content-aware OpenAPI output wiring to checkbox `7.9`.

## Task 7.7 versioned internal endpoints

- Keep the phase-6 surface in `@zsys/runtime-hono` as a thin adapter over `@zsys/contracts` version constants and safe callback stubs; the later `@zsys/inspector-api` package owns the complete query/action protocol.
- Return canonical JSON envelopes with `zsys.inspector` protocol/version fields, bounded list queries, finite cursor-bearing SSE events, and no manifest handlers or provider clients. The default graph response is a JSON-safe snapshot of the existing registration plan.
- Make production internal endpoints disabled by default. Explicit production enablement requires either a bearer token or an authorization callback; invalid query limits return a safe 400 response and provider/readiness failures never expose causes.

## Task 7.6 HTTP response mapping

- Keep response mapping at the transport boundary and reuse the engine's normalized failure algebra; route declarations own status selection, while undeclared application failures fall back to the fixed safe defect response.
- Validate executable response schemas in development/test and skip them in production. Success schemas validate returned values, declared-error schemas validate safe error data, and validation/generic envelopes are checked against their own declarations.
- Preserve only bounded public failure fields through `toPublicEnvelope`; provider, cancellation, timeout, and defect responses use generic bodies without causes, stacks, or raw messages.

## Task 7.5 HTTP middleware

- Make concrete framework middleware the default while retaining the injected fixed-order seam for tests and callers that supply their own framework middleware; declared middleware references continue through the existing manifest-validated engine boundary.
- Normalize incoming request and trace IDs at the transport boundary, use the request ID as the engine correlation ID, and pass the trace ID through the root engine invocation so application handlers see only function input and public function context.
- Link request cancellation and timeout signals, reject known oversized bodies before route execution, and emit one terminal lifecycle event. Lifecycle observers are advisory and cannot turn a request failure into a second failure.

## Task 7.4 request mapping

- Keep mapping execution structural and manifest-driven: route mappings come from the serialized trigger config, middleware mappings come from the manifest metadata, and named transforms resolve only through the supplied hash-matched manifest.
- Treat scalar duplicate query/header/cookie/multipart values as validation failures; optional/default wrappers handle absence without weakening duplicate detection. The Web `Headers` adapter conservatively exposes comma-combined repeated scalar values as arrays because exact raw-header pairs are not available at this boundary.
- Use `application/json` (including `+json`) for JSON nodes, `multipart/form-data` for multipart nodes, and a configurable positive `maxBodyBytes` with a 1 MiB default. Body parsing is cached per request mapping so multiple fields do not consume the stream twice.

## Task 7.3 Hono materialization

- Validate the runtime manifest contract/generator versions, graph hash, and every planned middleware/transform ID before mutating the Hono route table; middleware target metadata is checked when present, including callable generated adapters.
- Keep `createApp` plan-driven and transport-neutral: only planned HTTP triggers become routes, and middleware/target execution crosses the single injected `engine.invoke` boundary with source `http`.
- Accept framework middleware as an injectable fixed-order set so the 7.3 boundary is testable; request mapping and concrete lifecycle middleware remain owned by later Phase 6 tasks.

## Task 7.2 HTTP registration planner

- Sort only the planner's HTTP registration array after canonical graph projection. Route precedence is static (0), parameterized (1), then wildcard (2), with the stable registration ID as the tie-breaker.
- Keep collision ownership in compiler normalization. The planner does not deduplicate or replace registrations, so duplicate normalized method/path entries remain observable for the activation boundary to reject rather than being hidden by a map.
- Treat wildcard as any path containing `*` and parameters as segments beginning with `:`; this covers the graph's serializable route syntax without adding a route parser before 7.3.

## Task 7.1 Phase 6 prerequisite and Hono pin

- Treat Gates 3 and 5 as approved from the existing checked gate reviews and rerun their owning compiler/type and engine/testing suites before the Phase 6 dependency change.
- Pin the registry-resolved compatible Hono release to exact `4.13.2` and declare it only in `packages/runtime-hono`; the lockfile is the generated resolution record.
- Keep 7.1 setup-only. Do not add HTTP materialization, OpenAPI/client generation, HTTP testing, or route fixture behavior until later Phase 6 checkboxes.

## Task 6.14 Gate 5 rejection review

- Approve Gate 5 from the existing engine, runtime-effect, testing, and integration evidence; add no second evidence-only harness.
- Treat the single central runtime-effect bridge handler call as the only accepted user-code boundary. Transport/provider shells have no direct handler calls, and future materializers remain outside this gate.
- Use production ordering and runtime guards as the acceptance evidence: hash/version verification precedes registry construction, output validation occurs in the engine, contexts and dependency maps are fresh/frozen per invocation, cancellation/deadlines inherit through linked signals and earliest-deadline calculation, and undeclared dependency access fails at runtime.
- Keep 6.14 evidence-only. No implementation files or normative documents were changed.

## Task 6.13 Gate 5 reproduction evidence

- Treat 6.13 as a reproduction/evidence unit: reuse the existing engine, integration matrix, fixture, and testing-runtime assertions rather than adding another evidence-only test layer.
- Record the Phase 5 source matrix as root and child `direct` invocation paths; retain the broader `InvocationSource` union for future HTTP/job/event/tool/agent materializers without claiming those paths are implemented in Gate 5.
- Persist isolation as the path contract (`mkdtemp` workspace plus `.zsys/state`, deterministic IDs/clock, fresh fakes, bounded close, and explicit failed-root retention) rather than a machine-specific temporary path.

## Task 6.12 type fixtures and fixture engine coverage

- Keep public inference assertions in a dedicated `tests/types` fixture, using `@ts-expect-error` for wrong transformed input/output shapes, missing declared clients, and invalid dependency references.
- Add the fixture app manifest needed for direct public-package resolution, but keep runtime coverage on `engine.invoke`: create-order exercises cache/event/job clients and limits, handle-order-created exercises a typed direct child, and get-order preserves its declared error.
- Use a forged runtime context only to prove the engine's guarded dependency map rejects an undeclared client; do not add a second invocation path or expose internal runtime types publicly.

## Task 6.11 engine integration matrix

- Keep the Section 23.12 coverage in one integration test matrix and compose the existing engine invocation, observability, testing-runtime, registry, recursion, and generation-runtime seams; no new engine path or runtime record store is needed.
- Assert each invocation's result or safe failure outcome together with emitted logs/spans where the case reaches the invocation pipeline. Use the existing deterministic clock, FIFO admission, guarded dependency clients, immutable recursion stack, graph-hash registry, and managed-generation release contracts for the remaining cases.

## Task 6.10 isolated testing state and fakes

- Allocate a fresh temporary workspace with `.zsys/state` for each `TestRuntime`; use `mkdtemp` rather than a fixed directory or port. An explicitly supplied `stateRoot` is caller-owned and is preserved so later restart tests can reuse it deliberately.
- Keep initial fakes as per-runtime dependency source maps plus named persistent failure controls. The runtime passes those sources through the existing engine client seam, while bucket/cache/job/event/model behavior remains with its later owning tasks.
- Mark rejected invocations and timed-out shutdowns as failures, and accept an explicit `close({ failed: true })` signal for assertion failures that occur outside runtime work. Retain only temporary failed roots when `ZSYS_KEEP_TEST_STATE=1`; successful roots are removed.

## Task 6.9 standalone testing runtime

- Route `invokeFunction` through the engine's existing direct invocation path and keep transport/provider materialization out of this unit. Resolve app test values with `@zsys/config`, while standalone calls receive a copied frozen environment and the engine's frozen default context.
- Keep deterministic test state local to each `TestRuntime`: a monotonic ID source, an Effect `Clock` service controlled by explicit `advance`/`setTime`, and a pending-invocation set closed by abort plus a bounded wait. Temporary state/fakes remain checkbox `6.10` scope.
- Freeze the signal-adjusted public context at the shared handler bridge so direct/runtime tests cannot mutate or reuse invocation context objects.

## Task 6.8 versioned observability hooks

- Keep the versioned `zsys.observability.hooks` v1 contract at the engine boundary and emit invocation, span, declared-edge, observed-edge, completion, and release events through the existing invocation hooks.
- Preserve existing callback hooks and treat observability sinks as advisory by swallowing sink failures; the inspectable in-memory implementation is a test stub only, with no runtime record store, collector, query, or SSE surface before Phase 11.
- Split only the direct-target, dependency-bridge, and public invoke-function helpers needed to keep implementation files within the repository's 200-line limit.

## Task 6.7 direct child function clients

- Route engine-created function clients through the existing `invoke` pipeline; resolve supplied invocation targets or registry handlers there so child validation, admission, failure normalization, and hooks remain single-path.
- Carry the parent trace capture, correlation ID, derived signal, and composed absolute deadline into the child while allocating a new invocation ID and child span; retain the standalone dependency-builder fallback for existing direct client seam tests only.

## Task 6.6 recursion policy

- Keep the call stack immutable and generation/invocation-owned: each child receives a derived stack, so concurrent child calls cannot corrupt one another's active path.
- Reject any repeated function ID before appending a frame, covering direct recursion and multi-function cycles with one iterative membership check. Use the fixed safe `ZSYS_RECURSION_DENIED` policy error and expose only frozen function/cycle metadata.
- Leave direct function-client wiring to checkbox `6.7`; this unit owns the reusable stack policy seam and its focused tests only.

## Task 6.5 concurrency admission

- Keep admission as a generation-owned `ConcurrencyAdmission` instance and expose it through the existing injectable `InvocationAdmit` seam; this avoids a process-global limit leaking work across generations.
- Use one FIFO queue per function, track active and waiting counts separately, and remove cancelled waiters before scheduling the next live waiter. Only a granted waiter acquires the optional `GenerationLifecycle` lease, so queued calls never inflate generation activity.
- Treat `limit`/`functionLimit` as the function limit and `triggerLimit` as the trigger limit; enforce both counters and use the minimum limit for the effective policy. Use the invocation source as the fallback trigger key when no explicit trigger ID is supplied.

## Task 6.4 dependency context bridge

- Keep dependency construction in the engine and derive runtime access from the same six declaration categories already used by the compiler. Map each category to its approved declared edge kind, but emit observed relationships through a separate `ObservedEdge` hook only when a client operation runs.
- Build each public client map as a frozen proxy over declared names. Unknown string properties throw `DependencyAccessError`, while undeclared source/client entries are ignored; missing implementations for declared names fail with `DependencyNotConfiguredError` only when called.
- Adapt the active runtime-effect invocation bridge to Promise-returning client operations inside `runHandler`. The wrapper supplies stable child-operation names/attributes and normalizes provider rejection at the bridge boundary without creating a second runtime.
- Keep provider implementations and direct child invocation out of this unit. `InvokeOptions.clients` is a small test/runtime seam for supplied clients; later provider and direct-call tasks can bind it without changing public descriptors.

## Task 6.3 invocation pipeline

- Keep `packages/engine/src/invoke.ts` as the single orchestration seam and reuse Standard Schema, the runtime-effect failure algebra, and the existing lazy Effect handler bridge instead of adding a second execution path.
- Keep target, admission, context, runner, ID, and lifecycle hooks injectable so this unit proves ordering and cleanup while 6.4 owns declared dependency context and 6.5 owns concrete concurrency admission.
- Preserve structured input validation errors, but normalize invalid output and undeclared/invalid declared error data as safe defects before public exposure. Completion and release hooks run from nested finalization and cannot prevent lease release.

## Task 6.2 Function registry

- Compute the canonical graph hash at registry construction and validate graph/manifest versions before reading handler entries, so no executable registry can exist for an incompatible or stale candidate.
- Keep the public registry as a sorted, frozen `ReadonlyMap` facade with a frozen `handlers` record and function ID list. Accept the generated handler record plus map/entry-list test seams so duplicate entries can be rejected explicitly.
- Keep this unit inside `packages/engine` with only contracts/graph dependencies; invocation, dependency, concurrency, and testing-harness behavior remain owned by later Phase 5 units.

## Task 6.1 Gate 3–4 prerequisite verification

- Keep checkbox `6.1` evidence-only and reuse the existing Gate 3 compiler/type suites and Gate 4 runtime suite; no duplicate gate harness or Phase 5 implementation is needed.
- Treat the passing compiler, type-fixture, runtime, typecheck, declaration, logger-sink, authoring, scope, boundary, verification, strict OpenSpec, and whitespace checks as sufficient prerequisite evidence. The known historical `PROGRESS.md` formatting warning and vendored discovery limitation remain non-blocking.
- Preserve the existing uncommitted checkout and do not edit `packages/engine`, `packages/testing`, `tests/integration/engine`, fixture function code, either normative v3 document, or `repos/effect` in this unit. Checkbox `6.2` owns the next implementation surface.

## Task 5.14 Gate 4 approval

- Approve Gate 4 from the existing runtime-effect/engine evidence instead of adding a second gate harness; the required reproduction suite and supplemental declaration, authoring, logger-sink, boundary, scope, and repository scans all pass.
- Treat public declaration/authoring scans as the application-signature boundary, the abort/deadline/tracing tests as the bridge boundary, the lifecycle matrix as scope evidence, failure normalization/telemetry tests as raw-cause evidence, and the logger-sink AST scan plus sink tests as output-boundary evidence.
- Keep this checkbox evidence-only. No engine invocation path, provider, HTTP, observability store, or Phase 5 behavior belongs in 5.14.

## Task 5.13 Gate 4 runtime evidence

- Reuse the existing runtime-effect and engine tests as the Gate 4 evidence source; their exact assertions cover cancellation propagation/cleanup, reverse release ownership, sink-visible redaction, and root/child trace relationships without adding a second evidence harness.
- Rerun the public declaration emitter/scan for the current 14-package entrypoint cohort and record its result alongside the required package test and root typecheck commands.
- Keep this checkbox evidence-only. Gate 4 assembly and rejection review remain owned by checkbox `5.14`; no engine, provider, HTTP, or observability implementation belongs here.

## Task 5.12 public declaration, example, and logger scans

- Reuse the existing declaration emitter, public authoring scan, and runtime-effect logger-sink AST scan; root verification already runs all three seams in its merge-blocking order.
- Include the current `@zsys/testing` public entrypoint in declaration emission so the scan covers the complete public application package cohort, and extend the existing authoring symbol pattern with `Layer`, `Context.Tag`, `Schema.Schema`, `Fiber`, and `Cause` alongside `Effect`.
- Keep the logger source scan scoped to `packages/runtime-effect/src`; the compiler evaluator's stdout protocol writer is an intentional child-process boundary, not a framework logger sink. Do not add runtime, engine, observability, or Gate 4 review behavior here.

## Task 5.11 runtime and resource-release tests

- Reuse the already focused handler, failure, abort, deadline/clock, tracing, and logger tests instead of duplicating equivalent assertions; the missing coverage is the generation-owned release matrix.
- Exercise `createGenerationRuntime` with minimal graph/manifest seams and ordered service definitions. Assert reverse release after normal disposal, release after failure, release of completed work after interruption during a pending acquisition, and release of only the acquired prefix after partial acquisition failure.
- Keep the unit test-only: no invocation engine, HTTP/provider materializer, public declaration scan, or later phase behavior is introduced.

## Task 5.10 generation lifecycle

- Keep the engine lifecycle plain TypeScript and independent of Effect, HTTP, providers, and supervisor candidate orchestration; `runtime-effect` already owns managed runtime/resource mechanics.
- Use the five generation states `constructing`, `ready`, `draining`, `shutting-down`, and `shutdown`. Readiness is the only admitting state; drain and shutdown stop new work while allowing already acquired leases to finish.
- Track admitted work with idempotent generation leases and expose `waitForIdle()` so later shutdown code can release resources only after in-flight work has drained. Permit shutdown from construction for partial-startup cleanup, but require zero active work before final shutdown.
- Keep supervisor states, provider materializers, HTTP routes, invocation validation, and broad lifecycle tests in their assigned later checkboxes.

## Task 5.9 logger and sink boundary

- Use Effect's internal `Logger.make`/`Logger.layer` and `References.MinimumLogLevel` rather than introducing a second logging runtime. The logger record projects `References.CurrentLogAnnotations` and the internal `InvocationTrace` context into component, invocation, request, trace, span, correlation, and source fields.
- Run the caller-provided redaction hook before either final sink, then apply the existing bounded failure redaction to the record shape. A failing hook yields a safe fixed fallback record instead of allowing sensitive data to escape through the error path.
- Keep direct `console`/`process` output in the two final sink adapters only. The source scan is scoped to `packages/runtime-effect/src`; the compiler evaluator's stdout protocol writer remains a separate intentional process boundary and is not a logger sink.
- Export the logger seam only from the internal runtime-effect entry. Application package exports remain free of Effect logger, layer, fiber, and related internal types.

## Task 5.8 tracing and bridge re-entry

- Keep the trace state in an internal `Context.Reference` carrying invocation ID, parent invocation ID, trace/span IDs, source, correlation ID, and the caller signal. Root and child helpers install that state around Effect spans and reserve invocation annotations under stable `zsys.*` attribute names.
- Use a small generation-owned `Tracer` implementation so `IdSource` supplies trace/span IDs instead of Effect's native random IDs. The observer hook reports span lifecycle objects for later observability ownership; it does not write logs, files, or streams here.
- Capture the active parent span and tracer before a Promise context operation leaves the invocation fiber. `createInvocationBridge` re-enters through the caller-owned runner, reinstalls the parent/tracer/context, and creates one child span; it never calls `runPromise`, creates a runtime, or creates an unrelated root trace itself. `runVoid` shares the same path.
- Split the tracer object and bridge helpers into `tracing-span.ts` and `tracing-bridge.ts` so every implementation file stays below 200 lines while `tracing.ts` remains the internal public seam. Do not start logger/sink, engine lifecycle, provider, or observability storage work owned by later checkboxes.

## Task 5.7 deadline composition and clock bridge

- Store an absolute Unix-millisecond deadline in an internal Effect `Context.Reference`. `withDeadline` provides that value to descendants, and `withTimeout` combines it with the child timeout using the active Effect clock so nested work cannot outlive the earliest parent/child deadline.
- Extend the existing handler bridge with optional deadline/timeout inputs. Effect timeout interruption therefore reaches the already-derived public `AbortSignal`, and timeout causes normalize through the existing failure algebra without a second runtime.
- Build the Promise-facing public clock from the active Effect `Clock.Clock` and an injected Effect runner. The bridge uses `currentTimeMillisUnsafe` for synchronous `now()` and the clock's `sleep` effect for async waits; the caller owns runner/runtime entry, so this module does not create an unrelated root runtime. TestClock drives the focused test without real sleeps.
- Keep the change inside `packages/runtime-effect`; do not alter public application packages, add dependencies, modify `repos/effect`, or touch either normative v3 document. Tracing, logging, engine lifecycle, and provider behavior remain later checkboxes.

## Task 5.6 abort bridge

- Link the active Effect callback signal and the incoming public signal to one derived signal exposed to the handler. Fiber interruption therefore aborts application/provider work without attempting to abort a caller-owned `AbortSignal`.
- Keep the bridge cleanup local to the handler evaluation: remove all input and derived-signal listeners before resuming success/failure, and return the same cleanup as the Effect callback finalizer for interruption.
- Use a small `abortablePromise` helper for Promise-facing provider seams. It passes the derived signal to the operation, skips an operation that is already aborted, rejects promptly when the signal aborts, and removes its listener after settlement.
- Preserve the 5.5 lazy bridge and active-fiber ownership. Do not add a runtime, deadline/clock composition, tracing, logging, engine lifecycle, or provider implementation in this unit.

## Task 5.5 handler bridge

- Return a lazy `Effect` from `invokeUserHandler` and never call `runPromise` or construct another runtime. This keeps the handler in the caller's active generation/invocation fiber and preserves its scope and services.
- Use `Effect.callback` rather than shared mutable execution state. Its fiber signal is passed into a shallowly derived public context, while a local completion guard ignores late Promise settlement after interruption.
- Normalize synchronous throws and Promise rejections at the bridge boundary with the existing failure algebra; keep declared error detection structural so `@zsys/runtime-effect` does not depend on `@zsys/functions`.
- Keep the focused bridge tests beside the package implementation. Broader timeout, abort-listener, tracing, logging, and lifecycle coverage remains with their owning later checkboxes.

## Task 5.4 failure algebra and safe envelopes

- Normalize Effect `Cause` values and public `defineError` instances at the runtime boundary into one frozen failure union with distinct application, provider, cancellation, timeout, and defect tags/outcomes. Structural declared-error detection keeps `@zsys/runtime-effect` independent of the public functions package.
- Keep the safe envelope deliberately small: declared IDs/data/status/retry are retained only when valid, while provider, cancellation, timeout, and defect codes/messages are fixed generic values. JSON-incompatible declared data is omitted rather than serialized unsafely.
- Store raw causes and stacks in a private `WeakMap`; development telemetry uses bounded redaction and an optional redactor hook, while production/test telemetry and public envelopes cannot include the internal detail. Runtime failures are plain frozen records rather than `Error` objects, so a normalized failure does not expose a stack property.
- Keep failure implementation and telemetry behind `@zsys/runtime-effect`; do not add an application-package dependency or re-export Effect/Cause types. Preserve the intentionally uncommitted checkout, iterator skill, vendor, and normative documents.

## Task 5.3 generation runtime and scope

- Consume the Phase 1 adapter through the explicitly internal `@zsys/config/internal/config` subpath. The public `@zsys/config` root and application package exports remain plain; the packed-export check allows only this named config-internal entry.
- Require an explicit `EnvSource` and pass it to `ConfigProvider.fromEnvRecord`; the runtime never performs implicit local `.env` loading. Reject `allowImplicitDotEnv: true` for production generations so container startup relies on injected values.
- Construct exactly one `ManagedRuntime` from the generation layer. Its memoized environment layer resolves once, freezes the resolved values, and supplies them before the scoped service layer acquires providers. `Effect.acquireRelease` registers all finalizers in acquisition order, so the managed scope closes them in reverse order for success, failure, interruption, and partial startup.
- Use a small dependency-order pass that preserves declaration order for ties and rejects duplicate IDs, unknown dependencies, and cycles. Abort signals race environment/service acquisition because beta.107 builds managed layers in a separate fiber; this keeps interruption cleanup on the same managed runtime rather than creating another runtime or scope.
- Keep the checkout intentionally uncommitted and preserve the untracked iterator skill. No Effect type is re-exported by an application package, and no vendor or normative v3 document is in scope.

## Task 5.2 Internal service boundary

- Use Effect class-style `Context.Service` tags for `Graph`, `Manifest`, `Providers`, `Observability`, `IdSource`, and `Shutdown`, matching the vendored Effect guidance while keeping acquisition and lifecycle implementation for checkbox 5.3.
- Reuse Effect's built-in `Clock.Clock`, `Logger.CurrentLoggers`, and `Tracer.Tracer` references instead of wrapping them in duplicate tags; deterministic clock replacement and logger/tracer layers remain runtime wiring concerns.
- Keep the graph and manifest contracts immutable and generation-scoped: the graph carries its canonical hash, while the manifest carries version fields, the matching hash, executable handler registries, provider slots, middleware, and request transforms. Keep provider handles and observability records internal because the public descriptor packages must remain plain TypeScript.
- Add only `@zsys/contracts` and `@zsys/graph` as direct workspace dependencies required by the service contracts. Export the tags from `@zsys/runtime-effect`'s internal entry only; do not add any application-package re-export or application dependency.
- Keep the checkout intentionally uncommitted and preserve the untracked `.agents/skills/openspec-iterator/SKILL.md`; no vendor or normative v3 document is in scope.

## Task 5.1 Effect dependency boundary

- Keep checkbox 5.1 setup-only. Reuse the Phase 1 `effect` pin and add only the supported Bun platform packages needed by `@zsys/runtime-effect`; do not start service, lifecycle, handler, cancellation, clock, tracing, or logging implementation.
- Pin `effect`, `@effect/platform-bun`, and `@effect/platform-node-shared` to `4.0.0-beta.107`. The explicit node-shared pin plus the root Bun resolution override keeps the platform dependency aligned with Effect instead of allowing the published prerelease range to resolve to `rc.109`.
- Keep the direct dependency boundary at `packages/runtime-effect`; the root override is resolution metadata only. Add internal contracts/diagnostics dependencies when checkbox 5.2 has code that imports them. Use the root Bun install only, and leave `repos/effect` and both normative v3 documents untouched.

## Task 4.20 Gate 3 rejection review

- Keep checkbox 4.20 evidence-only. Reuse the existing AST prefilter/evaluator, fixture runner, canonical graph/hash, manifest, and graph-diff tests; do not add a second evidence harness or begin Phase 4.
- Approve Gate 3 because the direct reproduction passes and every rejection condition is covered: syntax-only discovery, Bun child isolation, data-only graph snapshots, compile-time selector expansion, deterministic bytes independent of roots/PIDs/clocks/order, warning-only success, semantic-error manifest suppression, and project-relative source locations.
- Treat the known unscoped vendored `repos/effect` discovery limitation as non-blocking, as in prior units. Preserve the intentionally uncommitted checkout and do not stage, commit, push, or alter normative/vendor paths.

## Task 4.19 compiler and type evidence

- Keep checkbox 4.19 evidence-only: reuse the existing root scripts, test-owned fixture runner, deterministic artifact assertions, commerce acceptance report, and graph diff tests. Do not add another compiler pipeline, test harness, Gate 3 decision, or Phase 4 implementation.
- Record all nine fixture names and exit codes, the normalized graph hashes, five artifact byte comparisons across sorted/reversed/random enumeration, the commerce manifest handler/registry report, and the four graph-diff classifications directly in the change notes so Gate 3 can consume reproducible evidence without inferring it from chat output.
- Treat the existing vendored `repos/effect` package-root discovery limitation as non-blocking because the required `bun run test:compiler` and `bun run test:types` commands pass and no vendor files are in scope.

## Task 4.18 fixture-commerce compiler acceptance

- Add the fixture's checked-in `zsys.config.ts` and compile a disposable copy through the existing evaluator/normalizer seam. Reuse the fixture runner rather than adding a second compiler pipeline or compiling source in-process.
- Keep `order-created.event.ts` default-only because the named export duplicated the same branded descriptor during discovery. Function imports use the default descriptor; schemas and other helper exports remain allowed.
- Assert exact stable IDs, edge tuples, generic trigger IDs, source locations, manifest registries, and the canonical graph hash. Scan only generated data for executable/provider/secret/path leakage so required executable references remain in the manifest without being mistaken for graph data.

## Task 4.17 compiler determinism and watch parity

- Keep determinism coverage test-owned and reuse the existing fixture runner, isolated evaluator, extracted reference instructions, canonical graph/hash functions, watch invalidation index, and content-aware artifact writer. No incremental compiler cache or Phase 6 generator was added.
- Add a deterministic pseudo-random candidate permutation and caller-supplied evaluator generation IDs to the fixture runner. The IDs vary the identity-bearing inputs without allowing process/time metadata into graph, manifest, diagnostics, OpenAPI, or client bytes.
- Randomize extracted descriptor metadata recursively while preserving arrays and stable references, then compare the full normalized output set. Use distinct POSIX/Windows roots and volatile graph metadata to exercise separator/root/PID/clock/generation/random exclusion through the existing canonical graph owner.
- Model watch compilation as invalidation selection followed by the existing pure normalization result, and compare it with a clean normalization over reversed descriptors. This proves the current watch seam's add/change/remove dependency decisions and full-build byte truth without inventing a partial compiler implementation.
- Treat OpenAPI/client as versioned output extensions until Phase 6 owns their generators. The determinism contract is already asserted by comparing their bytes and by proving unchanged extension files are not rewritten after an unrelated function-contract change.

## Task 4.16 fixture/golden runners

- Keep the fixture harness test-owned and reuse the existing compiler seams: config loading, AST prefiltering, the isolated Bun evaluator, extraction/source maps, normalization, convention diagnostics, and graph canonicalization. The runner adds no second compiler pipeline or public API.
- Make every compilation disposable and self-contained by copying only source/config into a unique temporary root and linking the local `@zsys/*` package roots needed by the fixture imports. Remove the root in `finally` so parallel or repeated runs cannot share application state.
- Compare canonical diagnostic and graph bytes, not source formatting. Merge convention warnings through the same stable diagnostic ordering used by the compiler; update expected JSON/exit-code files only when `UPDATE_GOLDEN` is exactly `1`.
- Use a deterministic reversed candidate order for the second compilation. This proves evaluator enumeration does not affect current fixture outputs without starting the broader root/PID/clock/watch matrix owned by checkbox `4.17`.

## Task 4.15 compiler fixtures and golden expectations

- Keep all fixture application code on the public descriptor APIs and make each fixture independently discoverable from `src/app.ts` plus the explicit tooling config. The fixture set is data for compiler acceptance, not a second runtime or provider implementation.
- Generate expected graph and diagnostic payloads from the bounded evaluator snapshots and the existing normalizer. Convention warnings are merged through the shared diagnostic sorter; valid and warning-only fixtures retain graph output, while semantic-error fixtures intentionally omit graph output and use exit code `1`.
- Exercise the full graph surface with one valid fixture, including generic event-trigger projection, and use the resulting approved node/edge model as the assertion surface for the absence of a separate subscription node or forbidden subsystem node. Golden-runner comparison, shuffled enumeration, and update mode remain checkbox `4.16`.

## Task 4.14 registration planning and graph compatibility diff

- Keep registration planning in `@zsys/graph` as a graph-only projection. It reuses canonicalization and the single graph hash, returns only provider-free registration data, and deep-freezes the result; provider construction and materialization remain later runtime work.
- Treat jobs as queue registrations and derive stable schedule IDs from the job ID plus declared schedule ID. Generic queue/schedule trigger nodes remain data-only, while no new graph node kind or runtime behavior is introduced.
- Compare graph contracts without source locations so a descriptor file move emits an informational `source-moved` entry rather than a logical/deployment break. Event trigger expansion is compared as sorted set data and reports added pairs as potentially breaking and removed pairs as breaking.
- Use stable category names and four machine-readable classifications: `informational`, `compatible`, `potentially-breaking`, and `breaking`. Additions are compatible, removals are breaking, and contract-specific schema/policy changes use the narrowest safe classification supported by the graph data.

## Task 4.13 deterministic artifact writes and watch invalidation

- Keep compiler-owned writes behind one byte-comparison API. `writeIfChanged` reads the existing UTF-8 bytes and opens the path only when content differs; the generated directory is created only on the write path, so unchanged files retain their modification state.
- Treat OpenAPI, client, and deployment output as versioned opt-in extension inputs rather than implementing their Phase 6/15 generators early. Fixed artifact names and versions make later producers share the writer contract, while deployment remains absent unless explicitly supplied.
- Build watch dependencies from every nested stable reference in normalized descriptor values and store reverse edges. A changed descriptor invalidates its transitive dependants in stable ID/source order; a file with no known descriptor invalidates discovery and the core generated artifacts so additions/removals cannot reuse stale candidates.
- Expose the index as `NormalizationResult.watch` while keeping normalization itself a full deterministic pass. This provides a safe watch-cycle invalidation seam without introducing partial compilation caches, supervisor behavior, graph diffing, or runtime state.

## Task 4.12 runtime manifest generation

- Keep `generateManifest` as the single compiler seam for the executable output. It consumes the already canonical graph/hash and existing diagnostics, while small local helpers own sorted descriptors/import bindings, executable expressions, and source rendering so every implementation file stays below 200 lines.
- Use evaluator reference instructions for generated imports: normalize module paths through `@zsys/contracts`, sort unique modules before assigning namespace aliases, and address exports by JSON-quoted names. Direct in-memory descriptors remain accepted by normalization tests, but a missing or malformed reference cannot activate an evaluator-backed manifest.
- Render exactly one function map entry per unique function ID, adapter declarations that call the target function expression, and named `requestTransforms` entries that point at the referenced schema validator. Provider output is data-only recipe-tag slots keyed by the stable `local`/`test`/`aws` tags until provider runtime factories own their executable construction.
- Include contract/generator versions and the canonical `manifestGraphHash` in generated source. Existing semantic errors, graph/hash mismatch, duplicate function IDs, and required handler/middleware/transform reference failures return an empty source with `activatable: false`; no content-aware writes, watch invalidation, or later artifact generation is included.

## Task 4.11 canonical graph sorting and hashing

- Make `packages/graph/src/hash.ts` the single owner of canonical graph bytes and graph hashes. Reuse `@zsys/contracts` canonical JSON and source-location normalization rather than duplicating either contract in the compiler.
- Keep the public hash form `sha256:<64 lowercase hex>` and hash the canonical JSON string without a trailing newline. The compiler imports this graph-package implementation for both its graph output and `graphHash`, so consumers cannot drift to another algorithm or string form.
- Sort nodes by kind, stable ID, normalized source location, and canonical bytes; sort edges by kind, endpoints, role, and canonical bytes. The final byte tie-breaker keeps duplicate-ID/error inputs deterministic even when source enumeration order changes.
- Strip only explicit ephemeral time/PID/random/generation metadata at graph/node/edge and metadata-like structural boundaries. Preserve arbitrary payload/schema fields, including legitimate fields named `time`, and leave policy fields such as `timeoutMs` in the graph.
- Use the existing `projectRoot` option for absolute source paths and `/` output separators. Do not infer identity from source paths, add manifest generation, or implement later deterministic writes/watch behavior in this unit.

## Task 4.10 graph construction

- Keep construction in the existing compiler normalization surface rather than adding a second graph builder or changing the 4.9 graph package dependency. Project only approved node kinds; route and `event-trigger` descriptors become generic trigger nodes, while compiler-only middleware/transform descriptors remain config references rather than graph nodes.
- Represent route middleware as ordered `{ id, targetFunctionId }` data and named transforms as `{ id, schema }` projections. Emit `targets-function` edges with `primary` or `middleware` roles, point event-listener edges at event node IDs while retaining versioned selector expansion in trigger config, and ignore unknown dependency categories instead of inventing an edge kind.
- Add a separate `observedEdges` normalization input/result collection so runtime observations cannot affect canonical graph JSON or its hash. Keep canonical sorting/hash and manifest generation outside this unit even though the existing normalization seam still computes its prior hash/output surface.
- Project app environment/provider metadata and generated-agent markers as data-only graph fields. Provider-profile edges are emitted only when a matching provider node exists, avoiding dangling canonical references for incomplete/error inputs.

## Task 4.9 graph model contract

- Keep the graph package as a data-only typed union with exactly the approved eleven node kinds and eleven declared edge kinds. Construction, canonical sorting, and hashing remain later tasks; observed runtime relationships stay separate from canonical edges.
- Use wire kinds `env` and `provider` for environment-variable and provider-profile nodes, while retaining the descriptive `ProviderProfileNode` type name. HTTP triggers carry ordered middleware target references and transform ID/schema projections; event selector expansions are sorted data.
- Mark generated agent invocation functions explicitly with a JSON-safe generated marker tied to the agent and function IDs. The model contains no subscription node, executable closure, secret value, provider client, or other out-of-scope subsystem node.
- Keep `@zsys/contracts` as the graph package's only dependency. The compiler's existing loose normalization graph remains unchanged for checkbox `4.10` construction work.

## Task 4.8 semantic reference and compatibility validation

- Keep references kind-qualified as well as globally ID-indexed. Resolution rejects a ref whose kind does not match the requested target kind, while nested route middleware reuses an exported descriptor without producing a false duplicate; distinct nested IDs still produce duplicate diagnostics.
- Treat middleware and named transforms as compiler-only internal descriptor shapes. Capture their evaluator metadata structurally, project schemas to JSON-safe snapshots or report `ZSYS_SCHEMA_UNAVAILABLE`, and do not add graph model/node behavior owned by checkboxes `4.9` and `4.10`.
- Validate compatibility only when both schemas have deterministic projections. Schema-unavailable diagnostics remain the root error instead of cascading misleading route, middleware, tool, or event incompatibility failures; jobs already use the same skip behavior.
- Canonicalize route parameter names for collision checks and sort collision candidates by stable ID/source. Sort function dependencies before cycle traversal so duplicate diagnostics and prohibited-cycle paths do not depend on descriptor enumeration.
- Keep raw `all` event selectors non-expanding: valid audit/telemetry/development purposes emit a warning restriction, while missing/invalid purposes emit an error. Pattern selectors expand `*` and `**` against known event IDs and warn when they match nothing.
- No provider clients, runtime calls, graph model changes, manifest adapters, generated files, normative v3 documents, or `repos/effect` files were added; all requested changes remain inside the compiler normalization/evaluator boundary.

## Task 4.7 normalization and ordered validation

- Keep `normalizeCompilation` synchronous and pass-driven. It records the exact 17 v3 Section 11.4 pass names and callback order, catches a failed pass as a diagnostic, and returns deterministic descriptors, diagnostics, graph/hash, output strings, and activatability without starting runtime work.
- Reuse the existing evaluator extraction/source-map contracts. Direct descriptors remain available for schema and compatibility checks; evaluator snapshots retain only JSON-safe metadata and generation-scoped reference instructions, while source locations are normalized through the shared project-relative contract.
- Normalize explicit IDs, HTTP methods/paths, profile names, schedule fields, retry jitter, and idempotency keys before local validation. Use deterministic fallback IDs for malformed raw inputs so `ZSYS_ID_INVALID` and sibling diagnostics are emitted rather than allowing diagnostic normalization to throw.
- Keep the 4.7 graph/output surface minimal and serializable. Executable values are cleaned from graph nodes, canonical graph JSON is hashed with SHA-256, and semantic errors blank the generated manifest; middleware/transform indexing, full graph model/construction, and content-aware writes remain later checkboxes.
- Split helpers by responsibility to keep every implementation file below the repository's 200-line limit without introducing a general validation framework. The worktree remains intentionally uncommitted and `repos/effect` remains untouched.

## Task 4.6 descriptor extraction and source maps

- Treat the evaluator's `EvaluatorDescriptorSnapshot` and `EvaluatorManifestReference` as the extraction boundary. The child process already enumerates branded exports and records the literal export name, so extraction preserves that name and derives only the explicit `default`/`named` fact without re-importing application code.
- Keep source mapping AST-based and data-only. Direct declarations and local export lists use the descriptor initializer position; default assignments use their expression; relative re-exports resolve to the originating source when available, while unresolved paths fall back to the re-export statement. All locations pass through the shared project-relative `SourceLocation` contract.
- Return one extracted record per exported descriptor, including a generation-scoped import/reference instruction with module/export identity. Never carry the evaluated descriptor object or handler into extraction; function values remain the evaluator's bounded JSON markers.
- Split the AST fact reader into `source-map-utils.ts` to keep implementation files below the repository's 200-line limit without adding a general source-analysis framework. No normalization, validation, graph, manifest generation, or later compiler behavior was started.

## Task 4.5 evaluator side-effect detection

- Keep detection inside the existing Bun child and install/restore hooks around each candidate import. A detected operation becomes a structured `ZSYS_EVALUATOR_SIDE_EFFECT` failure; the parent still owns timeout/kill and never falls back to in-process evaluation.
- Allow writes only beneath the request's project-relative generated directory, defaulting to `.zsys/generated`; common Node filesystem mutators and `Bun.write` are guarded lexically. The detector intentionally does not claim to cover file descriptors, symlink/race escapes, native syscalls, or pre-bound CommonJS named imports.
- Treat network as disallowed by default and permit only exact caller-provided host entries. Listening sockets and child-process entry points are always rejected; common fetch/WebSocket/HTTP/TCP/DNS/Bun network calls are checked against the allowlist.
- Capture common console and process stream writes in the child response so direct output cannot corrupt the protocol frame. Report detector coverage in every response, including unsupported bypass classes, while retaining the existing isolated process as the only safety boundary.

## Task 4.4 evaluator protocol and isolation

- Use protocol `zsys.evaluator` version `1` with a framed JSON response so candidate module stdout remains distinguishable from the evaluator response. Requests carry a caller-supplied or generated generation ID, project root, project-relative candidate files, source-map intent, timeout, and an explicit environment allowlist.
- Resolve and compare the parent/child project root with `realpath`, spawn Bun with `--no-env-file --no-install`, pass only allowlisted environment names, and kill the child after the compilation timeout. The parent captures both streams and returns protocol/process/timeout/import failures as serializable records.
- Keep executable identity out of snapshots: descriptor metadata is JSON-safe and functions/symbols/other non-serializable values become bounded markers. Manifest references retain generation ID, module, export name, descriptor ID, and kind for later extraction/graph work.
- Bun's child runtime supplies source-mapped TypeScript stacks; evaluator failures normalize absolute roots and Windows separators while preserving file/line information. No side-effect detector or later extraction/graph behavior belongs in this unit; checkbox `4.5` owns feasible detector coverage.

## Task 4.3 AST prefilter

- Keep Stage A purely syntactic. `prefilterSources` accepts source text and paths, parses with the TypeScript compiler API, and returns frozen candidate/skipped facts; it never imports modules, reads application values, or invokes an evaluator.
- Use the approved candidate indicators as a conservative syntax filter: runtime `@zsys/*` imports, known descriptor factory call names, default exports, descriptor-brand access, and runtime re-exports. Ignore type-only imports/exports so type contracts alone do not activate evaluation.
- Apply the tooling default or explicit exclude globs before scanning. Report ordinary helpers and excluded tests/fixtures separately so later evaluation can consume only candidates and tests can prove excluded source was never run.
- Declare `typescript` as an `@zsys/compiler` runtime dependency because the packed compiler executes the TypeScript AST API. Extend the existing export smoke only to stage declared external dependencies from available root/workspace-local installations; no new package or runtime abstraction was added.
- Split the scanner helpers from `ast-prefilter.ts` because the repository caps implementation files at 200 lines. Re-export only the prefilter API/types from the compiler barrel; evaluator isolation, side-effect detection, extraction, and graph work remain later checkboxes.

## Task 4.2 config loader

- Keep `zsys.config.ts` tooling-only. The loader allowlists `entry`, `source`, `exclude`, `generatedDirectory`, and `inspector`; it neither imports nor evaluates application modules and rejects unknown/function-valued behavior.
- Reuse the existing `normalizeSourcePath` contract for project-root-relative POSIX, drive-letter, and UNC paths. Omitted values use the technical-spec defaults; explicitly supplied source/exclude arrays are deduplicated and stably sorted for deterministic downstream discovery.
- Return frozen validated data and structured `ConfigIssue` records. Read plain records without invoking accessors so a config cannot execute behavior during validation; keep discovery, evaluator isolation, and filesystem enumeration for later compiler checkboxes.
- Split type and utility definitions from `config-loader.ts` to keep each implementation file below the repository's 200-line limit without adding a general configuration framework.

## Task 4.1 Gate 2 prerequisite rerun

- Keep checkbox `4.1` evidence-only. Gate 1 is still represented by approved candidate `6877e5021`, and Gate 2 remains approved because the rerun reproduced the public type, descriptor, source/export, authoring, declaration, and repository checks.
- Preserve the exact package-root Gate 2 command and its exit `1`: all ten ZSys tests pass, then Bun discovers unrelated vendored `repos/effect/packages/tools` tests with missing upstream modules. The focused ZSys entrypoint is the applicable passing descriptor evidence; do not broaden discovery, add a workaround, or touch vendor files here.
- Do not start compiler/graph/config-loader behavior in this unit. Checkbox `4.2` owns the next implementation surface after the verified checkbox transition.

## Task 3.18 Gate 2 rejection review

- Approve Gate 2 because the six explicit rejection conditions are absent: public evaluation has no global registration, only functions own handlers, subscription names/files are absent, undeclared context clients are rejected by the type fixtures, valid descriptors remain included when conventions warn, and bucket/cache/resource declarations require no provider or vendor client.
- Use `bun run lint`, `bun run scripts/check-public-declarations.ts`, the focused descriptor/source-export tests, and `bun run test:types` as the direct evidence for those boundaries. The package-root command remains recorded unchanged even though Bun discovers unrelated vendored `repos/effect/packages/tools` tests after the ten ZSys tests pass; this is a known unscoped discovery limitation, not a Gate 2 rejection.
- Keep this checkbox evidence-only. Do not add compiler discovery, graph nodes, runtime registration, provider factories, or any other Phase 3+ behavior; the next unit owns only verification before compiler/graph work.

## Task 3.17 Gate 2 type and package test evidence

- Treat `bun run test:types` as the public inference gate; it passed with the expected public descriptor inference and boundary-rejection result.
- Run the exact package-root command required by the checkbox even though Bun's unscoped basename discovery reaches `repos/effect/packages/tools`. Preserve the command's exit `1` and missing-upstream-module output as a known repository limitation; use the focused ZSys package entrypoints to account for the ten ZSys tests without touching vendored files.
- Record the convention smoke's five warning-only codes explicitly. All are `ZSYS_CONVENTION_DIRECTORY`, `ZSYS_CONVENTION_SUFFIX`, `ZSYS_CONVENTION_EXPORT`, `ZSYS_CONVENTION_MULTIPLE_KINDS`, and `ZSYS_CONVENTION_ID_STYLE`; none is an error and the branded descriptor remains included.
- Mark only checkbox `3.17` complete after the type fixtures, focused descriptor tests, convention warnings, and repository verification passed. Leave Gate 2 approval/rejection to checkbox `3.18`.

## Task 3.16 public examples and authoring scans

- Add one focused README to each Phase 2 public descriptor owner plus the common `@zsys/app` entry point. Keep examples on the approved public syntax: ordinary async handlers only on functions, function refs for every other executable capability, logical profile names, serializable HTTP mappings, and explicit value-free environment/provider declarations.
- Reuse the existing `scripts/lint.ts` command seam for an AST-based authoring scan over README TypeScript fences and `apps/fixture-commerce`. Scan only authored source/examples here; fixture compilation, discovery, graph normalization, and runtime side-effect enforcement remain later compiler/runtime work.
- Treat global provider configuration as the approved place for concrete provider selection while rejecting vendor names in descriptor `profile`/`modelProfile` fields. This preserves the v3 distinction between logical resource intent and global provider choice.
- Extend the existing public declaration scanner to the complete 13-package foundation/descriptor cohort and add explicit framework, cloud/provider-client, and non-function-handler checks. Keep the public declaration scan separate from source authoring scans because emitted declarations cannot contain executable reads, construction, or registration calls.

## Task 3.15 descriptor cohort tests

- Keep one shared Bun runtime suite under `tests/contracts` and one package-root forwarding entry under `packages/app`; the exact Gate 2 package-scoped path discovers the suite without duplicating execution across nine packages or broadening into vendored `repos/effect` tests.
- Extend the existing `tests/types` fixture project with a single public descriptor fixture and explicit source path mappings for the Phase 2 package barrels. This proves declared dependency/client/schema inference while retaining the existing undeclared-context rejection fixture.
- Test package contracts through their public source barrels, matching the established Phase 0/Phase 1 forwarding pattern. Keep compiler/graph, source scans, README examples, and fixture compilation out of this unit; those belong to later checkboxes.

## Task 3.14 commerce fixture authoring

- Use the common public `@zsys/app` re-export surface plus public `@zsys/schema` for the fixture. Do not add a fixture package manifest or lockfile entry yet: Phase 2 requires authoring only, and fixture compilation/package resolution is owned by Phase 3.
- Cover the v3 authored surface with separate convention-shaped modules: app/env/provider declarations, functions and a declared error, route/named transform/middleware, job, event and `onEvent` trigger, bucket, cache, tool, and agent. Keep one primary default export per descriptor file and explicit lower-case dot/kebab IDs.
- Put ordinary application behavior in a small `node:path`-backed helper used by an async function. The authoring assertion checks the function's explicit dependency map rather than inventing a graph or library descriptor; compiler inference remains Phase 3 behavior.
- Keep `authoring-assertions.test.ts` outside the descriptor set so the future `src/**/*.test.ts` compiler exclusion can omit it. No runtime wiring, provider client, environment resolution, compiler/graph behavior, or 3.15 test cohort belongs in this unit.

## Task 3.13 convention checker

- Keep the checker pure and brand-first: `checkConventions` accepts a branded descriptor and source path, normalizes path separators/project roots, and returns only frozen diagnostics. Unbranded values are ignored rather than converted into semantic errors, so convention analysis cannot exclude valid descriptors or invent compiler failures.
- Reuse `@zsys/contracts` for descriptor/path validation and `@zsys/diagnostics` for portable warning records. Use the v3 directory/suffix table, default-export/file-kind facts supplied by discovery, and a lower-case dot/kebab recommendation for the advisory ID-style warning.
- Treat all five convention codes as warning severity, including multiple-kind grouping. Export/default facts and same-file descriptor facts are optional because this Phase 2 helper must not perform source discovery; later compiler discovery supplies them.
- Export the helper through `@zsys/compiler` and declare only its two existing lower-layer dependencies. Leave discovery, graph construction, fixture authoring, and the durable convention test cohort to their owning checkboxes.

## Task 3.12 application and provider declarations

- Reuse the existing descriptor brand/freeze and config metadata contracts. `defineEnv` keeps runtime parsers/default factories in the declaration shape, while each declared property exposes a frozen, non-enumerable `EnvRef<Name, Value>` token whose phantom type preserves resolved-value inference without storing a value.
- Keep `defineApp` as a pure branded descriptor factory. It copies only the approved environment, development/test/production provider sets, observability body-capture policy, and JSON-safe defaults; no application import resolves environment values, starts runtime code, or constructs clients.
- Represent local/test/AWS provider choices as safe logical metadata: capability/profile selections, non-secret configuration, redacted sensitive literals, and referenced environment name/type/sensitivity. Use non-enumerable string tags plus `Symbol.for("zsys.provider.recipe")` as stable internal recipe slots; executable factories remain later runtime/manifest work.
- Re-export the common descriptor factories through `@zsys/app` and declare their workspace dependencies. Extend the existing packed export smoke to stage the transitive local package artifacts in its isolated fixture, because a packed app with common re-exports cannot resolve workspace dependency names from the public registry.
- Keep observability capture opt-in and bounded (`off` or `development-redacted` with a positive byte limit); keep provider configuration plain JSON/token metadata and reject accessors, clients, functions, non-JSON values, and raw sensitive literals.

## Task 3.11 agent descriptors

- Reuse the shared descriptor brand/freeze contract, Standard Schema v1 validation, and `@zsys/tools`'s `isToolRef`; store only copied `{ ref }` values so agent metadata cannot retain tool targets or executable details.
- Keep model selection logical and path/vendor-neutral by normalizing `modelProfile` as an explicit stable ID. The descriptor contains no provider credentials, model client, handler, approval state, runtime loop, or generated function identity.
- Support plain instruction text plus a serializable `PromptTemplate` containing template text and optional variable names. Require all three runtime limits as positive safe integers so missing, non-finite, zero, negative, and otherwise unsafe values cannot describe an unbounded agent.
- Reject duplicate tool IDs and top-level handlers at declaration time; runtime allowlisting, approvals, cancellation, response-size bounds, output execution, and model resolution remain later Phase 10/11 work.

## Task 3.10 tool descriptors

- Reuse the shared descriptor base and the existing `FunctionRef`/declared-error contracts. `ToolDescriptor` keeps the target's input/output schemas and error list through a typed handler-free function reference, so tools add no duplicate contract or executable handler.
- Copy full function descriptors into a ref-shaped target and reject malformed/non-function targets, while accepting the target function's own handler as the source of executable behavior. Reject a `handler` field on the tool options/descriptor itself.
- Validate non-empty descriptions, the four v3 side-effect classes, the three approval policies, and optional positive safe-integer timeouts at declaration time. Approval enforcement and engine invocation remain later runtime work.

## Task 3.9 bucket/cache descriptors

- Reuse the shared descriptor base, ID normalization, deep-freeze behavior, and Standard Schema boundary. Buckets expose only visibility, logical profile, positive object-size, and unique media-type policy; caches expose only logical profile, typed key/value schemas, and positive TTL policy.
- Treat `defaultTtlMs` and `maxTtlMs` as declaration bounds and reject a default above the maximum. Validate content types as media-type or wildcard tokens and reject empty/duplicate lists; runtime TTL enforcement, key encoding, object safety, clients, and providers remain Phase 7 scope.
- Keep descriptor output explicitly assembled from approved fields. Unknown fields are not copied, handler fields are rejected, and no provider/client/path/vendor metadata is accepted into the public descriptor.

## Task 3.8 source/export no-subscription guard

- Keep this unit test-only. Reuse the existing package/source layout and event barrel; do not alter the completed event descriptor implementation or add a compiler/provider scan early.
- Scan source files and package manifests for forbidden public names, then inspect the `@zsys/events` runtime export keys directly. The test also exercises negative synthetic inputs so a future public descriptor/type or source suffix fails with a stable finding.
- Use explicit provider-internal path prefixes as the only terminology allowlist. Build forbidden words from fragments so the test's own negative fixtures do not satisfy the repository scope scan; the actual repository remains free of the forbidden public names.

## Task 3.7 event descriptors and triggers

- Reuse the shared descriptor base/freeze/ref contracts, the existing Standard Schema boundary, and the existing job `RetryPolicy` shape. Event declaration validation stays local to the event package; no provider or runtime dependency is introduced.
- Keep selector metadata serializable and compile-oriented: single and `anyOf` store only event ID/version pairs, `match` stores only a validated pattern, and raw `all` requires the explicit `payload: "unknown"` contract with an optional audit/telemetry/development purpose.
- Use conditional envelope types for single and `anyOf` selectors. Pattern and raw-all selectors use an unknown event envelope until later compiler expansion supplies known descriptors.
- Copy function targets into handler-free `FunctionRef` values before placing them on event triggers. This keeps `onEvent` pure metadata even when callers pass a full function descriptor containing the executable handler.
- Validate `*` and `**` as complete dot-delimited segments only; literal segments use the stable event-ID character set. Runtime pattern expansion/matching remains compiler/provider work for later phases.

## Task 3.6 job descriptors

- Reuse the shared descriptor base/freeze utilities and the existing `FunctionRefAny`/Standard Schema contracts. The job package owns declaration metadata only and does not introduce runtime queues, provider clients, registration, or handler execution.
- Keep retry policy explicit with positive attempt/limit bounds, non-negative delay bounds, finite multiplier `>= 1`, and `none`/`full`/`equal` jitter. Reject a maximum delay below the initial delay so the declaration cannot describe an impossible backoff cap.
- Model schedules as frozen metadata with stable IDs, non-empty cron/timezone text, required static input, and `skip`/`allow` overlap. Validate static input with the canonical JSON guard; cron parsing and next-fire calculation remain Phase 8 runtime/compiler work.
- Normalize logical profiles, schedule IDs, and idempotency keys at declaration time. Idempotency retention is a positive safe integer; the key stays a field name/string contract because schema-dependent extraction belongs to the later job provider.
- Reject an own `handler` option and omit handler data from the job's top-level descriptor. The target remains the declared function reference, preserving the function-only authored execution rule.

## Task 3.5 HTTP descriptors

- Keep request mappings as frozen `kind` nodes with only JSON-safe fields; source nodes cover transport locations, wrappers cover nested/optional/default values, and transform nodes store only a normalized transform ID plus their source mapping.
- Expose `defineTransform`/`defineRequestTransform` for named Standard Schema validators. The validator is the only executable contract accepted by the transform declaration; request mappings never retain a validator or arbitrary callback and later compiler work owns deterministic schema projection.
- Middleware stores a stable `middleware` ref, a normal function target, an `http.input` request mapping, and an explicit frozen continue/respond decision. `defineRoute` checks each concrete middleware short-circuit against the route's declared response IDs (and error/validation aliases) without introducing runtime/Hono behavior.
- Reuse the shared descriptor base for routes and the existing function refs/schema contracts for targets. Split HTTP type and validation helpers into route-owned files so every implementation file stays below the 200-line repository limit; no durable tests were added because checkbox `3.15` owns the Phase 2 descriptor test cohort.

## Iterator handoff correction

- Put the project discriminator inside `target`: `target: { type: "project", projectId, environment: { type: "local" } }`. A local same-directory task needs neither a worktree target nor `startingState`.
- Do not use `spawn_agent` or a project-local Cipay subagent when `create_thread` fails. Re-read the live schema, retry once with only `prompt` and `target`, then record a real blocker.
- Treat all earlier nested-worktree payloads and subagent fallbacks below as historical evidence, not current instructions.

## Task 3.1 Gate 1 prerequisite

- Treat committed candidate `6877e5021` as the Gate 1 prerequisite: the exact package-root and focused Phase 1 commands both pass with 20 tests and 317 assertions, and the four forwarding tests plus four goldens are tracked in the candidate.
- Keep checkbox `3.1` read-only for implementation surfaces. Its required output is reproducible Gate 1 evidence plus the task/notes transition; descriptor owners, type fixtures, and `packages/compiler/src/conventions.ts` remain checkbox `3.2` and later scope.
- Use the focused test assertions, public declaration scan, README scan, and golden byte/path checks as the rejection-condition evidence. The candidate and current goldens match byte-for-byte, with no absolute roots or secret values in goldens and no Effect symbols in public declarations/examples.
- Correct the previously recorded diagnostic-golden checksum in the historical Gate 1 notes to the exact `/usr/bin/shasum -a 256` result; this is note accuracy only and does not change the candidate.

## Task 3.2 descriptor foundation

- Extend `@zsys/contracts` with the shared descriptor brand/base rather than duplicating the symbol or guards across descriptor packages. Reuse the existing `DescriptorKind`, `Ref`, and `normalizeId` contracts so identity remains explicit and path-independent.
- Keep `createRef` and `createDescriptorBase` pure: they validate/normalize inputs, copy metadata arrays, and construct frozen values only. `deepFreeze` uses a `WeakSet` and own data descriptors so nested cycles are safe and accessors are never evaluated; it does not read process/file environment values.
- Make guards require the own global brand, supported kind, canonical stable ID, and matching exact reference shape. Optional kind arguments narrow checks without adding package-specific ref types before their owning factory tasks.
- Leave all factory, registration, runtime, provider, and environment behavior to later Phase 2 units. No descriptor package dependency or runtime implementation was added speculatively.

## Task 3.3 function descriptors

- Reuse the shared contracts descriptor base for functions and keep dependency maps as six explicit named categories. Mapped client types have only declared keys, so undeclared context access is a type error without adding an index signature.
- Use Standard Schema `InferInput` for client calls and declared-error creation, `InferOutput` for function handler input/output and event payload results, and `MaybePromise` for plain synchronous or asynchronous handlers. No Effect or runtime type crosses the public boundary.
- Validate timeout and concurrency as positive safe integers and validate dependency refs/errors at factory time; deeply freeze descriptor metadata, maps, refs, and error data so declarations remain immutable.
- Keep declared-error refs local to `@zsys/functions` with kind `error` because the shared v3 `DescriptorKind`/graph-node union intentionally excludes errors. Defer invocation metadata, `AbortSignal`, env, logger, and clock fields to checkbox `3.4`.

## Task 3.4 public function context

- Add Section 7.6's context contracts to `@zsys/functions` and re-export them through the existing function barrel: invocation metadata uses the six documented source values, `signal` is the platform `AbortSignal`, logger methods are synchronous `void`, and clock methods use `Date` plus `Promise<void>` as shown by the v3 examples.
- Keep `ResolvedApplicationEnv` as a readonly string-keyed public record. The Phase 1 config resolver already deep-freezes actual values; this task owns the function-facing contract and must not introduce a duplicate resolver or an Effect dependency.
- Make `test:types` a real root check using a test-only path map and `@ts-expect-error` assertions. The fixture imports Effect only as a type-level negative case, while all shipped public function declarations remain plain TypeScript and Promise-based.

## Task 2.12 decisions

- Keep checkbox `2.12` test-only: reuse the completed diagnostics model/reporter and add no dependency, redaction abstraction, or runtime behavior.
- Use one fixture with absolute source paths under the repository root and a second absolute root. Compare canonical JSON, human text, ANSI-colored text, and CI annotations so the goldens prove project-relative normalization and stable ordering.
- Keep the source excerpt callback in the test so snapshot generation remains deterministic and performs no hidden filesystem reads. Store the plain/color/CI text forms in one JSON golden so ANSI escapes remain portable and Prettier-checked.
- Treat CI annotations as the safe sink: snapshot only code, severity, message, and normalized location fields, and assert suggestion/documentation fields cannot carry the synthetic secret into the annotation.

## Task 2.11 decisions

- Reuse `@zsys/contracts` source-location, stable-ID, and canonical-JSON contracts instead of duplicating path or serialization rules. The diagnostics package therefore declares only that existing workspace dependency and keeps its public values plain TypeScript.
- Keep the public diagnostic shape flat (`file`, `line`, `column`, and `descriptorId`) to match the v3 compiler contract, while accepting a `location` input convenience and a `docs` alias that normalize to the stable `documentationPath` field.
- Normalize and deep-freeze diagnostics at construction; sort related locations and diagnostic collections by project-relative location/content so compiler discovery order cannot change JSON or human output. Source excerpts use a caller-provided relative-path callback, avoiding hidden filesystem reads in compiler, inspector, or CI adapters.
- Use canonical JSON for machine output and GitHub-compatible `notice`/`warning`/`error` annotations for CI. Durable text/JSON snapshots and secret-sink scans remain checkbox `2.12` scope; the focused assertion is sufficient for this non-trivial implementation unit.

## Task 2.10 decisions

- Keep checkbox `2.10` test-only: reuse `@zsys/config`'s existing `defineEnv`, `resolveEnv`, and `projectEnv` seams rather than changing the verified 2.9 resolver or private Effect adapter.
- Store the durable environment contract evidence under `tests/config`: one focused suite, one value-free declaration fixture, and one JSON projection golden. The golden contains metadata only; recursive assertions also scan definition metadata, projection, and serialized snapshots for synthetic secret content.
- Observe declaration purity with explicit `process.env` and `Bun.file` guards plus a narrow source check for process/file APIs. This proves the declaration call is value-free without adding a filesystem/process abstraction or runtime instrumentation to the package.
- No project-local Cipay subagent was used because no callable `multi_agent_v1`/Cipay tool was exposed in this fallback context; the bounded test scope was small enough to complete locally.
- Historical handoff note: the prior worker did not implement checkbox `2.11` because the earlier saved-project/local `create_thread` attempts returned `create_thread received invalid arguments`; the corrected project-target dispatch above is now the authoritative lifecycle path.

- Task `2.9` keeps runtime environment resolution plain and synchronous at its public contract boundary; `resolve.ts` owns parsing, validation, immutable output, and safe projection while `packages/config/src/internal/config.ts` is the only Effect adapter. This lets later runtime code use Effect internally without leaking Effect types or APIs through `@zsys/config`.
- Pin `effect` to `4.0.0-beta.107` because it matches the vendored reference APIs and the worker's verified dependency resolution. The vendored `repos/effect` tree remains reference-only and unmodified.
- The completed 2.9 fallback worker `019ff827-4223-70f1-aff2-cf967768e755` owned only implementation files and the package/lockfile dependency update; the coordinator owns task/lifecycle state and did not widen the unit into task `2.10` tests.
- The normal `create_thread` connector rejected both documented checkbox `2.10` payloads, so the iterator used the required same-checkout `multi_agent_v1` fallback `019ffada-adf6-7343-9c45-10fd3f500bd8` with `fork_context=false`; its single bounded 10-second wait timed out without a reported blocker. This is a lifecycle/tool limitation, not a product decision or implementation blocker.

- Task `2.8` keeps declaration-time environment work dependency-free and side-effect-free. `env.ts` owns the builder DSL, `env-types.ts` owns public type declarations, and `env-json.ts` owns recursive JSON-safe example/value conversion so every implementation file stays under 200 lines; `index.ts` re-exports the documented `@zsys/config` surface.
- Builder metadata is immutable and graph-safe: it records type, required environments, optional/default presence, sensitivity, literal values, descriptions, and safe examples, but never resolved values or default contents. Secret examples use `[redacted]`; default factories remain closures and are not evaluated by `defineEnv`.
- The 2.8 worker implemented locally because no callable project-task or multi-agent connector was exposed. It did not implement 2.9 or later work and alone updated `tasks.md`, `PROGRESS.md`, `DECISIONS.md`, and `BLOCKERS.md`.

- Use `fix/implement-zsys-typescript-poc-v3` in the normal checkout so progress remains visible. Preserve existing planning-artifact edits and the supplied iterator skill; do not stage or commit.
- Middleware is function-backed metadata only: `defineMiddleware` stores a stable ref, normal target function, serializable request mapping, and route-declared continue/respond decision. It never owns a handler or exposes a framework context.
- Route transforms are named stable IDs bound to Standard Schema-compatible validators/transforms. The graph stores only ID and deterministic schema projections; executable validators belong in the hash-matched manifest. Duplicate, missing, or unsupported deterministic transforms are compile errors.
- Environment declarations remain value-free. Evaluation records rules, metadata, sensitivity, and typed `EnvRef` tokens; generation startup resolves values only after immutable validation. Public contracts expose plain values/types/Promises, not Effect types.
- Providers are selected globally per environment and logical profile. Graph metadata contains only safe capability/profile data and non-secret variable names; generation-scoped executable recipes construct one provider set and release it in reverse order.
- Cache topology is local opaque state for development/tests and ElastiCache Serverless for Valkey in AWS, accessed through Bun's native `RedisClient`; canonical JSON keys and generation-local single-flight are required, with no extra Redis SDK/dependency.
- Model execution uses the v3 OpenAI logical profile through a small secret-safe `fetch` adapter owned by `packages/cloud-aws`; no model vendor SDK or public provider-client type is added.
- Iterator boundaries are one fresh same-directory task per checkbox, using Luna at max reasoning when available. Phase gates require a committed candidate, clean review checkout, reproducible evidence, and merged prerequisite; missing Git publication authority is a gate blocker, not a reason to weaken the rule.
- Linear lifecycle hooks are skipped because this repository has no `openspec/linear.yaml` or configured binding. No Linear write is authorized or required for this run.
- Task `1.1` is inventory-only: retain the starter files and all user/planning edits, defer Konsistent configuration until the complete Phase 0 shell cohort exists, and make no implementation or normative-document changes.
- The existing starter checks (`bun run lint`, `bun run check-types`, and `bun run build`) are the baseline evidence for this preflight; later Phase 0 checks must replace the starter scripts and update `AGENTS.md` in the same phase.
- Task `1.2` removes only the five inventoried starter roots after confirming they had no dirty or untracked user files. Their ignored `.next`, `.turbo`, and package-local install links were disposable generated outputs and were removed with those roots; no unrelated path was touched.
- Git cannot represent empty directories, so each requested Phase 0 root is represented by one empty `.gitkeep`; no package manifest, runtime code, or root tooling was added ahead of its owning task.
- The iterator profile set is intentionally minimal: `cipay-implementation.toml` for bounded implementation work, `cipay-branch-review.toml` for the required read-only gate review, and `cipay-db-ledger-engineer.toml` for the iterator's explicit database-migration safety rule. No other project-local profiles were invented.
- Bootstrap delegation was unavailable at task `1.2` start because the project-local profile directory did not exist. The worker created the profiles directly as the task's requested output and used no subagent for this trivial, disjoint filesystem replacement.
- Task `1.3` pins the observed compatible root tool versions exactly: Bun and `@types/bun` `1.3.10`, TypeScript `5.9.2`, Turbo `2.10.9`, Prettier `3.9.6`, ESLint `9.39.5`, and Konsistent `1.0.0-beta.4`. Exact pins make the Phase 0 lockfile reproducible; no runtime dependency is added.
- Keep the root `dev` script as `turbo run dev`, the actual available workspace dispatcher, until the later package/CLI tasks own ZSys supervisor behavior. With no package shells yet, a successful zero-task dispatch is the truthful Phase 0 result; no fake server or placeholder runtime was added.
- Use a minimal root flat ESLint config for JavaScript configuration files and the existing Prettier binary/config. No parser/plugin dependency is added before a package owns TypeScript lint rules; later lint implementation remains task `1.11` scope.
- Keep the root TypeScript project reference list empty until package/app shells exist. The shared base already enforces `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, and `verbatimModuleSyntax`; shell references are task `1.7` scope.
- Add the Konsistent dependency and root command now because task `1.3` owns required structural tooling, but defer `konsistent.json` and its evidence-based audit until the complete shell cohort exists in task `1.8`.
- The task `1.3` read-only profile review found no must-fix issues. Keep the TOML check separate from Prettier because the installed Prettier version has no TOML parser; `Bun.TOML.parse` is the focused syntax/configuration check.
- Task `1.4` uses one uniform public-shell manifest: `@zsys/<name>` at version `0.0.0`, ESM, a root-only `types`/`import` export to `src/index.ts`, and `build`/`check`/`typecheck` scripts backed by the shared TypeScript config. No package dependencies or runtime behavior are introduced.
- Each task `1.4` package contains exactly `package.json`, `tsconfig.json`, and `src/index.ts`; the entry is `export {};` so importing a shell has no registration, environment read, client construction, or other side effect. Build output remains ignored under each package's `dist/` directory.
- Adding the 12 workspace manifests necessarily updates `bun.lock`; the regenerated lockfile contains the new workspace package entries but no runtime dependency. The initial frozen install correctly rejected the pre-shell lockfile, and the regenerated lockfile passed frozen installation.
- A root-level package import smoke is deferred until a dependent workspace fixture exists because the root intentionally has no `@zsys/*` dependencies. Package-local self-reference imports pass, and deep `@zsys/*/src/*` imports are rejected by each shell's export map.
- Task `1.5` applies the same three-file shell convention to the 13 foundation/internal packages: `@zsys/<name>` version `0.0.0`, ESM, root-only `types`/`import` exports to `src/index.ts`, shared TypeScript config, and no dependencies or runtime behavior. This keeps internal ownership explicit without implementing task `1.6` or later package APIs.
- Task `1.5` stayed local because its package cohort is a uniform, trivial filesystem change with no independent specialist scope. Node's package resolver is the export-map smoke authority because Bun's source-workspace resolver permits an existing deep source path during evaluation.
- Task `1.6` reuses the three-file shell convention for `packages/{deploy,deploy-pulumi,cloud-aws,cli,create-zsys}`. The first four package names use `@zsys/<name>`; `create-zsys` remains unscoped because the approved `bunx create-zsys@latest` entry point depends on that published package name.
- Task `1.6` exposes `zsys` from `@zsys/cli` and `create-zsys` from `create-zsys` through manifest `bin` entries pointing at the existing side-effect-free `src/index.ts`. No command implementation, runtime dependency, extra source file, or task `1.7` configuration was added.
- Task `1.6` stayed local because its five package shells are a trivial, uniform filesystem change with no independent specialist scope. Node's package resolver remains the export-map smoke authority for package-local entry imports and deep-source rejection.
- Task `1.7` keeps the four strict options in the shared base and adds one root TypeScript project reference for each app/package. The empty app roots receive only `files: []` configs extending that base; no app runtime or package export surface is introduced ahead of its owning task.
- Task `1.7` stayed local because the reference/configuration change is uniform and mechanically verifiable. The root graph intentionally has no cross-root relative imports; package export resolution and deep-source rejection remain task `1.8` scope.
- Task `1.8` changes every package's root-only export map from source targets to publishable `./dist/index.d.ts` and `./dist/index.js` targets. The two approved bin keys remain unchanged by name and now point at the built `./dist/index.js`; `create-zsys` remains the only unscoped package.
- The export smoke builds and packs `@zsys/app` and `@zsys/compiler`, installs the tarballs in a temporary directory outside the workspace, and uses Node's package resolver because Bun's workspace resolver can accept existing deep source paths. The root exports resolve; `src/index.ts` and `dist/index.js` subpaths fail through the root-only export map. No runtime implementation or extra package dependency was added.
- Konsistent evidence is recorded against the complete 30-package cohort: 30/30 package directories own the three shell files, and 30/30 package entries are pure side-effect-free barrel stubs with no parent/current value imports. The config enforces only those structural patterns; package names/bin fields were intentionally skipped because Konsistent does not inspect JSON. Validation passed and the audit result is reported independently; no post-audit rule weakening was made.
- Task `1.9` uses the installed TypeScript compiler API for import extraction and Bun's native globbing for root/workspace/template discovery. Regex-only source parsing and a new dependency were unnecessary; the parser covers static imports, re-exports, import-equals, dynamic imports, import types, and `require` calls.
- The checker scans `packages/*`, `apps/*`, `templates/*`, and root `scripts/**`; scripts use the root manifest, while app/template dependency declarations are enforced when their own manifest exists. `tests/**` is intentionally outside the ordinary scan because task `1.14` owns persistent negative fixtures that must be invoked as test inputs rather than fail every baseline run.
- Fixture/template imports use the v3 Section 6.2 public application packages as an allowlist for `@zsys/*`; raw Effect/Hono/Next/Pulumi/AWS SDK packages and all other ZSys implementation packages are rejected. Inspector rules allow its own Next.js dependency but reject application packages, the fixture package, and runtime/provider/deployment implementations.
- The parser/discovery helper is split from the CLI only to satisfy the repository's 200-line implementation limit; no reusable framework or configuration layer was introduced. Root verification wiring and permanent boundary fixture coverage remain tasks `1.11` and `1.14` respectively.
- Task `1.10` integrates the scope scan into the existing `scripts/check-boundaries.ts` entry point so the established boundary command cannot silently omit scope enforcement; no second root command or dependency was added.
- The scope scan uses the approved v3 Section 6 package/app/template roots and focused structural/API patterns rather than rejecting ordinary explanatory prose. Its explicit prose allowlist covers the current normative, planning, and historical documentation paths; the scope helper is excluded only from its own content scan to avoid self-matching rule vocabulary.
- Task `1.10` stayed local because the change is a small deterministic checker extension with no independent write scope. Transient negative files were used for validation and removed; persistent fixtures remain task `1.14`.
- Task `1.11` keeps verification in one 125-line `scripts/verify.ts`: current Phase 0 checks are real and ordered, while unavailable test/build suites are visible `NOT RUN` placeholders naming their future phase/task owners. This preserves truthful status without adding dependencies or speculative suite implementations.
- The verifier runs scoped Prettier over repository implementation/config roots, the currently configured ESLint file check, the combined dependency/scope checker, the repository-wide implementation-file ceiling for `apps`, `packages`, `scripts`, and `templates`, `konsistent validate`, the Konsistent audit as separately reported advisory output, root typecheck, and `git diff --check`.
- Full source lint remains a placeholder because Phase 0 has only the root flat ESLint configuration and no TypeScript lint implementation; the direct ESLint configuration check is the current runnable gate. Future suites retain their existing root command names and are not reported as tested.
- Task `1.11` stayed local because the driver has one shared write target and lifecycle artifacts require integration by the worker; no implementation subagent was needed after reading the matching Cipay profile.
- Task `1.12` uses one `quality` CI job with the exact Phase 0 install/typecheck/verify commands and Bun `1.3.10`. Future job names are omitted until their underlying checks exist; successful placeholder jobs would mislead reviewers about Phase 0 coverage.
- Task `1.13` records each approved architecture decision in its own sequential `ZSYS-ADR-001` through `ZSYS-ADR-007` file. The ADRs use `Accepted — reviewed Phase 0 baseline` because the v3 documents are already approved and the records document implementation constraints rather than propose new scope.
- Task `1.14` keeps guardrail coverage in one serial root Bun test with temporary isolated fixtures. This gives every negative boundary/scope case exact path and rule assertions without adding forbidden vocabulary to files scanned by the production scope checker.
- Task `1.14` reuses the existing packed export smoke and verification driver, extracting only the line-limit scan as an import-safe helper. The focused test is a real Phase 0 verify step; later suite placeholders remain unchanged and truthful.

## Task 1.15 ignore policy

- Use root-anchored, directory-specific `.zsys` patterns with trailing slashes so generated/build/runtime data is ignored without broad patterns that could hide checked-in fixtures, goldens, templates, or OpenSpec/review evidence.
- Verify the policy with `git check-ignore --no-index` in the existing Phase 0 guardrail suite; this tests Git's actual matching behavior without creating disposable files or changing tracked state.
- Skip project-local delegation because this is a minimal `.gitignore` plus one focused assertion in the existing test harness; no independent non-trivial scope exists.

## Task 1.16 clean verification

- Preserve the user's dirty worktree while proving a fresh dependency install. The shell safety policy rejected the literal `rm -rf node_modules`, so the exact disposable directory was moved to a recoverable `/tmp` path before `bun install --frozen-lockfile`; the required install/typecheck/verify results and final status capture remained unchanged.
- Treat the 11 later verification suites as not run because the Phase 0 verifier explicitly labels them with their future owners; do not turn placeholder output into Gate 0 evidence.

## Task 1.17 Gate 0 packet

- Keep the review packet in `PROGRESS.md` beside the durable lifecycle notes; no extra review-document format is needed for this evidence-only checkbox.
- Assign the design's package ownership groups to role owners rather than inventing individual names. The v3 sources provide responsibilities, while named release sign-off is a later gate concern.
- Describe `bun.lock` as tracked and frozen-install verified, while explicitly preserving the user's uncommitted checkout. The packet does not claim a commit or stage files.
- Revalidate the passed task 1.16 evidence with the focused Phase 0 guardrail test, typecheck, verify, package-list assertion, tool versions, and strict OpenSpec validation; keep the 11 future suites visibly `NOT RUN`.
- Task `1.18` accepted the Gate 0 rejection review only after the exact workspace, shell, command-alignment, lockfile, import-boundary, fixture, and deployment-engine checks all passed; no implementation change was needed.
- After the task `2.1` prerequisite review passed, dispatch checkbox `2.2` to fallback worker `019ff783-7acd-7453-84be-f41e75a970dd` because the saved-project `codex_app__create_thread` connector rejected its documented arguments. The coordinator made no Phase 1 implementation edits; the single bounded worker snapshot timed out without a result.
- Task `2.2` keeps the JSON boundary in one recursive serializer. `serializeJson` is the implementation and `canonicalJson` is only an alias to that same operation; guards reuse the serializer so validation and canonical output cannot disagree.
- Task `2.2` accepts only finite JSON primitives, ordinary dense arrays, and plain or null-prototype objects. It rejects symbols and accessors, rejects non-JSON object prototypes, tracks only the active recursion path so repeated acyclic references remain valid, and reports stable paths in `JsonValueError` messages.
- The saved-project `codex_app__create_thread` connector remains unavailable after its documented arguments were rejected, so this scoped fallback worker implemented checkbox `2.2` locally. No later checkbox was started or dispatched from this unit.

## Task 2.3 contracts

- Keep stable IDs explicit and path-independent: trim surrounding whitespace, accept only alphanumeric segments separated by `.`, `_`, or `-`, and expose nominal stable/protocol ID types plus typed descriptor refs. Case is preserved so normalization cannot silently merge distinct explicit IDs; style warnings remain a later compiler concern.
- Normalize source paths with a small platform-independent parser so POSIX and Windows separators produce the same project-relative `/` form. Absolute paths must be inside the supplied absolute root; relative paths remain relative and never contribute to identity.
- Use one-based positive integer source coordinates and stable error prefixes (`Invalid stable ID:` and `Invalid source location:`). The contracts barrel re-exports JSON, ID, source-location, and version modules because the package has a root-only export map.
- Set the initial contract, generator, graph, manifest, API, and shared protocol versions to numeric `1`; the v3 sources define these as versioned v1 protocols and do not specify independent later values.
- Keep task `2.3` local: the three files and one barrel are a small, tightly coupled public-contract edit with no independent specialist scope. Task `2.4` owns the durable test matrix.

## Task 2.4 contracts tests

- Keep the canonical contract matrix in `tests/contracts/canonical-contracts.test.ts`, the existing contracts test owner, and import through the contracts barrel so the supported public surface is exercised without adding package scripts or dependencies.
- Assert exact JSON and source/ID error strings at stable paths/prefixes. The invalid-value matrix covers the serializer's explicit JSON boundary rather than relying on native `JSON.stringify` behavior, including accessors, sparse arrays, symbols, cycles, and non-plain objects.
- The ID matrix exposed that the completed 2.3 regex accidentally accepted `:`. Remove that separator from `packages/contracts/src/id.ts`; this is the smallest correction needed for the already-recorded `.`, `_`, `-` grammar and does not expand 2.4 into new contract behavior.
- A project-local implementation subagent was attempted for the single test file, but subagent `019ff7b9-44b9-7ae3-a1ce-0175495af3ec` remained active across bounded waits without writing a file. Close it and complete the same bounded scope locally; lifecycle notes remain worker-owned.
- Preserve the known unscoped `bun test` limitation: the focused contracts suite and Phase 0 suite are the applicable checks while vendored Effect tests require upstream-only dependencies.

## Task 2.5 schema bridge and default builder

- Keep the Standard Schema boundary local and dependency-free. The repository has no installed schema runtime yet, and the v3 public contract only requires the `~standard` v1 shape plus the approved familiar builder; adding a vendor dependency would leak its types or expand the lockfile before a concrete need.
- Mirror the official v1 result/type vocabulary, including optional validator options, input/output type advertising, direct or structured path segments, and the `StandardSchemaV1` namespace aliases. Third-party validators are executed through the same `validate`/`validateSync` helpers and receive path prefixes when nested in a ZSys builder.
- Keep JSON Schema projection out of this unit. The builder intentionally does not invent a `zsys.jsonSchema` result; task `2.6` owns deterministic extraction and the structured unavailable outcome.
- Use a private implementation class behind the exported `Schema` interface. The root package exports plain schema types, `z`, and validation helpers, so no concrete implementation/vendor type is part of the supported authoring contract.
- Split the bridge/runtime and builder/composite helpers into implementation files only to satisfy the repository's 200-line ceiling. The supported package surface remains the root index; no deep source export was added.
- Preserve omission semantics for optional object properties and apply defaults during validation. Defaulting and transformation behavior are implementation support for the v3 examples; durable assertions/goldens remain task `2.7` scope.
- When the project-local subagent did not return a patch after several bounded waits, close it and complete the same non-overlapping scope locally. This avoids waiting indefinitely while preserving the iterator's single-worker file ownership.

## Task 2.6 JSON Schema projection

- Keep projection dependency-free and behind the existing `zsys.jsonSchema` compatibility hook. The repository has no schema vendor dependency, and adding one would expand the public boundary before a concrete runtime need.
- Store built-in projection metadata separately from validation behavior. This lets object/array/union composition preserve deterministic schemas and optional/default semantics without exposing the implementation class or changing the Standard Schema v1 surface.
- Canonicalize third-party and built-in output recursively by sorting object keys and set-like `required` names, while preserving ordered JSON Schema arrays such as `anyOf`/`enum`. `$defs` and `definitions` therefore remain stable without inventing references or deduplication.
- Return the stable `ZSYS_SCHEMA_UNAVAILABLE` code for absent hooks, invalid JSON Schema values, custom refinements, transforms, and non-deterministic default factories. Compiler/source-location diagnostics remain the compiler owner's responsibility.
- Keep task `2.7` responsible for durable schema tests and goldens; this unit leaves its test roots and fixtures untouched.

## Task 2.7 schema tests and goldens

- Keep the schema suite under `tests/schema` and import the official package through its existing public source barrel. The current shared Phase 0 checkout does not create workspace symlinks, and relying on ignored `dist` output would make the test gate depend on generated state.
- Use one third-party fixture with a deterministic `zsys.jsonSchema` hook and a separate compatible fixture without that hook. This proves both Standard Schema validation compatibility and the structured `ZSYS_SCHEMA_UNAVAILABLE` result without adding a schema dependency.
- Keep two JSON goldens: one combines built-in and third-party JSON Schema projections, and one captures sync/async validation, defaults, transforms, and nested issue paths. Comparing serialized parsed JSON preserves key and array order while the repository formatter owns human-readable layout.
- A project-local implementation subagent was attempted for the disjoint `tests/schema/**` scope, but `019ff7ee-3b80-7b63-b446-c384616fb2b2` remained active across three bounded waits without returning a patch and was closed; the worker completed the scope locally.

## Historical iterator connector workaround (superseded)

- Earlier workers used an invalid nested-worktree payload, misclassified the resulting argument errors as a connector outage, and substituted shared-checkout subagents. The iterator handoff correction at the top of this file replaces that workaround.

## Task 2.13 public declaration boundary

- Reuse the shared strict TypeScript declaration settings already inherited by every package. The scanner invokes incremental `tsc -b` for the four Phase 1 public packages so declaration emission is a checked prerequisite rather than relying on ignored, pre-existing `dist` output.
- Treat only declarations reachable from each package's exported `types` entry as public. Follow relative `.d.ts` references so re-exported types are covered while the unexported config adapter is not treated as application API.
- Match the exact forbidden internal symbols required by the v3 boundary (`Effect`, `Layer`, `Context.Tag`, `Schema.Schema`, `Fiber`, and `Cause`) and report project-relative locations. Keep the future `test:types` command reserved for Phase 2 type fixtures; the declaration scan is a distinct root verification step.

## Task 2.14 package documentation

- Keep the examples in the nearest public package READMEs rather than adding duplicate executable fixtures or dependencies. The existing focused tests remain the behavioral evidence for the APIs.
- Use `@zsys/schema` as the documented schema entry point, with `z`, Standard Schema validation, structured issues, and deterministic JSON Schema projection. Do not document internal schema implementations.
- Keep `@zsys/config` declaration and resolution visibly separate: `defineEnv` builds immutable metadata without runtime reads, `projectEnv` is safe metadata, and `resolveEnv` receives an explicit source inside startup code.
- The README snippets contain no process/file value reads or import-time resolution calls. Checkbox `2.15` owns the package-test and Gate 1 evidence run; this unit adds no implementation behavior.

## Task 2.15 Gate 1 evidence

- Keep this checkbox evidence-only. The exact assigned `bun test packages/contracts packages/schema packages/config packages/diagnostics` command was run unchanged and exits `1` because those package roots contain no test files; do not move tests or add package scripts here. The owning Phase 1 suites under `tests/{contracts,schema,config,diagnostics}` pass with 20 tests and 317 assertions.
- Treat the JSON Schema and diagnostic golden assertions as the behavioral evidence: the focused suite reports stable JSON Schema/validation output, cross-root diagnostic text/JSON, and safe CI annotations. Both staged and unstaged Git diffs for the four golden files are empty; the files are untracked in this intentionally uncommitted checkout, so their SHA-256 values are recorded in `PROGRESS.md` instead of claiming a tracked baseline diff.
- Reuse the existing public declaration scanner and its root verification wiring. `bun run scripts/check-public-declarations.ts` emits/scans the four Phase 1 public packages and passes without changing the public boundary. Gate 1 approval/rejection remains task `2.16` scope.

## Task 2.16 Gate 1 decision

- Keep the checkbox evidence-only: the focused Phase 1 roots are sufficient to inspect behavior, but they do not replace the exact Gate 1 reproduction command when that command exits `1` because its package filters match no test files.
- Do not move tests or add package-local scripts in this review. The test-discovery mismatch is a prerequisite follow-up, not permission to broaden the gate unit.
- Reject/hold Gate 1 until the candidate can be reproduced from a committed clean checkout. The current Phase 1 implementation and all four goldens are uncommitted, and the goldens are untracked; the user explicitly prohibited staging or committing here.
- The individual rejection checks pass: canonical JSON and JSON Schema are order-independent, diagnostic output is project-relative across roots, validation issues retain structured paths, secret defaults are absent from serializable metadata, declarations contain no forbidden Effect symbols, and public examples use `@zsys/schema`.
- Mark checkbox `2.16` complete as the review/decision unit while keeping Gate 1 unapproved and blocking `3.1`; no later-phase handoff is made.

## Gate 1 package-root test remediation

- Keep the durable suites under `tests/{contracts,schema,config,diagnostics}` and add one minimal forwarding test entrypoint in each owning package root. The mandated package-root command now discovers the existing suites, while the focused test-root command remains unchanged.
- Use imports rather than copied test files or package scripts: each command runs the same four suites once, avoids duplicate coverage, preserves the existing golden paths, and keeps package source exports unchanged.
- Include the four JSON Schema/diagnostic goldens in the candidate so a committed clean checkout reproduces the passing assertions. This remediation changes test discovery/tracking only; it does not approve Gate 1 or advance checkbox `3.1`.

# Task 15.8 validation decisions

# Task 15.10 template compatibility decisions

- Keep the concrete ZSys template dependency version at `0.0.0`: it matches
  every checked-in package manifest and is the only release identity available
  in this pre-publication workspace. The focused compatibility check compares
  each template entry with its package manifest instead of inventing a registry
  version or a workspace range.
- Keep the Section 21.6 script map identical in all three variants. The
  minimal/API/agent differences belong only to their documented capabilities;
  shared developer commands must not drift between templates.
- Treat the existing public-import boundary scan plus a focused recursive
  template scan as the 15.10 check. Generator substitution, installation,
  packed-project execution, rollback, and output remain owned by 15.11–15.17.

# Task 15.15 generator option-matrix decisions

- Keep the matrix in one root generator test file and drive command execution
  through the existing `GenerateProjectContext` fake runner. This covers
  install/Git/doctor/check sequencing without invoking a real package manager
  or mutating the checkout; packed execution remains task `15.16` scope.
- Compare generated snapshots from two destinations using sorted relative file
  paths, file modes, and bytes. Destination-specific next-step text is not
  treated as generated source content.
- Assemble forbidden scope vocabulary from split strings so the test itself
  remains accepted by the repository scope scanner, matching the existing
  negative-fixture convention.

## Task 15.16 packed smoke decisions

- Keep the smoke run in disposable `/tmp` state and use a tiny local registry
  that serves the exact packed workspace tarballs while proxying public
  dependencies. This proves external installation without changing manifests,
  the lockfile, or the workspace.
- Run the packed `create-zsys` API and packed `zsys create` with one option
  vector, normalize only absolute destination paths in snapshots, and perform
  the second-generation comparison before cleanup.
- Resolve the packed CLI's doctor/check dispatch at the shared command seam so
  the generator's mandatory pre-rename checks exercise the same implementation
  as direct CLI use; do not add 15.17 evidence or later Gate 14 assembly.
- Keep generated-project route tests on the existing public testing seams, and
  keep packed dev route serving in the generated build artifact with graph,
  manifest, and supervisor identity metadata required for clean activation.

# Task 16.19 isolated preview decisions

- Drive the test through the real `LocalWorkspace`/`Stack` Automation API with
  a bounded in-process Pulumi command harness and the local backend. This keeps
  the preview evidence offline and cloud-free while exercising stack
  create/select, event-log ingestion, reports, confirmation, update, and
  repeat-preview behavior.
- Generate a unique stack ID and temporary root per test, and put cleanup in a
  `finally` block with a two-second timeout. The accepted local update seeds
  the second preview's state; the preview and declined destructive update are
  separately asserted to make no cloud mutation.
- Preserve a Pulumi-managed `backend:` stanza when refreshing generated
  `Pulumi.yaml`; the generated project remains deterministic on a fresh root,
  while repeated CLI operations retain the explicitly selected backend.
