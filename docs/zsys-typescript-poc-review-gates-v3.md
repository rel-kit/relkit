# ZSys TypeScript POC — Implementation Review Gates

**Revision:** 3  
**Companion to:** `zsys-typescript-poc-technical-spec-v3.md`  

This document is the merge and phase-approval checklist. It does not replace the technical specification. A phase is approved only when the reviewer can reproduce the required evidence from a clean checkout.

---

## Review rules

Every phase pull request MUST include:

```text
phase number and goal
files/packages changed
public inputs and outputs
failure behavior
graph or generated-output changes
tests executed with results
known limitations
follow-up issues that do not block the phase
```

Reviewers MUST reject a phase when:

```text
implementation introduces an undeclared cross-package dependency
application-facing types expose internal Effect types
runtime behavior is implemented outside the common function engine
source conventions become hard requirements
graph output is non-deterministic
secrets enter graph, logs, traces, fixtures, or snapshots
an event listener becomes a separate application subscription primitive
cloud deployment bypasses Pulumi
acceptance relies only on manual testing
```

Required reviewer roles across the full program:

```text
compiler/graph
runtime/reliability
developer experience
observability/security
inspector/frontend
cloud/deployment
```

One person may cover multiple roles, but each role must sign the final release gate.

---

## Gate 0 — Repository baseline

### Required evidence

- workspace package list matches the specification;
- `bun.lock` is committed;
- package exports prevent internal source imports;
- dependency boundary script is active;
- CI uses frozen installation;
- architectural decisions are recorded.

### Reproduction

```bash
rm -rf node_modules
bun install --frozen-lockfile
bun run typecheck
bun run verify
```

### Reviewer checks

```text
Descriptor packages do not import runtime packages.
Fixture application cannot import internal Effect/Hono/Next/Pulumi packages.
No second deployment engine package exists.
The workspace can be installed without private local state.
```

### Reject when

- a package depends on an undeclared workspace path;
- CI and local verification use different commands;
- a placeholder package exports unreviewed runtime behavior;
- lockfile changes are not explained.

---

## Gate 1 — Contracts, schema, environment, diagnostics

### Required evidence

```text
canonical JSON tests
schema validation and JSON Schema golden tests
Standard Schema compatibility test
environment metadata tests
diagnostic text and JSON snapshots
public declaration Effect-leak scan
```

### Reproduction

```bash
bun test packages/contracts packages/schema packages/config packages/diagnostics
bun run typecheck
```

### Reviewer checks

- environment declaration does not read values at import time;
- secret values cannot be serialized into metadata;
- JSON Schema output is stable;
- absolute paths are removed from golden output;
- public examples use `@zsys/schema`, not Effect Schema.

### Reject when

- validation issues are strings without structured paths;
- schema serialization depends on object insertion order;
- secret defaults can appear in graph metadata;
- public declarations expose Effect types.

---

## Gate 2 — Descriptor factories and conventions

### Required evidence

```text
descriptor brand/freeze tests
type tests for function dependencies
route mapping serialization tests
job policy tests
event selector tests
onEvent trigger tests
tool/agent type tests
all convention warning tests
```

### Reproduction

```bash
bun run test:types
bun test packages/app packages/functions packages/routes packages/jobs packages/events packages/buckets packages/cache packages/tools packages/agents
```

### Reviewer checks

- only functions accept handlers;
- route/job/event trigger/tool descriptors target function refs;
- `onEvent` returns an event-trigger descriptor;
- no public `defineSubscription` exists;
- wrong directories/suffixes produce warnings, not exclusion;
- descriptors contain no provider clients.

### Reject when

- descriptors register globally during import;
- a route or job owns a handler;
- event listener naming introduces `*.subscription.ts`;
- context exposes undeclared dependencies;
- provider vendor names are required in resource descriptors.

---

## Gate 3 — Compiler, graph, and manifest

### Required evidence

```text
all compiler fixtures
determinism across roots and file order
graph hash test
manifest import/handler test
event selector expansion test
graph diff tests
warning/error exit-code tests
```

### Reproduction

```bash
bun run test:compiler
bun run test:types
```

### Reviewer checks

- AST prefilter does not execute code;
- evaluation runs in an isolated child process;
- graph contains only serializable data;
- route and event listener descriptors become generic trigger nodes;
- graph and manifest share the same hash;
- source locations are relative and stable.

### Reject when

- handler closures enter graph JSON;
- event patterns are left unresolved for provider-specific runtime matching;
- timestamps or process IDs affect graph bytes;
- a warning fixture exits non-zero;
- a semantic error still emits an activatable manifest.

---

## Gate 4 — Internal Effect runtime

### Required evidence

```text
sync/async handler bridge tests
error/defect normalization tests
cancellation and timeout tests
scope release tests
log annotation/redaction tests
public declaration scan
```

### Reproduction

```bash
bun test packages/runtime-effect packages/engine
bun run typecheck
```

### Reviewer checks

- application handler signature is plain TypeScript;
- fiber interruption aborts `ctx.signal`;
- public context Promise calls preserve parent trace/deadline;
- all framework logs reach an Effect logger sink;
- redaction happens before every sink.

### Reject when

- application examples import Effect;
- each context method creates an unrelated root trace;
- cancellation is simulated only by timeout flags;
- resources leak after failure or interruption;
- raw causes are exposed publicly.

---

## Gate 5 — Function engine and test harness

### Required evidence

```text
direct invocation tests
input/output validation tests
declared error and defect tests
parent/child trace tests
concurrency and timeout tests
dependency enforcement tests
recursion policy tests
first @zsys/testing examples
```

### Reproduction

```bash
bun test packages/engine packages/testing tests/integration/engine
bun run test:types
```

### Reviewer checks

- one `engine.invoke` path is reusable by all future triggers;
- manifest hash is verified before registration;
- output validation failures are defects;
- child invocations inherit cancellation and deadline;
- test harness creates isolated state and deterministic IDs/time.

### Reject when

- transport-specific execution bypasses the engine;
- context is mutable or reused across invocations;
- output validation exists only in development UI;
- dependency checks rely only on TypeScript and can be forged at runtime.

---

## Gate 6 — Routes, OpenAPI, and client

### Required evidence

```text
HTTP mapping and response tests
route precedence/collision tests
client disconnect cancellation test
request record test
OpenAPI golden
client type tests
internal endpoint version tests
```

### Reproduction

```bash
bun test packages/runtime-hono packages/openapi packages/client-generator tests/integration/http
```

### Reviewer checks

- Hono is created from graph trigger nodes;
- application handlers never receive Hono context;
- request mapping is serializable;
- OpenAPI and client are generated from graph contracts;
- runtime route and OpenAPI operation agree.

### Reject when

- OpenAPI scans Hono internals;
- arbitrary mapping closures are accepted;
- route collision is discovered only at request time;
- body limits/content-type checks are absent;
- disconnect does not cancel the function.

---

## Gate 7 — Global providers, buckets, cache

### Required evidence

```text
global environment/profile resolution tests
bucket provider contract suite
cache provider contract suite
startup/readiness/shutdown tests
profile mismatch diagnostics
dependency edge telemetry tests
```

### Reproduction

```bash
bun run test:contracts
bun test tests/integration/engine
```

### Reviewer checks

- concrete selection is global in `src/app.ts`;
- descriptors contain logical profiles only;
- local bucket prevents traversal and partial visibility;
- cache uses canonical keys and deterministic test clock;
- provider instance lifetime is one generation scope.

### Reject when

- provider is repeated on every resource;
- filesystem paths or vendor SDK types leak into descriptors;
- cache tests use real sleeps;
- unsupported capabilities are silently skipped.

---

## Gate 8 — Jobs and schedules

### Required evidence

```text
job contract suite
retry/test-clock tests
lease expiry tests
dead-letter tests
idempotency tests
schedule/overlap tests
child-process crash and restart tests
malformed-state quarantine test
```

### Reproduction

```bash
bun test tests/contracts/jobs tests/integration/jobs tests/restart/jobs
```

### Reviewer checks

- acceptance is persisted before acknowledgement;
- leases recover after process death;
- handler executes through the common engine;
- duplicate behavior is tested;
- UI/API state matches durable store state.

### Reject when

- documentation claims exactly once;
- retries depend on arbitrary sleep;
- completion is persisted before handler success;
- malformed local state prevents all startup without quarantine.

---

## Gate 9 — Events and event triggers

### Required evidence

```text
event contract suite
single-event and anyOf listener tests
pattern expansion golden test
ephemeral loss test
durable restart and duplicate tests
fan-out failure tests
raw wildcard restriction test
no-subscription-node/source scan
```

### Reproduction

```bash
bun test tests/contracts/events tests/integration/events tests/restart/events
bun run test:types
```

### Reviewer checks

- iii-style separation is retained: function plus trigger;
- public factory is `onEvent`;
- listener target receives versioned envelope;
- one listener failure does not revoke other accepted deliveries;
- durable delivery is at least once;
- graph terminology is event trigger/listener.

### Reject when

- a separate application subscription primitive appears;
- wildcard matching depends on unknown future runtime event names;
- event version is discarded;
- durable acknowledgement precedes successful function completion.

---

## Gate 10 — Tools and agents

### Required evidence

```text
tool schema inheritance tests
allowlist and approval tests
invalid tool argument tests
agent limit/cancellation tests
final output validation tests
fake model scripted tests
trace/capture policy tests
```

### Reproduction

```bash
bun test packages/tools packages/agents tests/integration/agents
```

### Reviewer checks

- tools target functions and contain no handlers;
- model arguments are validated before invocation;
- agent can call only declared tools;
- generated agent function runs through engine;
- merge-blocking tests are network-independent.

### Reject when

- model output is trusted as typed data;
- tool side-effect policy is advisory only;
- prompt/tool results are stored by default;
- model vendor details are required in agent descriptor.

---

## Gate 11 — Observability

### Required evidence

```text
request/log/span correlation tests
all failure outcome records
segment rotation/repair/retention tests
SSE cursor/reconnect tests
body-capture policy tests
recursive secret scan
```

### Reproduction

```bash
bun test packages/observability tests/integration/observability tests/security/redaction
```

### Reviewer checks

- redaction occurs before terminal, disk, API, and SSE;
- retention is bounded;
- request and trace IDs agree across signals;
- request body capture is off by default;
- startup repairs a truncated final segment safely.

### Reject when

- any raw synthetic secret appears;
- storage grows without configured bounds;
- inspector API reconstructs traces from terminal text;
- SSE has no reconnect cursor or backpressure behavior.

---

## Gate 12 — Supervisor and inspector API

### Required evidence

```text
candidate compile/start/readiness failure tests
graph-hash mismatch test
atomic switch test
old request drain/cancel tests
generation SSE test
all inspector endpoint contract tests
production protection tests
```

### Reproduction

```bash
bun test packages/supervisor packages/inspector-api tests/inspector
```

### Reviewer checks

- active generation survives every candidate failure;
- generated directories are isolated by generation;
- proxy switch is atomic;
- inspector APIs are versioned;
- local administrative actions are safety-checked.

### Reject when

- watcher kills active backend before candidate verification;
- UI would need direct provider-file access;
- readiness checks only process existence;
- production exposes local controls by default.

---

## Gate 13 — Next.js inspector

### Required evidence

```text
required-page coverage
route composer E2E
live request/log update E2E
function dependency/edge assertions
event trigger terminology assertion
job local action tests
agent timeline test
diagnostics with active-generation test
source-link and accessibility tests
```

### Reproduction

```bash
bun run test:inspector
bun run test:e2e
```

### Reviewer checks

- UI consumes only inspector APIs;
- active graph hash is visible;
- request detail correlates logs and spans;
- source links are project-relative;
- sensitive data is hidden by default;
- invalid candidate diagnostics do not blank the UI.

### Reject when

- UI imports runtime/application handlers;
- browser receives secret values or provider clients;
- tests rely only on screenshots;
- event UI introduces a separate subscription resource.

---

## Gate 14 — CLI and project creation

### Required evidence

```text
CLI help/exit-code/JSON tests
generator option matrix
temporary-directory rollback test
packed-package project generation
frozen reinstall
generated check/typecheck/test/build/dev smoke
forbidden-import scan
```

### Reproduction

```bash
bun test packages/cli packages/create-zsys tests/generator
bun run scripts/pack-and-smoke-create-zsys.ts
```

### Reviewer checks

- generated project matches documented tree;
- exact compatible versions are written;
- install/check succeed before final rename;
- printed next commands work;
- generated application uses plain async handlers.

### Reject when

- generator works only through workspace links;
- a failure leaves a partial destination;
- version placeholders remain;
- generated source imports internal Effect/Hono/Next/Pulumi.

---

## Gate 15 — Pulumi and AWS

### Required evidence

```text
deployment plan goldens
Pulumi mock resource tests
stable naming/tag tests
preview report test
IAM policy snapshots
container readiness/shutdown tests
isolated AWS smoke/no-op/destroy evidence
file-move no-replacement evidence
```

### Reproduction

```bash
bun run test:deployment
zsys deploy preview --stack <isolated-stack> --non-interactive
```

Release/nightly:

```bash
bun run test:aws-integration
```

### Reviewer checks

- deployment plan is independent of Pulumi types;
- Automation API drives preview/up/destroy;
- stable descriptor IDs determine resource identity;
- secrets are managed by Pulumi/deployment environment and not graph JSON;
- cloud resources map to declared capabilities;
- cleanup is verified.

### Reject when

- graph contains Pulumi Inputs/Outputs;
- source path changes replace resources;
- a second infrastructure state system is introduced;
- deployment requires another IaC engine;
- AWS SDK types leak into application packages.

---

## Gate 16 — Final release acceptance

### Required evidence

```text
clean frozen install
full verify output
Playwright output
container test output
packed create-zsys smoke output
performance baseline
secret scan
public declaration scan
generated artifact checksum list
isolated AWS acceptance and destroy report
completed release checklist
```

### Reproduction

```bash
bun install --frozen-lockfile
bun run verify
bun run test:e2e
bun run test:container
bun run scripts/pack-and-smoke-create-zsys.ts
bun run test:deployment
```

### Final reviewer questions

```text
Can a new developer create and run a project using only the docs?
Does every execution source converge on the function engine?
Does the inspector show exactly the active graph?
Can request logs and traces be previewed live?
Are event listeners modeled as triggers rather than a separate primitive?
Is Effect fully internal to the public developer experience?
Is Pulumi the only deployment engine?
Do file moves preserve stable graph/cloud identity?
Can durable jobs/events recover with documented duplicate semantics?
Did recursive secret scans pass?
Can the cloud acceptance stack be destroyed cleanly?
```

### Approval

The release candidate requires recorded approval from:

```text
Compiler/graph owner: ____________________
Runtime/reliability owner: ________________
Developer-experience owner: ______________
Observability/security owner: _____________
Inspector/frontend owner: _________________
Cloud/deployment owner: ___________________
Release owner: ____________________________
```
