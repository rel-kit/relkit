# ZSys TypeScript POC — Technical Architecture and Implementation Specification

**Revision:** 3  
**Status:** Approved implementation baseline after final scope refinement  
**Runtime:** TypeScript on Bun  
**Internal HTTP runtime:** Hono  
**Internal execution kernel:** Effect  
**Inspector:** Next.js  
**Deployment engine:** Pulumi  
**First cloud target:** AWS

---

## 1. Purpose and normative language

This document is the implementation specification for the first ZSys proof of concept. It is written for engineers who will build the framework, including junior engineers who need explicit file responsibilities, dependencies, inputs, outputs, expected behavior, test commands, and completion criteria.

The words **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, and **MAY** are normative:

- **MUST / MUST NOT**: required for the POC to be accepted.
- **SHOULD / SHOULD NOT**: the preferred implementation; deviation requires a written reason in the pull request.
- **MAY**: optional and must not block the POC.

This revision replaces earlier ZSys POC specifications wherever they conflict with it.

---

## 2. Final decisions

### 2.1 In scope

ZSys manages these application concepts:

```text
application
functions
routes
jobs and schedules
events and event listeners
buckets
cache
tools
agents
environment contracts
global provider configuration
application graph
runtime planning and materialization
local development supervisor
request logs, logs, and traces
Next.js inspector
OpenAPI and generated TypeScript HTTP client
project scaffolding
Pulumi deployment planning and execution
AWS runtime providers
```

### 2.2 Explicitly outside this POC

The POC does not define persistence models, identity models, workflow orchestration, knowledge stores, a plugin system, an extension marketplace, or Rust components.

Application developers remain free to use ordinary libraries from their own code. ZSys does not inspect or model those libraries in the application graph.

### 2.3 No public Effect requirement

Effect is the internal execution kernel of ZSys. An application developer writes normal TypeScript:

```ts
handler: async (input, ctx) => {
  ctx.log.info("processing order", { orderId: input.orderId });
  return { accepted: true };
};
```

Application developers do **not** need to:

```text
import Effect
use Effect Schema
return Effect values
write Effect.gen
yield* services
construct Layers
understand fibers
```

The public schema boundary accepts Standard Schema-compatible schemas. The scaffold uses `@zsys/schema`; it is not Effect Schema.

### 2.4 Pulumi is the deployment decision

Pulumi is the only infrastructure engine in this POC. The deployment pipeline is:

```text
application graph
      ↓
provider-neutral deployment plan
      ↓
Pulumi program generated in memory or in .zsys/generated
      ↓
Pulumi preview / up / destroy
      ↓
AWS resources
```

No alternative infrastructure engine is evaluated or implemented during the POC.

### 2.5 Event listeners are trigger bindings, not a new primitive

ZSys exposes:

```ts
defineEvent(...)
onEvent(eventSelector, ...)
```

`onEvent(...)` creates a generic trigger binding from an event selector to a function. It does not create a separate `subscription` domain primitive or a `*.subscription.ts` convention.

Internally, a provider may use a broker subscription, queue, topic rule, or in-process listener. That is provider implementation detail.

---

## 3. Developer mental model

A ZSys developer should learn five ideas.

### 3.1 A function is the only authored executable unit

Only a function owns a user-written handler:

```ts
export const sendReceipt = defineFunction({
  id: "receipts.send",
  input: SendReceiptInput,
  output: SendReceiptOutput,

  handler: async (input, ctx) => {
    ctx.log.info("sending receipt", { orderId: input.orderId });
    return { sent: true };
  },
});
```

Routes, jobs, event listeners, and tools target functions:

```text
HTTP route ─────────► function
job execution ──────► function
event trigger ──────► function
tool call ──────────► function
agent invocation ───► generated internal function
```

### 3.2 Descriptors are declarations, not registrations

Application files export pure descriptors:

```ts
defineFunction(...)
defineRoute(...)
defineJob(...)
defineEvent(...)
onEvent(...)
defineBucket(...)
defineCache(...)
defineTool(...)
defineAgent(...)
```

Application code MUST NOT register directly with Hono, a queue, an event broker, Effect, Next.js, or Pulumi.

### 3.3 The compiler builds one canonical graph

The compiler discovers descriptors and produces:

```text
.zsys/generated/application.graph.json
.zsys/generated/runtime.manifest.ts
.zsys/generated/openapi.json
.zsys/generated/client.ts
.zsys/generated/diagnostics.json
```

The graph is serializable. The runtime manifest contains executable handler references and provider factories.

### 3.4 The graph drives runtime registration

The graph does not itself execute code. The runtime planner converts graph nodes into a deterministic registration plan. Materializers apply that plan to Hono, job providers, event providers, bucket providers, cache providers, agent providers, and observability services.

### 3.5 Providers are global

A bucket, cache, job, event, or agent descriptor describes logical behavior. Concrete infrastructure is selected globally in `src/app.ts`, with optional logical profiles such as `default`, `archive`, or `low-latency`.

---

## 4. End-to-end architecture

### 4.1 Compile-time flow

```text
src/**/*.ts
    │
    ▼
AST candidate discovery
    │
    ▼
isolated descriptor evaluation
    │
    ▼
normalization and validation
    │
    ├── convention warnings
    ├── semantic errors
    └── source locations
    │
    ▼
canonical application graph
    │
    ├── graph hash
    ├── runtime manifest
    ├── OpenAPI
    ├── TypeScript client
    └── inspector metadata
```

### 4.2 Runtime flow

```text
application graph + runtime manifest
               │
               ▼
       graph-hash verification
               │
               ▼
        registration planner
               │
     ┌─────────┼───────────┬───────────┬────────────┐
     ▼         ▼           ▼           ▼            ▼
  Hono     job runtime  event runtime  resources  agent runtime
     └─────────┴───────────┴───────────┴────────────┘
               │
               ▼
        Effect execution kernel
               │
               ▼
       logs, spans, request records
```

### 4.3 Development topology

The default `zsys dev` command starts a supervisor process that owns two child generations:

```text
zsys supervisor
├── active backend generation
│   ├── Bun runtime
│   ├── Hono server
│   ├── local jobs/events
│   └── observability endpoint
└── Next.js inspector
```

On source changes, the supervisor builds and verifies a candidate backend before switching traffic. A compilation failure leaves the last valid backend running.

### 4.4 Production topology

The first production topology is:

```text
AWS Application Load Balancer
             │
             ▼
Bun + Hono service on ECS/Fargate
             │
   ┌─────────┼──────────┬─────────────┬──────────────┐
   ▼         ▼          ▼             ▼              ▼
  SQS   EventBridge     S3      managed cache    model APIs
```

Pulumi creates and updates these resources from the deployment plan.

---

## 5. Application repository structure

### 5.1 Recommended structure

```text
src/
├── app.ts
├── env.ts
├── routes/
│   └── **/*.route.ts
├── functions/
│   └── **/*.function.ts
├── jobs/
│   └── **/*.job.ts
├── events/
│   └── **/*.event.ts
├── buckets/
│   └── **/*.bucket.ts
├── cache/
│   └── **/*.cache.ts
├── tools/
│   └── **/*.tool.ts
├── agents/
│   └── **/*.agent.ts
├── middleware/
│   └── **/*.middleware.ts
└── shared/
    ├── schemas/
    ├── types/
    └── utilities/

tests/
├── unit/
├── integration/
├── contract/
├── e2e/
└── fixtures/

zsys.config.ts
package.json
tsconfig.json
.env.example
.gitignore
```

### 5.2 File suffix conventions

| Descriptor                      | Recommended suffix | Recommended directory |
| ------------------------------- | ------------------ | --------------------- |
| Function                        | `*.function.ts`    | `src/functions`       |
| Route                           | `*.route.ts`       | `src/routes`          |
| Job                             | `*.job.ts`         | `src/jobs`            |
| Event contract or event trigger | `*.event.ts`       | `src/events`          |
| Bucket                          | `*.bucket.ts`      | `src/buckets`         |
| Cache                           | `*.cache.ts`       | `src/cache`           |
| Tool                            | `*.tool.ts`        | `src/tools`           |
| Agent                           | `*.agent.ts`       | `src/agents`          |
| Middleware                      | `*.middleware.ts`  | `src/middleware`      |

There is no `*.subscription.ts` convention.

### 5.3 Conventions are warnings

The compiler discovers descriptors by their runtime brand, not by their path. This is valid:

```ts
// src/shared/assets.ts
export default defineBucket({
  id: "assets",
  visibility: "private",
});
```

It produces a warning similar to:

```text
ZSYS_CONVENTION_DIRECTORY
Descriptor "assets" has kind "bucket".
Recommended location: src/buckets/**/*.bucket.ts
The descriptor remains included in the graph.
```

Convention warnings MUST NOT prevent development, build, test, or deployment unless a repository independently promotes warnings to errors in CI.

### 5.4 Semantic failures are errors

The compiler MUST fail for:

```text
duplicate stable IDs
route method/path collision
missing target function
schema that cannot produce JSON Schema
incompatible route-to-function input mapping
incompatible event-to-function input
unknown provider profile
invalid cron expression
invalid retry policy
function direct-call cycle that violates policy
missing executable handler in the runtime manifest
graph and manifest hash mismatch
```

### 5.5 Export convention

A descriptor file SHOULD have one default descriptor export. Named exports MAY expose schemas, references, selectors, or helpers.

```ts
export const orderCreated = defineEvent(...);
export default orderCreated;
```

Multiple descriptors in one file are valid but produce an informational warning when they represent unrelated concepts.

---

## 6. Framework repository and package architecture

### 6.1 Recommended monorepo

```text
apps/
└── inspector/

examples/
└── commerce/

packages/
├── app/
├── schema/
├── config/
├── contracts/
├── diagnostics/
├── graph/
├── functions/
├── routes/
├── jobs/
├── events/
├── buckets/
├── cache/
├── tools/
├── agents/
├── compiler/
├── engine/
├── runtime-effect/
├── runtime-hono/
├── providers-local/
├── observability/
├── supervisor/
├── inspector-api/
├── openapi/
├── client-generator/
├── testing/
├── deploy/
├── deploy-pulumi/
├── cloud-aws/
├── cli/
└── create-zsys/

templates/
└── default/
```

### 6.2 Public application packages

| Package           | Responsibility                                                   |
| ----------------- | ---------------------------------------------------------------- |
| `@zsys/app`       | `defineApp` and re-exports for common descriptor factories       |
| `@zsys/schema`    | supported schema builder plus Standard Schema bridge             |
| `@zsys/config`    | environment declaration DSL                                      |
| `@zsys/functions` | function, error, and reference contracts                         |
| `@zsys/routes`    | HTTP route declaration and mapping DSL                           |
| `@zsys/jobs`      | job and schedule declarations                                    |
| `@zsys/events`    | event contracts, selectors, `onEvent`, and publishing references |
| `@zsys/buckets`   | logical bucket declarations                                      |
| `@zsys/cache`     | typed cache declarations                                         |
| `@zsys/tools`     | function-to-tool declarations                                    |
| `@zsys/agents`    | agent declarations and model profiles                            |
| `@zsys/testing`   | application test harness and provider fakes                      |

`@zsys/app` SHOULD re-export the common surface so a generated project normally needs only:

```ts
import {
  defineApp,
  defineFunction,
  defineRoute,
  defineJob,
  defineEvent,
  onEvent,
  defineBucket,
  defineCache,
  defineTool,
  defineAgent,
} from "@zsys/app";
```

### 6.3 Internal packages

| Package                 | Responsibility                                                       |
| ----------------------- | -------------------------------------------------------------------- |
| `@zsys/contracts`       | JSON values, branded IDs, source locations, versioned protocol types |
| `@zsys/diagnostics`     | structured errors and warnings                                       |
| `@zsys/graph`           | normalized graph schema, hashing, sorting, compatibility diff        |
| `@zsys/compiler`        | discovery, evaluation, normalization, code generation                |
| `@zsys/engine`          | invocation protocol, lifecycle, concurrency, cancellation            |
| `@zsys/runtime-effect`  | Effect runtime, Layers, internal error causes, loggers, tracing      |
| `@zsys/runtime-hono`    | graph-driven Hono materialization                                    |
| `@zsys/providers-local` | local bucket, cache, jobs, events, and fake model providers          |
| `@zsys/observability`   | request records, logs, traces, storage, query protocol               |
| `@zsys/supervisor`      | candidate generation, readiness, switching, draining                 |
| `@zsys/inspector-api`   | versioned inspector HTTP/SSE protocol                                |
| `@zsys/deploy`          | provider-neutral deployment plan                                     |
| `@zsys/deploy-pulumi`   | Pulumi Automation API integration                                    |
| `@zsys/cloud-aws`       | AWS runtime providers and Pulumi resource mapping                    |
| `@zsys/cli`             | `zsys` commands and terminal UX                                      |
| `create-zsys`           | new-project generator                                                |

### 6.4 External implementation dependencies

These dependencies are hidden behind ZSys packages in generated applications:

| Dependency                                   | Used by                                                           |
| -------------------------------------------- | ----------------------------------------------------------------- |
| `effect`                                     | internal execution, lifecycle, logs, tracing, config, concurrency |
| `hono`                                       | internal HTTP runtime                                             |
| `zod` or equivalent supported implementation | `@zsys/schema` default builder                                    |
| `typescript`                                 | compiler AST, type checks, declaration emission                   |
| `next`, `react`, `react-dom`                 | inspector application                                             |
| `@pulumi/pulumi`                             | deployment engine and Automation API                              |
| `@pulumi/aws`                                | primary AWS resource provider                                     |
| `@pulumi/awsx`                               | selected high-level ECS/network components                        |
| `playwright`                                 | inspector browser tests                                           |

Application packages MUST NOT require the developer to import Effect, Hono, Next.js, or Pulumi.

### 6.5 Dependency direction

```text
public descriptors
      ↓
contracts / schema / diagnostics
      ↓
compiler → graph → generated manifest
      ↓
planner / engine
      ↓
runtime-effect + materializers + providers
      ↓
CLI / supervisor / inspector / deployment
```

A lower layer MUST NOT import a higher layer. In particular:

- descriptor packages MUST NOT import runtime packages;
- graph packages MUST NOT import Hono or Pulumi;
- providers MUST NOT mutate the graph;
- the inspector MUST consume versioned APIs, not import live runtime objects;
- deployment MUST consume the deployment plan, not inspect source files.

---

## 7. Public TypeScript contracts

### 7.1 Basic utility types

```ts
export type MaybePromise<T> = T | Promise<T>;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue };
```

### 7.2 Standard Schema boundary

```ts
export interface ZsysSchema<TInput = unknown, TOutput = TInput> {
  readonly "~standard": {
    readonly version: 1;
    readonly vendor: string;
    readonly validate: (
      value: unknown,
    ) =>
      | { readonly value: TOutput }
      | { readonly issues: readonly StandardIssue[] }
      | Promise<{ readonly value: TOutput } | { readonly issues: readonly StandardIssue[] }>;
  };

  readonly zsys?: {
    readonly jsonSchema?: () => JsonValue;
  };
}
```

The official scaffold uses:

```ts
import { z } from "@zsys/schema";
```

Other Standard Schema-compatible libraries MAY be accepted if ZSys can obtain or generate the required JSON Schema. Effect Schema is not required or exposed by the scaffold.

### 7.3 Stable IDs and references

```ts
export type DescriptorKind =
  | "app"
  | "function"
  | "route"
  | "job"
  | "event"
  | "event-trigger"
  | "bucket"
  | "cache"
  | "tool"
  | "agent";

export interface Ref<Kind extends DescriptorKind, Id extends string> {
  readonly kind: Kind;
  readonly id: Id;
}
```

IDs MUST be explicit. File paths are not IDs because paths change during refactoring.

### 7.4 Descriptor brand

```ts
export const ZSYS_DESCRIPTOR = Symbol.for("zsys.descriptor");

export interface DescriptorBase<Kind extends DescriptorKind, Id extends string> {
  readonly [ZSYS_DESCRIPTOR]: true;
  readonly kind: Kind;
  readonly id: Id;
  readonly title?: string;
  readonly description?: string;
  readonly tags?: readonly string[];
  readonly ref: Ref<Kind, Id>;
}
```

Factories MUST deeply freeze descriptors in development to detect accidental mutation.

### 7.5 Declared function dependencies

```ts
export interface FunctionDependencies {
  readonly functions?: Readonly<Record<string, FunctionRefAny>>;
  readonly jobs?: Readonly<Record<string, JobRefAny>>;
  readonly events?: Readonly<Record<string, EventRefAny>>;
  readonly buckets?: Readonly<Record<string, BucketRefAny>>;
  readonly cache?: Readonly<Record<string, CacheRefAny>>;
  readonly agents?: Readonly<Record<string, AgentRefAny>>;
}
```

Dependencies give the compiler graph edges and give the handler a narrowly typed context.

Example:

```ts
dependencies: {
  events: { orderCreated },
  jobs: { sendReceipt },
  cache: { prices },
}
```

### 7.6 Public function context

```ts
export interface FunctionContext<D extends FunctionDependencies> {
  readonly invocation: {
    readonly id: string;
    readonly parentId?: string;
    readonly traceId: string;
    readonly startedAt: string;
    readonly deadline?: string;
    readonly attempt: number;
    readonly source: "direct" | "http" | "job" | "event" | "tool" | "agent";
  };

  readonly signal: AbortSignal;
  readonly env: ResolvedApplicationEnv;
  readonly log: PublicLogger;
  readonly time: PublicClock;

  readonly functions: FunctionClients<D["functions"]>;
  readonly jobs: JobClients<D["jobs"]>;
  readonly events: EventClients<D["events"]>;
  readonly buckets: BucketClients<D["buckets"]>;
  readonly cache: CacheClients<D["cache"]>;
  readonly agents: AgentClients<D["agents"]>;
}
```

All asynchronous context operations return Promises. Logging methods return `void`.

```ts
export interface PublicLogger {
  trace(message: string, fields?: Readonly<Record<string, unknown>>): void;
  debug(message: string, fields?: Readonly<Record<string, unknown>>): void;
  info(message: string, fields?: Readonly<Record<string, unknown>>): void;
  warn(message: string, fields?: Readonly<Record<string, unknown>>): void;
  error(message: string, fields?: Readonly<Record<string, unknown>>): void;
}
```

### 7.7 Error declaration

```ts
export const OrderNotFound = defineError({
  id: "orders.not-found",
  data: z.object({
    orderId: z.string().uuid(),
  }),
  message: ({ orderId }) => `Order ${orderId} was not found`,
  http: { status: 404 },
  retry: "never",
});
```

A handler throws a declared error:

```ts
throw OrderNotFound.create({ orderId: input.orderId });
```

The runtime distinguishes:

```text
declared application error
provider error
cancellation
timeout
unexpected defect
```

Unexpected defects are logged with internal detail but returned through a safe generic envelope.

### 7.8 Function descriptor

```ts
export interface FunctionDescriptor<
  Id extends string,
  Input,
  Output,
  Dependencies extends FunctionDependencies,
> extends DescriptorBase<"function", Id> {
  readonly input: ZsysSchema<unknown, Input>;
  readonly output: ZsysSchema<unknown, Output>;
  readonly errors?: readonly ErrorDescriptorAny[];
  readonly dependencies?: Dependencies;
  readonly timeoutMs?: number;
  readonly concurrency?: number;
  readonly handler: (input: Input, context: FunctionContext<Dependencies>) => MaybePromise<Output>;
}
```

### 7.9 Route descriptor

```ts
export interface RouteDescriptor<Id extends string> extends DescriptorBase<"route", Id> {
  readonly method: HttpMethod;
  readonly path: string;
  readonly target: FunctionRefAny;
  readonly request: HttpRequestMapping;
  readonly responses: readonly HttpResponseMapping[];
  readonly middleware?: readonly MiddlewareRef[];
  readonly timeoutMs?: number;
}
```

A route contains no handler.

### 7.10 Job descriptor

```ts
export interface JobDescriptor<Id extends string, Input> extends DescriptorBase<"job", Id> {
  readonly input: ZsysSchema<unknown, Input>;
  readonly target: FunctionRefAny;
  readonly profile?: string;
  readonly retry: RetryPolicy;
  readonly timeoutMs?: number;
  readonly concurrency?: number;
  readonly schedule?: readonly ScheduleDefinition[];
  readonly idempotency?: IdempotencyDefinition<Input>;
}
```

A job contains no handler.

### 7.11 Event contract

```ts
export interface EventDescriptor<
  Id extends string,
  Version extends number,
  Payload,
> extends DescriptorBase<"event", Id> {
  readonly version: Version;
  readonly payload: ZsysSchema<unknown, Payload>;
  readonly sensitiveFields?: readonly string[];
}
```

### 7.12 Event trigger descriptor

```ts
export interface EventTriggerDescriptor<Id extends string> extends DescriptorBase<
  "event-trigger",
  Id
> {
  readonly selector: EventSelector;
  readonly target: FunctionRefAny;
  readonly delivery: "ephemeral" | "durable";
  readonly profile?: string;
  readonly retry?: RetryPolicy;
  readonly concurrency?: number;
}
```

The public factory is `onEvent`:

```ts
export const sendReceiptWhenOrderCreated = onEvent(orderCreated, {
  id: "receipts.on-order-created",
  target: sendReceipt,
  delivery: "durable",
});
```

### 7.13 Bucket and cache descriptors

```ts
export interface BucketDescriptor<Id extends string> extends DescriptorBase<"bucket", Id> {
  readonly profile?: string;
  readonly visibility: "private" | "public";
  readonly maxObjectBytes?: number;
  readonly allowedContentTypes?: readonly string[];
}

export interface CacheDescriptor<Id extends string, Key, Value> extends DescriptorBase<
  "cache",
  Id
> {
  readonly profile?: string;
  readonly key: ZsysSchema<unknown, Key>;
  readonly value: ZsysSchema<unknown, Value>;
  readonly defaultTtlMs?: number;
  readonly maxTtlMs?: number;
}
```

### 7.14 Tool descriptor

A tool is a constrained view of a function:

```ts
export interface ToolDescriptor<Id extends string> extends DescriptorBase<"tool", Id> {
  readonly target: FunctionRefAny;
  readonly description: string;
  readonly sideEffect: "none" | "read" | "write" | "external";
  readonly approval: "never" | "on-write" | "always";
  readonly timeoutMs?: number;
}
```

### 7.15 Agent descriptor

```ts
export interface AgentDescriptor<Id extends string, Input, Output> extends DescriptorBase<
  "agent",
  Id
> {
  readonly input: ZsysSchema<unknown, Input>;
  readonly output: ZsysSchema<unknown, Output>;
  readonly modelProfile: string;
  readonly instructions: string | PromptTemplate;
  readonly tools: readonly ToolRefAny[];
  readonly limits: {
    readonly maxSteps: number;
    readonly maxToolCalls: number;
    readonly timeoutMs: number;
  };
}
```

### 7.16 Application descriptor

```ts
export interface AppDescriptor<Id extends string> extends DescriptorBase<"app", Id> {
  readonly env: EnvDescriptorAny;
  readonly providers: ProviderSets;
  readonly observability?: ObservabilityConfiguration;
  readonly defaults?: ApplicationDefaults;
}
```

---

## 8. Effect as the internal ZSys kernel

### 8.1 Boundary rule

Application handlers return plain values or Promises. Every handler is converted into an internal Effect program at the invocation boundary.

```ts
const internalProgram = invokeUserHandler({
  handler,
  input,
  publicContext,
});
```

Conceptual implementation:

```ts
function invokeUserHandler<I, O>(options: {
  handler: (input: I, ctx: PublicContext) => MaybePromise<O>;
  input: I;
  publicContext: PublicContext;
}): Effect.Effect<O, InvocationFailure> {
  return Effect.async<O, InvocationFailure>((resume) => {
    const controller = new AbortController();
    const context = withSignal(options.publicContext, controller.signal);

    Promise.resolve()
      .then(() => options.handler(options.input, context))
      .then(
        (value) => resume(Effect.succeed(value)),
        (cause) => resume(Effect.fail(normalizeFailure(cause))),
      );

    return Effect.sync(() => controller.abort());
  });
}
```

The production implementation MUST preserve the parent invocation context, trace context, deadline, scope, and logging annotations when public context methods call internal services.

### 8.2 Why Effect remains valuable internally

Effect provides a uniform implementation substrate for:

```text
provider construction and release
structured concurrency
fiber interruption
request cancellation
deadlines and timeouts
retry schedules
resource scopes
internal typed failures
test clocks
structured logs
spans and trace propagation
bounded queues
local pub/sub
supervisor lifecycle
```

These benefits remain internal and do not dictate application syntax.

### 8.3 Public context bridge

Every public Promise-returning context operation delegates to the active internal runtime through an invocation bridge:

```ts
interface InvocationBridge {
  run<A>(operation: InternalOperation<A>): Promise<A>;
  runVoid(operation: InternalOperation<void>): Promise<void>;
  log(level: LogLevel, message: string, fields?: unknown): void;
}
```

The bridge MUST:

1. attach the current invocation ID and trace ID;
2. create a child span;
3. inherit the current deadline;
4. propagate cancellation to the provider operation;
5. normalize provider failures into safe public errors;
6. prevent a context client from accessing undeclared dependencies;
7. record observed graph edges for the inspector.

### 8.4 Logging

All ZSys framework and CLI logs MUST enter the Effect logging system. Application code logs through `ctx.log`.

Disallowed in framework code except inside the final logger sink:

```ts
console.log(...)
console.error(...)
process.stdout.write(...)
process.stderr.write(...)
```

The logger MUST support:

```text
human-readable development output
structured JSON production output
log level filtering
secret redaction
request and invocation correlation
source component annotation
span timing
SSE streaming to the inspector
bounded local retention
```

### 8.5 Cancellation

When an HTTP client disconnects, a timeout expires, the supervisor drains a generation, or a shutdown begins, the internal Effect fiber is interrupted and the public `ctx.signal` is aborted.

User code SHOULD pass `ctx.signal` to external APIs that accept an `AbortSignal`.

### 8.6 Time

Application code uses:

```ts
const now = ctx.time.now();
await ctx.time.sleep(500);
```

The implementation uses Effect Clock, allowing deterministic tests with a test clock.

### 8.7 Errors

Public handlers throw normal errors. The boundary maps them as follows:

```text
instance created by defineError → declared failure
AbortError / aborted signal     → cancellation
provider public error           → provider failure
anything else                   → unexpected defect
```

Application stack traces are stored in development telemetry but are not returned to clients unless explicitly enabled for a local environment.

### 8.8 Effect is not an application dependency contract

Generated applications MUST NOT include examples that import Effect. Public package types MUST NOT expose `Effect.Effect`, `Layer`, `Context.Tag`, `Schema.Schema`, `Fiber`, or `Cause`.

Internal package tests MAY use Effect directly.

---

## 9. Environment contracts

### 9.1 Standard application file

Every generated project contains `src/env.ts`:

```ts
import { defineEnv, env } from "@zsys/config";

export default defineEnv({
  ZSYS_ENV: env.literal("development", "test", "production").default("development"),

  PORT: env.port().default(3000),
  LOG_LEVEL: env.literal("trace", "debug", "info", "warn", "error").default("info"),

  AWS_REGION: env.string().requiredIn("production"),
  ASSETS_BUCKET_NAME: env.string().requiredIn("production"),
  CACHE_ENDPOINT: env.string().requiredIn("production"),
  OPENAI_API_KEY: env.secret().optional(),
});
```

### 9.2 Environment descriptor behavior

The environment descriptor MUST provide:

```text
static TypeScript type for resolved values
runtime parsing and validation
default values
environment-specific requirements
secret marking
human-readable descriptions
example-value metadata
JSON-safe graph projection
Effect Config compilation internally
```

It MUST NOT resolve environment values during graph compilation.

### 9.3 Graph projection

The graph stores only metadata:

```json
{
  "name": "OPENAI_API_KEY",
  "type": "secret-string",
  "requiredIn": [],
  "hasDefault": false,
  "sensitive": true
}
```

The graph MUST NOT store:

```text
resolved value
secret value
shell expansion
contents of .env files
Pulumi secret ciphertext
cloud secret identifiers unless explicitly declared as non-secret metadata
```

### 9.4 CLI commands

```text
zsys env check
zsys env example
zsys env explain <NAME>
zsys env list
```

Expected behavior:

- `zsys env check` validates the active environment and exits non-zero on missing or malformed values.
- `zsys env example` generates `.env.example` deterministically without overwriting user edits unless `--write` is provided.
- `zsys env explain` prints type, requirement rules, default presence, and description without printing a secret.
- `zsys env list` prints names and status only.

### 9.5 Runtime resolution

Environment resolution happens once per runtime generation before provider construction. The resolved object is immutable. A missing production-only value prevents readiness.

Development MAY use Bun's normal `.env` loading. Production containers SHOULD disable implicit local file loading and rely on injected process environment values.

### 9.6 Test behavior

`@zsys/testing` MUST support:

```ts
createTestRuntime({
  app,
  env: {
    ZSYS_ENV: "test",
    PORT: 0,
  },
});
```

Test values are validated through the same descriptor as production values.

---

## 10. Global provider configuration

### 10.1 Rule

Concrete providers are selected globally in `src/app.ts`. Resource descriptors do not contain vendor SDK clients or credentials.

```ts
// src/app.ts
import { defineApp, localProviders, testProviders, awsProviders } from "@zsys/app";
import env from "./env";

export default defineApp({
  id: "commerce-api",
  env,

  providers: {
    development: localProviders({
      stateDirectory: ".zsys/state",
      observabilityDirectory: ".zsys/observability",
    }),

    test: testProviders({
      deterministicIds: true,
      deterministicClock: true,
    }),

    production: awsProviders({
      region: env.AWS_REGION,

      buckets: {
        default: {
          bucketName: env.ASSETS_BUCKET_NAME,
        },
      },

      cache: {
        default: {
          endpoint: env.CACHE_ENDPOINT,
        },
      },

      jobs: {
        default: {
          queuePrefix: "commerce",
        },
      },

      events: {
        default: {
          busName: "commerce-events",
        },
      },

      models: {
        default: {
          provider: "openai",
          apiKey: env.OPENAI_API_KEY,
        },
      },
    }),
  },
});
```

### 10.2 Profiles

A descriptor uses the global `default` profile unless it declares a logical profile:

```ts
export const invoices = defineBucket({
  id: "invoices",
  profile: "archive",
  visibility: "private",
});
```

Profile names describe intent rather than vendors:

```text
default
archive
low-latency
large-object
regulated
high-throughput
```

Avoid names such as `s3-primary` or `redis-east` in application descriptors.

### 10.3 Global capability set

The POC provider set covers:

```text
buckets
cache
jobs
events
model inference
observability export
```

Routes and functions do not have providers. Hono and the execution engine are ZSys runtime implementation.

### 10.4 Provider metadata in the graph

The graph records:

```text
logical capability
profile name
supported features
source location where profile is selected
required non-secret configuration names
```

The runtime manifest records executable provider factories. Resolved credentials and live clients never enter the graph.

### 10.5 Readiness

Before a generation becomes ready, every required provider MUST pass:

```text
configuration validation
construction
basic health or connectivity check where safe
capability compatibility check
shutdown registration
```

A failed provider leaves the previous development generation active.

### 10.6 Local state

Local providers may persist opaque runtime state under:

```text
.zsys/state/buckets/
.zsys/state/cache/
.zsys/state/jobs/
.zsys/state/events/
.zsys/observability/
```

These files are runtime implementation details. Application code MUST NOT read or mutate them directly.

---

## 11. Discovery, compilation, and diagnostics

### 11.1 Tooling configuration

`zsys.config.ts` contains tooling configuration rather than application behavior:

```ts
import { defineConfig } from "@zsys/cli";

export default defineConfig({
  entry: "src/app.ts",
  source: ["src/**/*.ts"],
  exclude: ["src/**/*.test.ts", "src/**/*.spec.ts", "src/**/__fixtures__/**"],
  generatedDirectory: ".zsys/generated",
  inspector: {
    port: 3210,
  },
});
```

### 11.2 Discovery stages

#### Stage A — AST candidate prefilter

The compiler uses the TypeScript compiler API to find files that might export ZSys descriptors. Candidate indicators include:

```text
imports from @zsys/*
known factory identifiers
default exports
ZSYS_DESCRIPTOR symbol access
re-exports of candidate modules
```

This stage MUST NOT execute application code.

#### Stage B — isolated evaluation

Candidate modules are evaluated in a controlled Bun child process with:

```text
fixed working directory
known environment allowlist
network disabled where practical
compilation timeout
captured stdout/stderr
source-map support
unique generation identifier
```

The evaluator returns serializable descriptor snapshots and manifest reference instructions. It MUST NOT start servers or workers.

### 11.3 Side-effect detection

Application descriptor modules SHOULD be side-effect-free. The evaluator emits diagnostics when module evaluation:

```text
opens a listening socket
starts a timer that remains active
writes outside an allowed generated directory
spawns a child process
prints directly to stdout/stderr
performs an unapproved network request
```

The first implementation MAY detect only a subset, but the architecture must preserve the isolated evaluation boundary.

### 11.4 Validation passes

The compiler performs these passes in order:

1. extract descriptor values;
2. assign source locations;
3. normalize IDs, paths, methods, profiles, and schedules;
4. validate descriptor-local fields;
5. build stable reference index;
6. resolve target references;
7. validate schema availability and JSON Schema generation;
8. validate route mapping compatibility;
9. validate job input compatibility;
10. expand event selectors;
11. validate event target compatibility;
12. validate tool target compatibility;
13. validate agent tool and model profiles;
14. validate provider profiles;
15. detect route collisions and prohibited cycles;
16. sort graph nodes and edges;
17. produce hash and generated outputs.

### 11.5 Diagnostic contract

```ts
export interface Diagnostic {
  readonly code: string;
  readonly severity: "info" | "warning" | "error";
  readonly message: string;
  readonly file?: string;
  readonly line?: number;
  readonly column?: number;
  readonly descriptorId?: string;
  readonly related?: readonly DiagnosticLocation[];
  readonly suggestion?: string;
  readonly documentationPath?: string;
}
```

Diagnostics MUST be available as:

```text
Effect terminal logs
JSON output
inspector diagnostics page
compiler API return value
CI annotations where supported
```

### 11.6 Convention warnings

Required warning codes:

```text
ZSYS_CONVENTION_DIRECTORY
ZSYS_CONVENTION_SUFFIX
ZSYS_CONVENTION_EXPORT
ZSYS_CONVENTION_MULTIPLE_KINDS
ZSYS_CONVENTION_ID_STYLE
```

Required error codes include:

```text
ZSYS_DUPLICATE_ID
ZSYS_MISSING_TARGET
ZSYS_ROUTE_COLLISION
ZSYS_SCHEMA_UNAVAILABLE
ZSYS_MAPPING_INCOMPATIBLE
ZSYS_EVENT_SELECTOR_EMPTY
ZSYS_EVENT_TARGET_INCOMPATIBLE
ZSYS_PROVIDER_PROFILE_UNKNOWN
ZSYS_MANIFEST_HANDLER_MISSING
ZSYS_GRAPH_MANIFEST_MISMATCH
```

### 11.7 Determinism

Canonical output MUST be independent of:

```text
absolute repository path
filesystem enumeration order
operating system path separator
module evaluation order
object insertion order
current wall-clock time
process ID
random IDs
```

Source paths are stored relative to the project root with `/` separators.

### 11.8 Graph hash

The graph hash is computed over canonical JSON after excluding ephemeral fields such as generation timestamps. The runtime manifest embeds the expected hash:

```ts
export const manifestGraphHash = "sha256:...";
```

The runtime refuses activation when hashes differ.

### 11.9 Generated outputs

The compiler writes only when content changes:

```text
application.graph.json
runtime.manifest.ts
openapi.json
client.ts
diagnostics.json
deployment.plan.json when requested
```

Every generated text file includes generator and contract versions but excludes non-deterministic timestamps.

---

## 12. Application graph, runtime manifest, and materialization

### 12.1 Direct answer

The graph is the canonical description used to create routes, job workers, schedules, event listeners, resources, tools, and agents. More precisely:

```text
compiler creates graph
planner creates registration plan
materializers create runtime registrations
engine invokes functions
```

The graph never contains executable closures.

### 12.2 Graph nodes

```ts
export type GraphNode =
  | AppNode
  | EnvironmentVariableNode
  | FunctionNode
  | TriggerNode
  | JobNode
  | EventNode
  | BucketNode
  | CacheNode
  | ToolNode
  | AgentNode
  | ProviderProfileNode;
```

A generic trigger node uses:

```ts
export interface TriggerNode {
  readonly kind: "trigger";
  readonly id: string;
  readonly triggerType: "http" | "queue" | "schedule" | "event";
  readonly targetFunctionId: string;
  readonly config: JsonValue;
  readonly source: SourceLocation;
}
```

Routes and event listeners remain distinct authoring descriptors and inspector concepts, but both compile to trigger nodes.

### 12.3 Graph edges

Required declared edge kinds:

```text
targets-function
calls-function
enqueues-job
publishes-event
listens-to-event
uses-bucket
uses-cache
invokes-agent
exposes-as-tool
uses-tool
uses-provider-profile
```

Observed runtime edges are stored separately:

```text
function A actually called function B
function A actually published event C
agent X actually called tool Y
request R actually touched cache Z
```

The inspector shows declared and observed relationships with different visual treatment.

### 12.4 Runtime manifest

The generated manifest contains executable references:

```ts
export interface RuntimeManifest {
  readonly contractVersion: number;
  readonly graphHash: string;
  readonly functions: Readonly<Record<string, FunctionHandlerAny>>;
  readonly providers: RuntimeProviderFactories;
  readonly middleware: Readonly<Record<string, MiddlewareHandlerAny>>;
}
```

The manifest MUST NOT be sent to the browser.

### 12.5 Registration plan

```ts
export interface RegistrationPlan {
  readonly graphHash: string;
  readonly functions: readonly FunctionRegistration[];
  readonly httpTriggers: readonly HttpTriggerRegistration[];
  readonly queues: readonly QueueRegistration[];
  readonly schedules: readonly ScheduleRegistration[];
  readonly eventTriggers: readonly EventTriggerRegistration[];
  readonly buckets: readonly BucketRegistration[];
  readonly caches: readonly CacheRegistration[];
  readonly tools: readonly ToolRegistration[];
  readonly agents: readonly AgentRegistration[];
}
```

The planner MUST be pure and deterministic. Provider clients are created after planning.

### 12.6 Materialization order

1. verify graph and manifest versions;
2. resolve environment values;
3. construct provider set;
4. register function handlers in the engine;
5. register buckets and caches;
6. register job queues;
7. register event contracts;
8. register tools and agents;
9. bind event triggers;
10. bind schedules and queue consumers;
11. create Hono routes;
12. start internal inspector APIs;
13. run readiness checks;
14. announce generation ready.

Shutdown reverses dependencies and stops new traffic before releasing providers.

### 12.7 Compatibility diff

`zsys graph diff` reports:

```text
route added/removed/changed
function input/output/error changed
event version added/removed/schema changed
job retry or delivery changed
bucket/cache contract changed
tool exposure changed
agent model/tool/limit changed
provider profile changed
```

The command classifies changes as informational, compatible, potentially breaking, or breaking.

---

## 13. Functions

### 13.1 Complete example

```ts
// src/functions/orders/create-order.function.ts
import { defineError, defineFunction } from "@zsys/app";
import { z } from "@zsys/schema";
import { orderCreated } from "../../events/orders/order-created.event";
import { sendReceiptJob } from "../../jobs/receipts/send-receipt.job";
import { priceCache } from "../../cache/prices.cache";

export const CreateOrderInput = z.object({
  orderId: z.string().uuid(),
  customerId: z.string().uuid(),
  sku: z.string().min(1),
  quantity: z.number().int().positive(),
});

export const CreateOrderOutput = z.object({
  orderId: z.string().uuid(),
  accepted: z.literal(true),
  total: z.number().nonnegative(),
});

export const PriceUnavailable = defineError({
  id: "orders.price-unavailable",
  data: z.object({ sku: z.string() }),
  message: ({ sku }) => `Price is unavailable for ${sku}`,
  http: { status: 409 },
  retry: "later",
});

export const createOrder = defineFunction({
  id: "orders.create",
  input: CreateOrderInput,
  output: CreateOrderOutput,
  errors: [PriceUnavailable],

  dependencies: {
    cache: { priceCache },
    events: { orderCreated },
    jobs: { sendReceipt: sendReceiptJob },
  },

  timeoutMs: 10_000,
  concurrency: 100,

  handler: async (input, ctx) => {
    const price = await ctx.cache.priceCache.get({ sku: input.sku });

    if (price === undefined) {
      throw PriceUnavailable.create({ sku: input.sku });
    }

    const total = price * input.quantity;

    await ctx.events.orderCreated.publish({
      orderId: input.orderId,
      customerId: input.customerId,
      total,
      occurredAt: ctx.time.now().toISOString(),
    });

    await ctx.jobs.sendReceipt.enqueue({
      orderId: input.orderId,
      customerId: input.customerId,
    });

    ctx.log.info("order accepted", {
      orderId: input.orderId,
      total,
    });

    return {
      orderId: input.orderId,
      accepted: true,
      total,
    };
  },
});

export default createOrder;
```

### 13.2 Invocation validation

The engine validates:

1. input before calling the handler;
2. output after handler success;
3. declared error data before exposing it;
4. dependency access at context-client creation;
5. timeout and cancellation;
6. concurrency before handler admission.

An invalid handler output is an internal defect, not a client validation error.

### 13.3 Direct invocation

A function invokes another declared function:

```ts
dependencies: {
  functions: { calculateTax },
},

handler: async (input, ctx) => {
  const tax = await ctx.functions.calculateTax({
    country: input.country,
    amount: input.amount,
  });

  return { tax };
},
```

The child invocation inherits trace, deadline, and cancellation, but has its own invocation ID.

### 13.4 Concurrency

Concurrency is enforced per runtime generation and function ID. Queue providers may impose additional delivery concurrency. The effective concurrency is the minimum of function and trigger limits.

### 13.5 Recursion and cycles

Direct recursion is denied by default. A future explicit bounded-recursion option MAY be added, but the POC should prefer jobs or events for asynchronous cycles.

### 13.6 Function test

```ts
import { describe, expect, test } from "bun:test";
import { createTestRuntime } from "@zsys/testing";
import app from "../../../src/app";
import { createOrder } from "../../../src/functions/orders/create-order.function";

createTestRuntime.describe(app, "orders.create", ({ runtime, fakes }) => {
  test("publishes an event and enqueues a receipt", async () => {
    fakes.cache.priceCache.set({ sku: "sku-1" }, 25);

    const output = await runtime.invoke(createOrder, {
      orderId: "00000000-0000-4000-8000-000000000001",
      customerId: "00000000-0000-4000-8000-000000000002",
      sku: "sku-1",
      quantity: 2,
    });

    expect(output.total).toBe(50);
    expect(fakes.events.orderCreated.published).toHaveLength(1);
    expect(fakes.jobs.sendReceipt.enqueued).toHaveLength(1);
  });
});
```

---

## 14. Routes and Hono runtime

### 14.1 Route example

```ts
// src/routes/orders/create-order.route.ts
import { defineRoute, http } from "@zsys/app";
import { createOrder } from "../../functions/orders/create-order.function";

export default defineRoute({
  id: "orders.create.http",
  method: "POST",
  path: "/orders",
  target: createOrder,

  request: http.input({
    orderId: http.header("idempotency-key"),
    customerId: http.header("x-customer-id"),
    sku: http.body("sku"),
    quantity: http.body("quantity"),
  }),

  responses: [
    http.success(201),
    http.error("orders.price-unavailable", 409),
    http.validationError(422),
  ],
});
```

The compiler checks that the request mapping produces the target function input.

### 14.2 Request mapping DSL

The mapping DSL is serializable and supports:

```text
path parameter
query parameter
header
cookie
JSON body field
whole JSON body
multipart field
constant
nested object
optional value
default value
schema transform declared by ID
```

Arbitrary mapping closures are excluded because they cannot be represented in the graph or inspector.

### 14.3 Hono materialization

`@zsys/runtime-hono`:

1. sorts routes by deterministic precedence;
2. creates a Hono application;
3. installs request ID and trace middleware;
4. installs body-size and content-type guards;
5. applies declared middleware;
6. parses request data through the mapping DSL;
7. invokes the target function through the engine;
8. maps declared failures to HTTP responses;
9. validates response bodies in development/test;
10. records the request and trace;
11. returns the response.

The user handler never receives a Hono context.

### 14.4 Route precedence

Required order:

1. exact static path;
2. parameterized path;
3. wildcard path;
4. registration ID as final stable tie-breaker.

A collision at the same method and normalized path is a compile error.

### 14.5 Internal endpoints

```text
/_zsys/v1/health/live
/_zsys/v1/health/ready
/_zsys/v1/graph
/_zsys/v1/requests
/_zsys/v1/logs
/_zsys/v1/traces
/_zsys/v1/stream
/_zsys/v1/diagnostics
```

Internal endpoints MUST be disabled or protected in production according to deployment configuration.

### 14.6 OpenAPI

OpenAPI 3.1 is generated from route graph nodes, function schemas, declared errors, and response mappings. Hono route internals are not inspected.

### 14.7 Route integration test

```ts
import { expect, test } from "bun:test";
import { createTestApplication } from "@zsys/testing";
import app from "../../src/app";

const testApp = await createTestApplication(app);

test("POST /orders", async () => {
  testApp.fakes.cache.priceCache.set({ sku: "sku-1" }, 25);

  const response = await testApp.http.request("/orders", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": "00000000-0000-4000-8000-000000000001",
      "x-customer-id": "00000000-0000-4000-8000-000000000002",
    },
    body: JSON.stringify({ sku: "sku-1", quantity: 2 }),
  });

  expect(response.status).toBe(201);
  expect(await response.json()).toMatchObject({ total: 50 });
  expect(testApp.observability.requests()).toHaveLength(1);
});
```

---

## 15. Jobs and schedules

### 15.1 Model

A job is a typed queue contract that targets a function. It provides asynchronous, at-least-once delivery.

```ts
// src/jobs/receipts/send-receipt.job.ts
import { defineJob } from "@zsys/app";
import { z } from "@zsys/schema";
import { sendReceipt } from "../../functions/receipts/send-receipt.function";

export const SendReceiptInput = z.object({
  orderId: z.string().uuid(),
  customerId: z.string().uuid(),
});

export const sendReceiptJob = defineJob({
  id: "receipts.send.job",
  input: SendReceiptInput,
  target: sendReceipt,

  retry: {
    maxAttempts: 8,
    initialDelayMs: 500,
    maxDelayMs: 30_000,
    multiplier: 2,
    jitter: "full",
  },

  timeoutMs: 30_000,
  concurrency: 20,

  idempotency: {
    key: "orderId",
    retentionMs: 86_400_000,
  },
});

export default sendReceiptJob;
```

### 15.2 Enqueue API

A declaring function uses its typed dependency client:

```ts
await ctx.jobs.sendReceipt.enqueue({
  orderId,
  customerId,
});
```

The return value includes a job instance ID and acceptance metadata.

### 15.3 State machine

```text
accepted
  ↓
available
  ↓
leased
  ├── success ──► completed
  ├── retryable ─► delayed ─► available
  ├── exhausted ─► dead-lettered
  └── lease lost ─► available
```

Delivery is at least once. Handlers MUST be safe for duplicate execution or use the job's idempotency contract.

### 15.4 Schedules

```ts
schedule: [
  {
    id: "nightly",
    cron: "0 2 * * *",
    timezone: "UTC",
    input: {
      orderId: "...",
      customerId: "...",
    },
    overlap: "skip",
  },
],
```

A schedule is a trigger node targeting the job/function path. Invalid cron syntax or missing required static input is a compile error.

### 15.5 Local provider

The local provider uses append-only files and atomic renames under `.zsys/state/jobs`. It MUST support:

```text
process restart
lease expiration
retry delay
dead-letter state
idempotency record
quarantine of malformed records
administrative retry and cancel
```

It MUST NOT claim exactly-once behavior.

### 15.6 AWS mapping

```text
job queue       → SQS
schedule        → EventBridge Scheduler
retry/DLQ       → SQS redrive plus ZSys policy validation
worker          → ECS/Fargate service consumers
idempotency     → handler contract; optional provider support only when explicit
```

### 15.7 Job tests

Required tests:

```text
input validation
enqueue and consume
retry delay with test clock
max attempts and dead-letter
lease expiration after simulated crash
duplicate delivery
idempotency key retention
concurrency limit
schedule firing
schedule overlap policy
restart recovery
malformed file quarantine
```

---

## 16. Events and event triggers

### 16.1 Alignment with iii

iii uses functions plus generic trigger registrations. For pub/sub, a worker registers a trigger whose type is `subscribe`, points it at a function ID, and supplies a topic. ZSys keeps the same conceptual separation—function plus trigger—but uses a declarative `onEvent(...)` authoring factory and a generic graph trigger node.

Therefore:

```text
No separate subscription descriptor
No subscription package
No *.subscription.ts files
No subscription graph-node kind
```

The word “subscription” may appear only when describing a provider's internal broker mechanism.

### 16.2 Event contract

An event is a versioned fact that has already happened. IDs SHOULD use past tense:

```text
orders.created
orders.updated
orders.cancelled
files.uploaded
```

```ts
// src/events/orders/order-created.event.ts
import { defineEvent } from "@zsys/app";
import { z } from "@zsys/schema";

export const orderCreated = defineEvent({
  id: "orders.created",
  version: 1,
  payload: z.object({
    orderId: z.string().uuid(),
    customerId: z.string().uuid(),
    total: z.number().nonnegative(),
    occurredAt: z.string().datetime(),
  }),
});

export default orderCreated;
```

### 16.3 Event envelope

```ts
export interface EventEnvelope<Id extends string, Version extends number, Payload> {
  readonly instanceId: string;
  readonly eventId: Id;
  readonly version: Version;
  readonly payload: Payload;
  readonly occurredAt: string;
  readonly publishedAt: string;
  readonly key?: string;
  readonly correlationId?: string;
  readonly causationInvocationId?: string;
  readonly traceId: string;
  readonly attributes: Readonly<Record<string, string | number | boolean>>;
}
```

### 16.4 Publishing

```ts
await ctx.events.orderCreated.publish(
  {
    orderId,
    customerId,
    total,
    occurredAt: ctx.time.now().toISOString(),
  },
  {
    key: orderId,
    attributes: { source: "checkout" },
  },
);
```

The event provider validates the payload before acceptance.

### 16.5 Listening to one event

```ts
// src/events/orders/send-receipt-on-order-created.event.ts
import { onEvent } from "@zsys/app";
import { orderCreated } from "./order-created.event";
import { sendReceiptFromEvent } from "../../functions/receipts/send-receipt-from-event.function";

export default onEvent(orderCreated, {
  id: "receipts.on-order-created",
  target: sendReceiptFromEvent,
  delivery: "durable",
  retry: {
    maxAttempts: 8,
    initialDelayMs: 500,
    maxDelayMs: 30_000,
    multiplier: 2,
    jitter: "full",
  },
});
```

The target receives the full typed event envelope by default. A `payloadOnly: true` option MAY be supported, but the envelope is recommended for idempotency and tracing.

### 16.6 Listening to several known changes

```ts
export default onEvent(events.anyOf(orderCreated, orderUpdated, orderCancelled), {
  id: "orders.project-any-change",
  target: updateOrderProjection,
  delivery: "durable",
});
```

The target input is a discriminated union by `eventId` and `version`.

### 16.7 Pattern selector

```ts
onEvent(events.match("orders.*"), {
  id: "orders.audit-changes",
  target: auditOrderChange,
  delivery: "durable",
});
```

Compile behavior:

1. match only event descriptors in the current graph;
2. expand to sorted event ID/version pairs;
3. generate a typed union schema;
4. persist the expansion in the graph;
5. warn when nothing matches;
6. report a compatibility change when a future graph expands the match.

Supported syntax:

```text
*   exactly one dot-delimited segment
**  zero or more segments
```

### 16.8 Raw all-event listener

```ts
onEvent(events.all({ payload: "unknown" }), {
  id: "telemetry.capture-events",
  target: captureTelemetry,
  delivery: "ephemeral",
  tags: ["telemetry"],
});
```

This is restricted to audit, telemetry, and development tooling. It produces a raw envelope, warns about volume and sensitive data, and is not the recommended business API.

### 16.9 “Any change” meaning

ZSys can react to any event that is explicitly published into its event capability, including selected ZSys system events. It does not infer changes made by unrelated application libraries.

Preferred business behavior:

```text
publish a domain event after a successful operation
bind one or more functions with onEvent(...)
make listeners idempotent
use durable delivery when loss is unacceptable
```

### 16.10 Delivery modes

#### Ephemeral

- in-process or provider-native transient delivery;
- no restart recovery;
- suitable for live UI hints and non-critical telemetry;
- lower latency.

#### Durable

- event acceptance is persisted by the provider;
- listener delivery is at least once;
- retries and dead-letter state are visible;
- restart recovery is required;
- duplicate delivery is expected.

### 16.11 Local event provider

The local durable provider stores:

```text
event envelope log
trigger delivery cursor or fan-out ledger
lease records
retry schedule
dead-letter records
```

A crash after function success but before acknowledgement may cause redelivery.

### 16.12 AWS mapping

```text
application event bus → EventBridge custom bus
event routing         → EventBridge rules
durable listener      → SQS queue per event trigger or compatible group
consumer               → ECS/Fargate worker
retry/DLQ              → SQS redrive plus ZSys policy
```

### 16.13 Event tests

Required tests:

```text
payload validation
envelope creation and correlation
single-event trigger
anyOf typed union
pattern expansion
no-match warning
compatibility diff when a pattern expands
ephemeral loss after restart
durable recovery after restart
duplicate delivery
retry and dead-letter
per-key ordering when supported
raw wildcard restriction
trigger graph node targets the correct function
no subscription descriptor is emitted
```

---

## 17. Buckets and cache

### 17.1 Bucket descriptor

```ts
// src/buckets/assets.bucket.ts
import { defineBucket } from "@zsys/app";

export const assets = defineBucket({
  id: "assets",
  visibility: "private",
  maxObjectBytes: 25_000_000,
  allowedContentTypes: ["image/png", "image/jpeg", "application/pdf"],
});

export default assets;
```

A bucket descriptor contains logical policy only. It does not name S3 or a filesystem path.

### 17.2 Typed bucket client

```ts
dependencies: {
  buckets: { assets },
},

handler: async (input, ctx) => {
  await ctx.buckets.assets.put(input.key, input.bytes, {
    contentType: input.contentType,
    metadata: {
      uploadedBy: input.actorId,
    },
  });

  const metadata = await ctx.buckets.assets.head(input.key);
  return { etag: metadata.etag };
},
```

Required operations:

```text
put
get
head
delete
exists
list
createReadUrl where provider supports it
createWriteUrl where provider supports it
```

### 17.3 Key safety

Keys MUST be normalized and validated. Local providers must prevent:

```text
path traversal
absolute paths
null bytes
reserved internal prefixes
platform-specific separator escape
```

### 17.4 Integrity and limits

Providers MUST enforce declared object size and content-type policy. The runtime SHOULD calculate or verify content hashes where practical. Partial writes must never become visible as completed objects.

### 17.5 Cache descriptor

```ts
// src/cache/prices.cache.ts
import { defineCache } from "@zsys/app";
import { z } from "@zsys/schema";

export const priceCache = defineCache({
  id: "prices",
  key: z.object({
    sku: z.string().min(1),
  }),
  value: z.number().nonnegative(),
  defaultTtlMs: 300_000,
  maxTtlMs: 3_600_000,
});

export default priceCache;
```

### 17.6 Typed cache client

```ts
const value = await ctx.cache.priceCache.get({ sku });

await ctx.cache.priceCache.set({ sku }, 25, {
  ttlMs: 60_000,
});

const value2 = await ctx.cache.priceCache.getOrSet({ sku }, async () => fetchPrice(sku), {
  ttlMs: 60_000,
});
```

Required operations:

```text
get
set
delete
has
getOrSet
increment when value contract supports numbers
```

### 17.7 Key encoding

Cache keys are generated from canonical JSON plus cache ID and schema version. Object property order MUST NOT change the key. Sensitive raw keys SHOULD NOT be emitted to logs.

### 17.8 Stampede protection

`getOrSet` SHOULD provide per-key single-flight behavior inside one runtime generation. Cross-process single-flight is provider capability and must be reported accurately.

### 17.9 Local and AWS mapping

```text
local bucket → atomic filesystem objects
AWS bucket   → S3
local cache  → bounded memory plus optional file snapshot
AWS cache    → ElastiCache-compatible provider
```

### 17.10 Contract tests

Reusable provider suites MUST verify the same logical behavior for local and AWS implementations, with capability-specific skips made explicit.

Bucket tests:

```text
put/get/head/delete
list pagination
size and content-type rejection
path traversal rejection
atomic visibility
metadata round-trip
signed URL capability reporting
```

Cache tests:

```text
key canonicalization
value validation
TTL expiry with test clock
getOrSet single-flight
delete and has
size/entry eviction policy
provider outage behavior
secret-safe logs
```

---

## 18. Tools and agents

### 18.1 Functions as tools

A tool contains no separate handler. It exposes a function to an agent runtime with a description and safety policy.

```ts
// src/tools/orders/get-order.tool.ts
import { defineTool } from "@zsys/app";
import { getOrder } from "../../functions/orders/get-order.function";

export default defineTool({
  id: "orders.get.tool",
  target: getOrder,
  description: "Return an order by its public order identifier.",
  sideEffect: "read",
  approval: "never",
  timeoutMs: 5_000,
});
```

The tool input, output, and declared errors are inherited from the target function.

### 18.2 Tool invocation path

```text
model requests tool call
        ↓
agent validates tool name and JSON arguments
        ↓
approval policy
        ↓
engine invokes target function with source=tool
        ↓
validated result or safe error returned to agent loop
```

A tool call appears as a child span and observed graph edge.

### 18.3 Side-effect classification

```text
none      pure computation
read      reads state or external data
write     changes application or managed resource state
external  sends messages, calls third parties, or has broad effects
```

The inspector uses this classification when showing tool approval prompts.

### 18.4 Agent descriptor

```ts
// src/agents/support/order-support.agent.ts
import { defineAgent } from "@zsys/app";
import { z } from "@zsys/schema";
import getOrderTool from "../../tools/orders/get-order.tool";

export default defineAgent({
  id: "support.order",
  input: z.object({
    question: z.string().min(1),
    orderId: z.string().uuid().optional(),
  }),
  output: z.object({
    answer: z.string(),
    referencedOrderIds: z.array(z.string().uuid()),
  }),
  modelProfile: "default",
  instructions: [
    "You answer questions about orders.",
    "Use tools instead of inventing order data.",
    "Do not expose internal error details.",
  ].join("\n"),
  tools: [getOrderTool],
  limits: {
    maxSteps: 8,
    maxToolCalls: 5,
    timeoutMs: 30_000,
  },
});
```

### 18.5 Generated agent function

The compiler creates an internal function identity such as:

```text
zsys.agent.support.order.invoke
```

This preserves the rule that all execution flows through the function engine. The generated function is visible in the graph as generated, not authored.

### 18.6 Model profiles

Model vendor selection is global:

```ts
models: {
  default: {
    provider: "openai",
    model: "configured-model-alias",
    apiKey: env.OPENAI_API_KEY,
  },
}
```

The agent descriptor references only `default` or another logical profile.

### 18.7 Safety and limits

The runtime MUST enforce:

```text
input validation
output validation
allowed tool list
maximum steps
maximum tool calls
timeout and cancellation
per-tool approval policy
bounded model response size
secret redaction
prompt/tool/result trace policy
```

Prompt and model response content is not stored by default. Development capture requires explicit redaction configuration.

### 18.8 Fake model provider

The test provider returns scripted model turns:

```ts
fakes.models.default.script([
  {
    type: "tool-call",
    toolId: "orders.get.tool",
    input: { orderId },
  },
  {
    type: "final",
    output: {
      answer: "The order is being prepared.",
      referencedOrderIds: [orderId],
    },
  },
]);
```

This makes agent tests deterministic and independent of network APIs.

### 18.9 Required tests

```text
tool schema inheritance
unknown tool rejection
invalid arguments
approval required/denied/approved
target function error mapping
agent final output validation
step and tool-call limits
timeout and cancellation
fake model deterministic script
prompt/result capture disabled by default
trace tree includes model and tool spans
```

---

## 19. Observability and request logs

### 19.1 Required signals

The POC records:

```text
request records
function invocations
job attempts
event publications and deliveries
bucket operations
cache operations
tool calls
agent model turns
structured logs
spans and traces
diagnostics
generation lifecycle events
```

### 19.2 Request record

```ts
export interface RequestRecord {
  readonly requestId: string;
  readonly traceId: string;
  readonly generationId: string;
  readonly graphHash: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly durationMs: number;
  readonly method: string;
  readonly rawPath: string;
  readonly normalizedRoute: string;
  readonly routeId: string;
  readonly functionId: string;
  readonly status: number;
  readonly requestBytes?: number;
  readonly responseBytes?: number;
  readonly outcome:
    "success" | "declared-error" | "validation-error" | "timeout" | "cancelled" | "defect";
  readonly errorId?: string;
  readonly invocationId: string;
}
```

### 19.3 Request detail

The inspector request detail page shows a timeline of:

```text
request accepted
route match
request mapping
middleware
function invocation
child function calls
cache operations
bucket operations
jobs enqueued
events published
tools called
response mapping
response sent
```

### 19.4 Body capture

Default:

```text
request body: not captured
response body: not captured
authorization header: never captured
cookies: never captured
binary body: never captured
secret env values: never captured
agent prompt/result: not captured
```

Development opt-in:

```ts
observability: {
  bodyCapture: {
    mode: "development-redacted",
    maxBytes: 16_384,
    redactKeys: [
      "password",
      "token",
      "authorization",
      "cookie",
      "secret",
    ],
  },
},
```

### 19.5 Local storage

```text
.zsys/observability/
├── requests/YYYY-MM-DD/*.ndjson
├── logs/YYYY-MM-DD/*.ndjson
├── traces/YYYY-MM-DD/*.ndjson
└── index/*.json
```

The provider uses append-only segments, atomic rotation, bounded retention, and startup repair/quarantine.

### 19.6 Live stream

The backend exposes server-sent events:

```text
GET /_zsys/v1/stream
```

Event types:

```text
request.started
request.completed
log.emitted
span.started
span.completed
job.changed
event.published
event.delivery.changed
generation.changed
diagnostic.changed
```

The stream supports a monotonic cursor so the inspector can reconnect and request missed events within retention.

### 19.7 Terminal output

Development terminal example:

```text
12:41:08 INFO  route orders.create.http POST /orders 201 18ms
             request=01J... trace=7b3... function=orders.create
12:41:08 DEBUG event published orders.created@1
             instance=01J... key=order-123
```

Production JSON output example:

```json
{
  "timestamp": "2026-08-10T09:41:08.120Z",
  "level": "info",
  "component": "runtime.http",
  "message": "request completed",
  "requestId": "01J...",
  "traceId": "7b3...",
  "routeId": "orders.create.http",
  "status": 201,
  "durationMs": 18
}
```

Both formats are produced by Effect logger sinks.

### 19.8 Query API

```text
GET /_zsys/v1/requests
GET /_zsys/v1/requests/:requestId
GET /_zsys/v1/logs
GET /_zsys/v1/traces
GET /_zsys/v1/traces/:traceId
```

Queries support bounded pagination, time range, severity, route ID, function ID, outcome, request ID, and trace ID.

### 19.9 Required tests

```text
request record success and each failure outcome
log correlation
trace parent/child structure
redaction
body capture disabled by default
capture byte limit
segment rotation
retention deletion
startup repair after truncated line
SSE reconnect cursor
backpressure and dropped-event counter
no secret in terminal, JSON, files, or inspector API
```

---

## 20. Next.js inspector and development supervisor

### 20.1 Inspector role

The inspector is a read-oriented development product over versioned ZSys APIs. It MUST NOT:

```text
scan source files independently
inspect Hono internals
import application handlers
read local provider files directly
resolve environment secrets
construct cloud clients
```

### 20.2 Required pages

```text
/
/graph
/routes
/routes/[id]
/functions
/functions/[id]
/jobs
/jobs/[id]
/events
/events/[id]
/buckets
/buckets/[id]
/cache
/cache/[id]
/tools
/tools/[id]
/agents
/agents/[id]
/requests
/requests/[requestId]
/logs
/traces
/traces/[traceId]
/env
/diagnostics
```

### 20.3 Route page

Shows:

```text
method and path
target function
request mapping
response mappings
schemas
OpenAPI operation
source link
recent requests
request composer
related graph nodes
```

### 20.4 Request composer

The composer renders a form from route schemas and mapping metadata. It sends requests to the active backend and links the response to its request record and trace.

### 20.5 Function page

Shows:

```text
input/output/error schemas
declared dependencies
incoming route/job/event/tool edges
outgoing declared edges
observed recent edges
concurrency and timeout
source link
manual invocation form
recent logs and traces
```

### 20.6 Event page

Shows event versions, payload schemas, publishers, event-trigger bindings, selector expansions, delivery policy, recent publications, delivery attempts, and dead-letter state.

The UI uses “listener” or “event trigger” in application-facing text, not a separate application subscription concept.

### 20.7 Jobs page

Shows queue depth, available/leased/delayed/dead-letter counts, retry policy, schedule next run, recent attempts, and safe local administrative actions.

### 20.8 Agent page

Shows model profile, tools, safety limits, recent invocation timeline, model-turn metadata, tool calls, approvals, and redacted logs.

### 20.9 Source links

The compiler stores project-relative file, line, and column. The inspector generates editor protocol links only in local development and only from configured editor choices.

### 20.10 Supervisor state machine

```text
idle
  ↓ change
compiling-candidate
  ├── failure ─► report diagnostics ─► keep active generation
  └── success
         ↓
starting-candidate
  ├── failure ─► keep active generation
  └── success
         ↓
verifying-hash-and-readiness
  ├── failure ─► stop candidate; keep active generation
  └── success
         ↓
switching
         ↓
draining-previous
         ↓
active
```

### 20.11 Traffic switching

The supervisor owns a stable development port and proxies to the active backend generation. Switching updates one atomic active-target reference. Existing requests continue on the old generation until completion or drain timeout.

### 20.12 Required tests

```text
compiler failure preserves active generation
candidate startup failure preserves active generation
graph/manifest mismatch rejects candidate
readiness failure rejects candidate
atomic proxy switch
old request drain
drain timeout cancellation
SSE generation-changed event
inspector pages render deterministic fixture data
request composer success and validation error
source links are project-relative
production inspector protection
```

---

## 21. Creating a new ZSys project

### 21.1 Primary command

```bash
bunx create-zsys@latest my-app
```

Equivalent after installing the CLI:

```bash
zsys create my-app
```

### 21.2 Defaults

Without flags, the generator selects:

```text
language: TypeScript
runtime: Bun
HTTP runtime: internal Hono
schema package: @zsys/schema
local providers: built in
deployment engine: Pulumi
cloud target: AWS
example: minimal hello route plus tests
package manager: Bun
git initialization: yes when git is available
```

### 21.3 Non-interactive flags

```text
--template minimal|api|agent
--cloud aws|none
--deploy pulumi|none
--install / --no-install
--git / --no-git
--examples / --no-examples
--directory <path>
--force-empty-directory
--json
```

There are no flags for persistence or identity subsystems in this POC.

### 21.4 Generator algorithm

1. parse arguments;
2. validate the package name and destination path;
3. refuse a non-empty destination unless explicitly allowed;
4. select a bundled versioned template;
5. copy files to a temporary sibling directory;
6. replace safe template variables;
7. write `package.json` with exact compatible ZSys versions;
8. generate `zsys.config.ts`;
9. generate `src/app.ts` and `src/env.ts`;
10. generate example descriptors and tests when enabled;
11. create `.env.example`;
12. run `bun install` when enabled;
13. initialize Git when enabled;
14. run `zsys doctor --project`;
15. run `zsys check`;
16. atomically rename the temporary directory into the destination;
17. print exact next commands.

If a step fails before the final rename, the destination remains unchanged.

### 21.5 Generated tree

```text
my-app/
├── src/
│   ├── app.ts
│   ├── env.ts
│   ├── functions/
│   │   └── hello.function.ts
│   └── routes/
│       └── hello.route.ts
├── tests/
│   ├── unit/
│   │   └── hello.function.test.ts
│   └── integration/
│       └── hello.route.test.ts
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.json
├── zsys.config.ts
├── README.md
└── bun.lock
```

### 21.6 Generated `package.json`

```json
{
  "name": "my-app",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "zsys dev",
    "check": "zsys check",
    "typecheck": "tsc --noEmit",
    "test": "bun test",
    "test:unit": "bun test tests/unit",
    "test:integration": "bun test tests/integration",
    "build": "zsys build",
    "start": "zsys start",
    "graph": "zsys graph print",
    "deploy:preview": "zsys deploy preview",
    "deploy": "zsys deploy up"
  },
  "dependencies": {
    "@zsys/app": "<compatible-version>",
    "@zsys/config": "<compatible-version>",
    "@zsys/schema": "<compatible-version>"
  },
  "devDependencies": {
    "@types/bun": "<compatible-version>",
    "@zsys/cli": "<compatible-version>",
    "@zsys/testing": "<compatible-version>",
    "typescript": "<compatible-version>"
  }
}
```

Version placeholders are resolved by the generator; they are not left in the project.

### 21.7 Generated `src/env.ts`

```ts
import { defineEnv, env } from "@zsys/config";

export default defineEnv({
  ZSYS_ENV: env.literal("development", "test", "production").default("development"),
  PORT: env.port().default(3000),
  LOG_LEVEL: env.literal("trace", "debug", "info", "warn", "error").default("info"),
  AWS_REGION: env.string().default("us-east-1"),
});
```

### 21.8 Generated `src/app.ts`

```ts
import { defineApp, localProviders, testProviders, awsProviders } from "@zsys/app";
import env from "./env";

export default defineApp({
  id: "my-app",
  env,
  providers: {
    development: localProviders({
      stateDirectory: ".zsys/state",
      observabilityDirectory: ".zsys/observability",
    }),
    test: testProviders({
      deterministicIds: true,
      deterministicClock: true,
    }),
    production: awsProviders({
      region: env.AWS_REGION,
    }),
  },
  observability: {
    bodyCapture: { mode: "off" },
  },
});
```

The default production block is intentionally minimal. Managed capabilities add their global AWS configuration only when corresponding descriptors are introduced.

### 21.9 Generated function

```ts
// src/functions/hello.function.ts
import { defineFunction } from "@zsys/app";
import { z } from "@zsys/schema";

export const hello = defineFunction({
  id: "hello",
  input: z.object({
    name: z.string().min(1).default("world"),
  }),
  output: z.object({
    message: z.string(),
  }),

  handler: async ({ name }, ctx) => {
    ctx.log.info("hello invoked", { name });
    return { message: `Hello, ${name}!` };
  },
});

export default hello;
```

### 21.10 Generated route

```ts
// src/routes/hello.route.ts
import { defineRoute, http } from "@zsys/app";
import { hello } from "../functions/hello.function";

export default defineRoute({
  id: "hello.http",
  method: "GET",
  path: "/hello",
  target: hello,
  request: http.input({
    name: http.query("name", { default: "world" }),
  }),
  responses: [http.success(200)],
});
```

### 21.11 Generated tests

```ts
// tests/unit/hello.function.test.ts
import { expect, test } from "bun:test";
import { invokeFunction } from "@zsys/testing";
import { hello } from "../../src/functions/hello.function";

test("hello returns a greeting", async () => {
  const result = await invokeFunction(hello, { name: "Mustafa" });
  expect(result).toEqual({ message: "Hello, Mustafa!" });
});
```

```ts
// tests/integration/hello.route.test.ts
import { expect, test } from "bun:test";
import { createTestApplication } from "@zsys/testing";
import app from "../../src/app";

const runtime = await createTestApplication(app);

test("GET /hello", async () => {
  const response = await runtime.http.request("/hello?name=Mustafa");
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    message: "Hello, Mustafa!",
  });
});
```

### 21.12 First-run flow

The generator prints:

```text
cd my-app
bun run dev
```

Expected result:

```text
backend:   http://localhost:3000
inspector: http://localhost:3210
route:     GET http://localhost:3000/hello?name=ZSys
```

The developer can then run:

```bash
bun run test
bun run check
bun run build
```

### 21.13 `zsys doctor`

Checks:

```text
supported Bun version
supported TypeScript version
matching @zsys package versions
Pulumi CLI presence when deployment is enabled
AWS credential visibility without printing credentials
writable .zsys directories
available ports
valid zsys.config.ts
valid src/app.ts
frozen lockfile consistency
```

### 21.14 Generator tests

Required:

```text
valid project name
invalid package name
empty destination
non-empty destination refusal
temporary-directory cleanup on failure
minimal/api/agent templates
with and without examples
with and without install
with and without Git
JSON output
all generated projects pass bun install, zsys check, tsc, bun test, and zsys build
no forbidden imports in generated source
no non-deterministic file content
```

---

## 22. Pulumi deployment and AWS

### 22.1 Deployment commands

```text
zsys deploy init --stack development
zsys deploy preview --stack development
zsys deploy up --stack development
zsys deploy refresh --stack development
zsys deploy outputs --stack development
zsys deploy destroy --stack development
```

The CLI uses Pulumi Automation API. The Pulumi CLI must be available because Automation API drives the Pulumi engine through it.

### 22.2 Deployment plan

The compiler/planner emits a provider-neutral plan:

```ts
export interface DeploymentPlan {
  readonly contractVersion: number;
  readonly graphHash: string;
  readonly application: {
    readonly id: string;
    readonly image: ContainerImagePlan;
    readonly environmentNames: readonly string[];
  };
  readonly http: HttpDeploymentPlan;
  readonly jobs: readonly JobDeploymentPlan[];
  readonly schedules: readonly ScheduleDeploymentPlan[];
  readonly events: readonly EventDeploymentPlan[];
  readonly eventTriggers: readonly EventTriggerDeploymentPlan[];
  readonly buckets: readonly BucketDeploymentPlan[];
  readonly caches: readonly CacheDeploymentPlan[];
  readonly observability: ObservabilityDeploymentPlan;
}
```

The plan contains no Pulumi `Input` or `Output` values.

### 22.3 Generated Pulumi program

`@zsys/deploy-pulumi` converts the deployment plan into a Pulumi program. Generated files may be materialized under:

```text
.zsys/generated/pulumi/
├── Pulumi.yaml
├── index.ts
└── plan.json
```

These files are deterministic and can be deleted and regenerated.

### 22.4 Pulumi project identity

```text
Pulumi project name → normalized ZSys app ID
Pulumi stack name   → explicit CLI stack
resource logical name → stable graph ID-derived name
resource tags       → app ID, stack, graph hash, managed-by=zsys
```

A source file rename must not replace a cloud resource when the stable descriptor ID is unchanged.

### 22.5 Pulumi component structure

`@zsys/cloud-aws` SHOULD define reusable component resources:

```text
ZsysNetwork
ZsysContainerRegistry
ZsysApplicationService
ZsysJobQueues
ZsysEventBus
ZsysBuckets
ZsysCaches
ZsysObservability
```

Components encapsulate defaults while exposing an escape hatch only through explicitly supported ZSys configuration. Arbitrary Pulumi callbacks are not part of the POC application model.

### 22.6 Initial AWS mapping

| ZSys concept          | AWS resource                                                          |
| --------------------- | --------------------------------------------------------------------- |
| Bun/Hono runtime      | ECS/Fargate service                                                   |
| Public HTTP           | Application Load Balancer                                             |
| Container image       | ECR                                                                   |
| Job                   | SQS queue plus DLQ                                                    |
| Schedule              | EventBridge Scheduler                                                 |
| Event                 | EventBridge custom event bus                                          |
| Durable event trigger | EventBridge rule plus SQS queue/DLQ                                   |
| Bucket                | S3 bucket                                                             |
| Cache                 | ElastiCache-compatible deployment                                     |
| Logs                  | CloudWatch and optional OTLP export                                   |
| Secrets/environment   | deployment-injected process environment from configured secret source |

### 22.7 Build artifact

`zsys build` produces:

```text
.zsys/build/server/
.zsys/build/manifest.json
.zsys/build/application.graph.json
.zsys/build/openapi.json
.zsys/build/Dockerfile
```

The container image MUST:

```text
run as a non-root user
use a pinned Bun base image
contain only production files
expose liveness and readiness endpoints
handle SIGTERM
stop accepting traffic before shutdown
flush bounded telemetry
exclude local .env files and .zsys/state
```

### 22.8 Preview

`zsys deploy preview`:

1. runs `zsys check`;
2. builds the application image or computes a deterministic placeholder in plan-only tests;
3. generates the deployment plan;
4. creates/selects the Pulumi stack;
5. applies stack configuration;
6. runs Pulumi preview;
7. streams Pulumi events through the Effect logger;
8. prints a summarized resource diff;
9. writes a machine-readable preview report;
10. makes no cloud changes.

### 22.9 Deployment

`zsys deploy up` requires a successful compile and may require an interactive confirmation when destructive or security-sensitive changes are present. CI uses explicit non-interactive flags.

### 22.10 State backend

ZSys does not invent a second infrastructure state system. The user configures a Pulumi backend. Supported POC paths:

```text
Pulumi Cloud
self-managed object-storage backend supported by Pulumi
local backend for isolated development only
```

The backend URL and credentials are deployment environment configuration, not graph content.

### 22.11 IAM

Pulumi creates least-privilege task roles based on declared graph edges where practical:

```text
function uses bucket → runtime task role bucket permissions
job worker consumes queue → receive/delete/change-visibility permissions
event publisher → PutEvents permission
event worker consumes queue → queue consumer permissions
```

Because all functions share one service in the POC, IAM is service-level rather than per-function. The plan still records desired per-function capabilities for future isolation.

### 22.12 Deployment tests

Required layers:

1. pure deployment-plan tests;
2. Pulumi program unit tests with mocks;
3. snapshot tests for resource logical names and tags;
4. Pulumi preview tests against an isolated stack;
5. nightly AWS integration tests;
6. container boot/readiness/shutdown tests;
7. update test that preserves resources when source files move but IDs remain stable;
8. destroy test for an ephemeral stack.

---

## 23. Testing and verification handbook

This section is normative. A feature is not complete when only its happy-path implementation works. It is complete when its contract, failure behavior, restart behavior where applicable, telemetry, and generated artifacts are tested.

### 23.1 Test goals

The test system must answer these questions:

```text
Does the public TypeScript API infer the intended types?
Does invalid application code fail with a useful diagnostic?
Is the graph deterministic?
Does the runtime execute the same graph that the inspector displays?
Do local providers match their declared semantics?
Do failures, cancellation, retries, and restarts behave correctly?
Can a generated project install, test, build, run, and preview deployment?
Does cloud infrastructure match the deployment plan?
Are secrets absent from all observable outputs?
```

### 23.2 Test layers

| Layer                   | Purpose                                      | Default tool              |
| ----------------------- | -------------------------------------------- | ------------------------- |
| Type fixtures           | compile-time inference and expected failures | `tsc`                     |
| Unit tests              | pure functions, normalization, policies      | `bun test`                |
| Schema tests            | input/output/error validation                | `bun test`                |
| Compiler fixtures       | discovery and diagnostics                    | `bun test` + golden files |
| Graph tests             | canonical nodes, edges, hash, diff           | `bun test`                |
| Provider contract tests | shared behavior across implementations       | `bun test`                |
| Runtime integration     | engine plus providers                        | `bun test`                |
| HTTP integration        | Hono materialization and request records     | `bun test`                |
| Restart/recovery        | file-backed durability and leases            | child processes           |
| Inspector API           | versioned query and SSE protocol             | `bun test`                |
| Browser E2E             | critical Next.js flows                       | Playwright                |
| Generator smoke         | create a real project and run commands       | child processes           |
| Pulumi unit             | resource plan with mocks                     | Pulumi mocks + `bun test` |
| Cloud integration       | real isolated AWS stack                      | Pulumi preview/up/destroy |
| Container smoke         | production image lifecycle                   | Docker                    |
| Security/redaction      | no sensitive output                          | all relevant layers       |

### 23.3 Test repository layout

```text
tests/
├── types/
│   ├── valid/
│   └── invalid/
├── unit/
├── schema/
├── compiler/
│   ├── fixtures/
│   │   ├── valid-minimal/
│   │   ├── valid-full/
│   │   ├── warning-wrong-directory/
│   │   ├── warning-wrong-suffix/
│   │   ├── error-duplicate-id/
│   │   ├── error-route-collision/
│   │   ├── error-missing-target/
│   │   ├── error-event-target/
│   │   └── error-provider-profile/
│   └── golden/
├── graph/
├── contracts/
│   ├── buckets/
│   ├── cache/
│   ├── jobs/
│   └── events/
├── integration/
│   ├── engine/
│   ├── http/
│   ├── jobs/
│   ├── events/
│   ├── agents/
│   └── observability/
├── restart/
├── inspector/
├── e2e/
├── generator/
├── deployment/
├── container/
└── security/
```

Package-local unit tests MAY live beside source. Cross-package and acceptance tests belong in the root structure.

### 23.4 Standard root scripts

```json
{
  "scripts": {
    "check": "bun run scripts/check.ts",
    "typecheck": "tsc -b --pretty false",
    "lint": "bun run scripts/lint.ts",
    "test": "bun test",
    "test:types": "bun run scripts/test-types.ts",
    "test:unit": "bun test tests/unit tests/schema",
    "test:compiler": "bun test tests/compiler tests/graph",
    "test:contracts": "bun test tests/contracts",
    "test:integration": "bun test tests/integration",
    "test:restart": "bun test tests/restart",
    "test:inspector": "bun test tests/inspector",
    "test:e2e": "playwright test",
    "test:generator": "bun test tests/generator",
    "test:deployment": "bun test tests/deployment",
    "test:security": "bun test tests/security",
    "test:all": "bun run scripts/test-all.ts",
    "build": "bun run scripts/build.ts",
    "verify": "bun run scripts/verify.ts"
  }
}
```

`verify` is the merge-blocking local equivalent of CI. It runs, in order:

```text
frozen install check
format check
lint
package-boundary check
typecheck
type fixtures
unit/schema tests
compiler/graph tests
provider contracts
integration/restart tests
inspector API tests
generator smoke tests
build
generated-file no-diff check
security/redaction tests
```

Browser, container, and cloud tests MAY run in separate CI jobs because they are slower.

### 23.5 `@zsys/testing` public harness

```ts
export interface TestApplication {
  readonly runtime: TestRuntime;
  readonly http: TestHttpClient;
  readonly clock: TestClock;
  readonly fakes: TestFakes;
  readonly observability: TestObservability;

  close(): Promise<void>;
}

export async function createTestApplication(
  app: AppDescriptorAny,
  options?: TestApplicationOptions,
): Promise<TestApplication>;
```

Required capabilities:

```text
invoke a function directly
send an in-memory HTTP request
enqueue and run jobs one at a time or drain all
publish and deliver events one at a time or drain all
advance deterministic time
script model responses
seed and inspect caches
seed and inspect buckets
query logs, requests, and traces
inject failures at named provider points
restart against the same local state directory
```

### 23.6 Test isolation

Each test gets:

```text
unique temporary directory
deterministic ID source
deterministic clock unless real time is requested
isolated provider instances
isolated observability store
bounded shutdown timeout
```

Tests MUST NOT share `.zsys/state` or ports. The harness deletes temporary directories on success and retains them on failure when `ZSYS_KEEP_TEST_STATE=1`.

### 23.7 Type tests

Type fixtures compile with a dedicated `tsconfig`.

Valid example:

```ts
const output = await runtime.invoke(createOrder, {
  orderId: validId,
  customerId: validId,
  sku: "sku-1",
  quantity: 1,
});

output.total satisfies number;
```

Expected failure:

```ts
// @ts-expect-error quantity must be a number
await runtime.invoke(createOrder, {
  orderId: validId,
  customerId: validId,
  sku: "sku-1",
  quantity: "one",
});
```

Required type assertions:

```text
function input and output inference
function dependency context narrowing
route request mapping produces target input
job enqueue payload inference
event publish payload inference
event anyOf discriminated union
tool inherits target input/output/errors
agent accepts only declared tool references
cache key/value inference
bucket client available only when declared
invalid descriptor reference rejected
public types expose no Effect types
```

### 23.8 Compiler fixture format

Each fixture contains:

```text
fixture/
├── src/
├── zsys.config.ts
├── expected.diagnostics.json
├── expected.graph.json when compilation succeeds
└── expected.exit-code
```

A fixture test:

1. copies the fixture to a temporary root;
2. compiles it;
3. normalizes source root placeholders;
4. compares diagnostics exactly;
5. compares canonical graph bytes when expected;
6. compares exit code;
7. compiles again with shuffled file enumeration;
8. verifies the same graph hash.

Golden files are updated only with:

```bash
UPDATE_GOLDEN=1 bun test tests/compiler
```

A pull request updating golden output must explain the contract change.

### 23.9 Graph determinism test

The determinism suite compiles the same fixture:

```text
from two different absolute paths
with reversed source-file order
with randomized object insertion order in test descriptors
with two process IDs
with two wall-clock values
```

Expected:

```text
identical application.graph.json bytes
identical graph hash
identical OpenAPI bytes
identical generated client bytes
```

### 23.10 Provider contract suites

Each capability exports a reusable suite:

```ts
bucketProviderContract({
  name: "local",
  create: createLocalBucketProviderForTest,
  capabilities: {
    signedReadUrl: false,
    signedWriteUrl: false,
  },
});
```

```ts
eventProviderContract({
  name: "local-durable",
  create: createLocalEventProviderForTest,
  capabilities: {
    durable: true,
    orderedByKey: true,
  },
});
```

The suite defines common expected behavior. Providers cannot silently skip a test; unsupported behavior must be represented in capability metadata and asserted as unsupported.

### 23.11 Failure injection

Local/test providers support named failure points:

```text
bucket.before-write
bucket.after-write-before-ack
cache.before-set
job.after-lease
job.after-handler-success-before-ack
event.after-persist-before-fanout
event.after-handler-success-before-ack
observability.during-segment-rotation
runtime.during-provider-start
runtime.during-provider-shutdown
model.after-tool-call
```

Example:

```ts
runtime.failures.once("job.after-handler-success-before-ack");
await runtime.jobs.runNext(sendReceiptJob);
await runtime.restart();
await runtime.jobs.runNext(sendReceiptJob);

expect(invocationCount).toBe(2);
```

This proves at-least-once behavior rather than merely documenting it.

### 23.12 Engine integration tests

Required cases:

```text
direct success
input validation failure
output validation defect
declared error
unexpected thrown error
parent/child invocation metadata
trace propagation
cancellation before start
cancellation while awaiting provider
function timeout
concurrency queueing
shutdown interruption
dependency not declared
prohibited recursion
graph/manifest mismatch
provider construction failure
provider release order
```

Each test asserts result plus logs and spans.

### 23.13 HTTP integration tests

Use Hono's in-memory request path for most tests. Use a real Bun listener for disconnect, streaming, and proxy-switch behavior.

Required cases:

```text
static and parameterized route matching
query/header/path/body mapping
malformed JSON
wrong content type
body too large
schema validation error
declared function error mapping
unexpected defect mapping
timeout
client disconnect cancellation
middleware order
request ID propagation
response validation in development
request record and trace creation
OpenAPI operation matches runtime behavior
route collision rejected before startup
```

### 23.14 Job tests

Use deterministic clock and explicit `runNext`/`drain` controls. Do not use arbitrary sleeps.

```ts
await app.runtime.jobs.enqueue(sendReceiptJob, payload);
expect(app.runtime.jobs.status(sendReceiptJob).available).toBe(1);

await app.runtime.jobs.runNext(sendReceiptJob);
expect(app.runtime.jobs.status(sendReceiptJob).completed).toBe(1);
```

Retry example:

```ts
app.runtime.failures.once("job.handler.retryable");
await app.runtime.jobs.runNext(sendReceiptJob);

expect(app.runtime.jobs.status(sendReceiptJob).delayed).toBe(1);
await app.clock.advanceBy(500);
await app.runtime.jobs.runNext(sendReceiptJob);
```

### 23.15 Event tests

```ts
await app.runtime.events.publish(orderCreated, payload);
expect(app.runtime.events.pending("receipts.on-order-created")).toBe(1);

await app.runtime.events.drain();
expect(app.runtime.events.completed("receipts.on-order-created")).toBe(1);
```

Required assertions:

```text
published envelope uses deterministic IDs and time
one event fans out to all matching triggers
one trigger failure does not roll back other accepted deliveries
durable trigger survives restart
ephemeral trigger does not claim recovery
pattern selector expansion matches graph
listener target receives correct typed envelope
duplicate delivery is observable
no separate subscription graph node exists
```

### 23.16 Agent tests

Agent tests always use a fake model provider in merge-blocking CI. A real model smoke test MAY run manually or nightly and must not assert exact prose.

Required assertions:

```text
scripted tool call invokes the target function
invalid model tool arguments are rejected
unlisted tool is rejected
approval policy pauses or denies correctly
model loop stops at limit
final output is schema-validated
trace contains model and tool child spans
captured data follows policy
```

### 23.17 Observability tests

Create a synthetic secret set:

```text
password=super-secret-password
authorization=Bearer top-secret-token
cookie=session=secret-cookie
OPENAI_API_KEY=sk-secret
```

Run request, function, event, job, and agent flows. Recursively scan:

```text
terminal capture
JSON logs
NDJSON segments
request API
trace API
SSE messages
inspector server-rendered HTML
browser network responses
```

The test fails if any raw secret appears.

### 23.18 Inspector browser tests

Playwright tests use a deterministic fixture backend. Required flows:

```text
home page loads active graph hash
route list and route detail
request composer sends request
request appears live without reload
request detail shows function and child operations
function page shows declared and observed edges
event page shows event trigger, not an application subscription primitive
job retry/dead-letter controls in local mode
diagnostics update after invalid candidate
active generation remains usable after compile failure
agent timeline shows tool calls
source link has correct relative path
```

Selectors SHOULD use accessible roles and stable `data-testid` only where semantics are insufficient.

### 23.19 Generator smoke test

For each supported template and flag combination selected for CI:

1. run the locally built `create-zsys` package in a temporary parent directory;
2. verify the expected file list;
3. run `bun install --frozen-lockfile` after the generator creates `bun.lock`;
4. run `bun run check`;
5. run `bun run typecheck`;
6. run `bun run test`;
7. run `bun run build`;
8. start `zsys dev` on dynamic ports;
9. call the example route;
10. query the inspector graph API;
11. stop cleanly;
12. scan source for forbidden imports.

The generator is not releasable until this test passes from the packed package artifact, not only from workspace source.

### 23.20 Pulumi tests

#### Plan unit test

Input: canonical graph fixture.  
Output: exact deployment plan golden file.

Assert:

```text
stable logical names
correct job/event/bucket/cache mappings
required environment names
no resolved secrets
correct image and health settings
graph hash embedded
```

#### Pulumi mock test

Set Pulumi mocks before importing the generated program. Assert resource types, inputs, tags, parent relationships, and security rules.

#### Preview test

Use an isolated stack and run preview through Automation API. Assert no unhandled diagnostics and expected create/update/delete counts.

#### Real AWS test

Nightly or release-gated:

```text
create ephemeral stack
wait for readiness
call HTTP route
enqueue job and observe completion
publish event and observe listener
put/get bucket object
set/get cache value
inspect logs
deploy no-op update and assert no replacements
destroy stack
verify cleanup
```

### 23.21 Container tests

```text
image builds reproducibly
runs as non-root
liveness returns before readiness when providers are starting
readiness returns success after startup
SIGTERM stops new traffic
in-flight request drains
process exits within configured deadline
local state is not baked into image
.env files are absent
```

### 23.22 Performance baselines

Record baselines rather than prematurely optimize:

```text
compile time for 100, 1,000, and 10,000 descriptors
graph memory size
warm direct invocation overhead
warm route overhead
job throughput local provider
event fan-out throughput
request-log stream latency
inspector graph render with 1,000 nodes
candidate activation time
```

A regression budget is set after the first stable baseline. Rust is considered only after profiling identifies a justified boundary.

### 23.23 CI jobs

Recommended jobs:

```text
quality          format, lint, boundaries, typecheck
core-tests       unit, schema, compiler, graph
runtime-tests    providers, engine, HTTP, jobs, events, agents
recovery-tests   child-process crash/restart cases
inspector        API tests and Playwright
scaffolder       packed generator smoke
build            packages, generated no-diff, fixture app
security         redaction and dependency audit
pulumi           plan and mock tests
container        image lifecycle
aws-nightly      real ephemeral AWS stack
```

### 23.24 Junior developer checklist for every change

Before opening a pull request:

1. identify the contract being changed;
2. add or update the smallest unit test;
3. add an expected-failure test when validation is involved;
4. update compiler fixture/golden output when graph shape changes;
5. add integration coverage when multiple packages interact;
6. assert logs/traces when runtime behavior changes;
7. add restart coverage when durable state changes;
8. run the package tests;
9. run `bun run verify` before requesting review;
10. describe the input, output, failure behavior, and evidence in the pull request.

A pull request description SHOULD include:

```text
What changed
Why it belongs in this phase
Public input contract
Public output contract
Failure behavior
Generated graph change
Tests executed
Known limitations
```

---

## 24. Ordered implementation phases

A phase may begin only after its prerequisites are merged. Parallel work is acceptable inside a phase when package boundaries are respected. Each phase ends with a review gate and evidence committed or attached to the pull request.

### Phase 0 — Repository baseline and guardrails

#### Goal

Create a reproducible Bun/TypeScript monorepo with package boundaries, standard scripts, CI, and explicit scope guardrails.

#### Prerequisites

None.

#### Files and packages

| Path                          | Responsibility                                     |
| ----------------------------- | -------------------------------------------------- |
| `package.json`                | workspace scripts and exact package-manager policy |
| `bunfig.toml`                 | Bun workspace/test settings                        |
| `bun.lock`                    | committed dependency lock                          |
| `tsconfig.base.json`          | strict shared TypeScript settings                  |
| `tsconfig.json`               | project references                                 |
| `packages/*/package.json`     | package identity and exports                       |
| `scripts/check-boundaries.ts` | forbidden dependency/import checks                 |
| `scripts/verify.ts`           | ordered merge-blocking verification                |
| `.github/workflows/ci.yml`    | initial CI matrix                                  |
| `examples/commerce/`          | empty example application shell                    |
| `docs/adr/`                   | accepted architectural decisions                   |

#### Dependencies

```text
Bun
TypeScript
@types/bun
no runtime framework dependencies yet
```

#### Inputs

```text
package list from Section 6
scope decisions from Section 2
dependency direction from Section 6.5
```

#### Steps

1. Initialize a private Bun workspace.
2. Create every package directory with a minimal `package.json`, `src/index.ts`, and `tsconfig.json`.
3. Enable strict TypeScript options including `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, and `verbatimModuleSyntax` where compatible.
4. Configure package exports so internal source paths cannot be imported accidentally.
5. Implement a boundary checker that reads workspace package dependencies and source imports.
6. Reject runtime imports from descriptor packages.
7. Reject application imports of internal packages in the fixture app.
8. Add a source scan that rejects obsolete subsystem directories and public APIs not in scope.
9. Configure frozen installation in CI.
10. Add `verify` with placeholder tasks that become real in later phases.
11. Record ADRs for function-only execution, internal Effect, event triggers, global providers, Pulumi, AWS-first, and convention warnings.

#### Outputs

```text
workspace installs with bun install --frozen-lockfile
all package shells typecheck
boundary checker passes
CI runs on every pull request
fixture application has no runtime implementation yet
```

#### Expected behavior

A junior developer can clone the repository, run:

```bash
bun install --frozen-lockfile
bun run typecheck
bun run verify
```

and receive deterministic success with no hidden setup.

#### Required tests

```text
boundary checker allows valid dependency direction
boundary checker rejects descriptor → runtime import
fixture app rejects direct effect/hono/next/pulumi imports
lockfile modification fails CI no-diff check
package export smoke test
```

#### Definition of done

- clean checkout passes the three commands above;
- CI uses the same commands;
- no package has an undeclared dependency;
- ADRs are reviewed;
- package names and ownership are assigned.

#### Common mistakes

```text
putting implementation into package index files before contracts exist
using relative imports across package roots
letting the fixture app import workspace internals
adding an alternate deployment engine “temporarily”
```

---

### Phase 1 — Contracts, schemas, environment DSL, and diagnostics

#### Goal

Implement the small stable foundation used by all descriptors and generated artifacts.

#### Prerequisites

Phase 0.

#### Files and packages

| Path                                        | Responsibility                                           |
| ------------------------------------------- | -------------------------------------------------------- |
| `packages/contracts/src/json.ts`            | JSON boundary types and guards                           |
| `packages/contracts/src/id.ts`              | branded IDs and normalization                            |
| `packages/contracts/src/source-location.ts` | portable source locations                                |
| `packages/contracts/src/version.ts`         | protocol/generator versions                              |
| `packages/schema/src/index.ts`              | supported schema builder exports                         |
| `packages/schema/src/standard-schema.ts`    | Standard Schema bridge                                   |
| `packages/schema/src/json-schema.ts`        | deterministic JSON Schema extraction                     |
| `packages/config/src/env.ts`                | public environment DSL                                   |
| `packages/config/src/resolve.ts`            | runtime validation contract, not resolution side effects |
| `packages/diagnostics/src/diagnostic.ts`    | diagnostic model                                         |
| `packages/diagnostics/src/reporter.ts`      | text and JSON reporters                                  |

#### Dependencies

```text
typescript
chosen schema implementation inside @zsys/schema
Standard Schema types or local minimal compatible definitions
Effect only in an internal config-compilation module, not public types
```

#### Inputs

```text
schema examples
environment examples
diagnostic codes
canonical JSON requirements
```

#### Steps

1. Implement `JsonValue` guards and canonical serializer.
2. Implement stable ID validation and normalization without deriving IDs from paths.
3. Define source locations relative to project root.
4. Expose a familiar `z` builder from `@zsys/schema`.
5. Accept any Standard Schema-compatible object through a bridge.
6. Implement deterministic JSON Schema generation with stable property ordering.
7. Fail clearly when a third-party schema cannot provide the information needed for OpenAPI.
8. Implement `defineEnv` and builders for string, number, boolean, port, literal, URL, JSON, and secret.
9. Implement environment-specific requirement metadata.
10. Implement diagnostic formatting with source excerpts and related locations.
11. Add JSON reporter output suitable for inspector and CI.
12. Verify public declaration files contain no Effect types.

#### Outputs

```text
stable JSON serializer
schema validation and JSON Schema output
typed environment descriptor
diagnostic model and reporters
version constants
```

#### Expected behavior

```ts
const User = z.object({ id: z.string().uuid() });
const result = await validate(User, unknownValue);
```

produces either a typed value or stable structured issues. Environment declarations produce types but do not read `process.env` during module evaluation.

#### Required tests

```text
canonical JSON property order
invalid JSON values rejected
ID valid/invalid matrix
schema async and sync validation
JSON Schema golden files
third-party Standard Schema bridge
secret metadata never contains value
environment defaults and requiredIn rules
diagnostic text and JSON snapshots
public declaration scan for Effect types
```

#### Commands

```bash
bun test packages/contracts packages/schema packages/config packages/diagnostics
bun run typecheck
```

#### Definition of done

- schemas validate and serialize deterministically;
- environment descriptors are value-free metadata;
- diagnostics have stable codes and locations;
- foundation APIs are documented with examples.

#### Common mistakes

```text
reading process.env inside defineEnv
including functions in graph-facing schema metadata
using Effect Schema in public examples
putting absolute paths in diagnostics snapshots
```

---

### Phase 2 — Public descriptor factories and conventions

#### Goal

Implement immutable, side-effect-free application declarations for every in-scope concept.

#### Prerequisites

Phase 1.

#### Files and packages

| Path                                        | Responsibility                        |
| ------------------------------------------- | ------------------------------------- |
| `packages/app/src/index.ts`                 | common public re-exports              |
| `packages/app/src/define-app.ts`            | app descriptor                        |
| `packages/functions/src/define-function.ts` | function descriptor and reference     |
| `packages/functions/src/define-error.ts`    | declared error factory                |
| `packages/routes/src/define-route.ts`       | route descriptor                      |
| `packages/routes/src/http-dsl.ts`           | serializable request/response mapping |
| `packages/jobs/src/define-job.ts`           | job and schedule descriptor           |
| `packages/events/src/define-event.ts`       | event contract                        |
| `packages/events/src/on-event.ts`           | event trigger descriptor              |
| `packages/events/src/selectors.ts`          | one/anyOf/match/all selectors         |
| `packages/buckets/src/define-bucket.ts`     | bucket descriptor                     |
| `packages/cache/src/define-cache.ts`        | cache descriptor                      |
| `packages/tools/src/define-tool.ts`         | function-to-tool descriptor           |
| `packages/agents/src/define-agent.ts`       | agent descriptor                      |
| `packages/compiler/src/conventions.ts`      | suffix/directory diagnostics          |

#### Dependencies

```text
@zsys/contracts
@zsys/schema
@zsys/config
@zsys/diagnostics
```

No runtime packages.

#### Inputs

```text
public interfaces from Section 7
suffix table from Section 5
provider profile references
```

#### Steps

1. Implement the global descriptor brand and guards.
2. Implement explicit stable references from every factory.
3. Deep-freeze descriptors in development/test.
4. Implement function dependency maps and typed public context projection.
5. Implement `defineError` with safe public data and retry metadata.
6. Implement a route mapping AST rather than executable mapping callbacks.
7. Implement job retry, idempotency, and schedule validation that is local to the descriptor.
8. Implement `defineEvent` and `onEvent`; do not add a subscription descriptor.
9. Implement typed event selector combinators.
10. Implement logical provider profile fields.
11. Implement tool schema inheritance from function references.
12. Implement agent tool reference and limit validation.
13. Implement convention diagnosis as a pure function over descriptor kind and source path.
14. Add API documentation and examples to package READMEs.

#### Outputs

```text
all public descriptor factories
stable references
typed handler context
serializable route/event selector DSLs
warning-only convention checker
```

#### Expected behavior

Importing a descriptor module creates values only. It does not register anything or start work. A descriptor in the wrong directory remains valid and generates a warning.

#### Required tests

```text
descriptor brand and freeze
stable refs
duplicate object mutation rejected in development
function context type narrowing
route DSL serialization
job policy validation
event selector types
onEvent returns event-trigger descriptor
no defineSubscription export exists
tool inherits function schemas
agent rejects non-tool references
all convention warning codes
```

#### Commands

```bash
bun run test:types
bun test packages/app packages/functions packages/routes packages/jobs packages/events packages/buckets packages/cache packages/tools packages/agents
```

#### Definition of done

- full fixture application can be authored but not yet compiled;
- no factory imports runtime packages;
- public examples contain normal async handlers only;
- conventions never block a valid descriptor.

#### Common mistakes

```text
registering descriptors in global mutable arrays
putting provider clients in descriptors
using a handler on route/job/event trigger/tool
exposing internal Effect return types
adding a subscription file convention
```

---

### Phase 3 — Discovery, compiler, graph, manifest, and code generation

#### Goal

Turn source descriptors into one deterministic graph and matching executable manifest.

#### Prerequisites

Phases 1–2.

#### Files and packages

| Path                                               | Responsibility                  |
| -------------------------------------------------- | ------------------------------- |
| `packages/compiler/src/config-loader.ts`           | load `zsys.config.ts`           |
| `packages/compiler/src/discovery/ast-prefilter.ts` | candidate scan                  |
| `packages/compiler/src/discovery/evaluator.ts`     | isolated module evaluation      |
| `packages/compiler/src/extract.ts`                 | descriptor extraction           |
| `packages/compiler/src/normalize.ts`               | normalized contracts            |
| `packages/compiler/src/validate/*.ts`              | semantic validation passes      |
| `packages/compiler/src/source-map.ts`              | source location capture         |
| `packages/compiler/src/generate-manifest.ts`       | executable reference generation |
| `packages/graph/src/model.ts`                      | graph node/edge contracts       |
| `packages/graph/src/build.ts`                      | graph construction              |
| `packages/graph/src/hash.ts`                       | canonical hash                  |
| `packages/graph/src/diff.ts`                       | compatibility diff              |
| `tests/compiler/fixtures/*`                        | valid/warning/error fixtures    |

#### Dependencies

```text
typescript compiler API
Bun child processes
foundation and descriptor packages
no Hono, provider, or Pulumi dependency
```

#### Inputs

```text
zsys.config.ts
descriptor source files
app entry path
relative project root
```

#### Steps

1. Load and validate tooling configuration.
2. Enumerate source files with stable sorting and exclusions.
3. Implement AST prefilter without execution.
4. Implement isolated evaluation child process with timeout and structured protocol.
5. Capture exported descriptors and source positions.
6. Resolve references and report missing targets.
7. Convert route descriptors to HTTP trigger graph nodes.
8. Convert event listener descriptors to event trigger graph nodes.
9. Expand event selectors into explicit event/version pairs.
10. Build declared dependency edges from function dependency maps.
11. Validate mapping/schema compatibility as far as the POC type/runtime information allows.
12. Detect route collisions and cycles.
13. Sort nodes/edges and generate canonical JSON.
14. Compute graph hash.
15. Generate runtime manifest imports and handler map.
16. Embed graph hash in the manifest.
17. Generate diagnostics JSON.
18. Implement graph diff.
19. Add watch-friendly incremental invalidation while preserving deterministic full output.

#### Outputs

```text
application.graph.json
runtime.manifest.ts
diagnostics.json
graph hash
compiler result API
compatibility diff API
```

#### Expected behavior

Compiling the same application from different absolute paths produces identical canonical graph bytes. A warning-only fixture exits zero. An error fixture exits non-zero and emits no activatable manifest.

#### Required tests

Use every fixture listed in Section 23.8 plus:

```text
shuffled enumeration determinism
source path normalization
manifest import generation
graph/manifest hash equality
event selector expansion
declared edge generation
route trigger generation
no subscription node
no forbidden subsystem nodes
compatibility diff classifications
```

#### Commands

```bash
bun run test:compiler
bun run test:types
```

#### Definition of done

- the full fixture compiles deterministically;
- all semantic errors have useful locations;
- the graph is sufficient for inspector and runtime planning;
- the manifest contains every authored function handler exactly once.

#### Common mistakes

```text
using filesystem path as descriptor ID
including generation timestamp in hash
executing every source file rather than candidates
letting module logs corrupt evaluator protocol
storing handler closures in JSON
```

---

### Phase 4 — Internal Effect runtime, lifecycle, and logging

#### Goal

Build the internal execution substrate while keeping Effect absent from application types.

#### Prerequisites

Phases 1 and 3.

#### Files and packages

| Path                                            | Responsibility                   |
| ----------------------------------------------- | -------------------------------- |
| `packages/runtime-effect/src/runtime.ts`        | managed runtime construction     |
| `packages/runtime-effect/src/services.ts`       | internal service tags            |
| `packages/runtime-effect/src/handler-bridge.ts` | Promise handler to Effect bridge |
| `packages/runtime-effect/src/failure.ts`        | internal failure algebra         |
| `packages/runtime-effect/src/scope.ts`          | acquisition/release ordering     |
| `packages/runtime-effect/src/logger.ts`         | Effect logger sinks              |
| `packages/runtime-effect/src/tracing.ts`        | span creation/propagation        |
| `packages/runtime-effect/src/clock.ts`          | public clock bridge              |
| `packages/runtime-effect/src/abort.ts`          | fiber/AbortSignal bridge         |
| `packages/engine/src/lifecycle.ts`              | generation lifecycle state       |

#### Dependencies

```text
effect
@effect/platform-bun or supported Bun platform package
@zsys/contracts
@zsys/diagnostics
```

#### Inputs

```text
resolved environment values
runtime provider factories
invocation metadata
plain application handler
```

#### Steps

1. Construct a managed Effect runtime per backend generation.
2. Define internal services for graph, manifest, providers, observability, IDs, clock, and shutdown.
3. Implement the handler bridge for sync values, Promises, thrown errors, and cancellation.
4. Map declared errors separately from defects.
5. Implement parent/child trace context.
6. Implement deadline calculation and interruption.
7. Build `ctx.signal`, `ctx.time`, and `ctx.log` bridges.
8. Route all framework and CLI logs through Effect logger services.
9. Implement human and JSON log sinks.
10. Implement redaction before any sink.
11. Implement scoped acquisition and reverse release.
12. Add declaration scanning to ensure public `.d.ts` files expose no Effect symbols.

#### Outputs

```text
managed internal runtime
plain-handler bridge
structured logger
trace primitives
clock and cancellation bridge
lifecycle service
```

#### Expected behavior

A plain async handler runs inside an Effect fiber. Interrupting the fiber aborts `ctx.signal`. A thrown declared error becomes a typed invocation failure; an unknown exception becomes a defect. All logs include invocation/trace metadata automatically.

#### Required tests

```text
sync handler
async handler
thrown declared error
unknown thrown error
promise rejection
interrupt aborts signal
timeout
parent/child span
log annotations
redaction before sink
resource release on success/failure/interruption
public declaration Effect leak scan
```

#### Commands

```bash
bun test packages/runtime-effect packages/engine
bun run typecheck
```

#### Definition of done

- no application example imports Effect;
- runtime shutdown releases every acquired service;
- logs are produced only through approved sinks;
- deterministic test clock works.

#### Common mistakes

```text
calling Effect.runPromise independently for every context method without parent context
losing cancellation when wrapping Promises
logging a cause before redaction
returning raw stack traces to public callers
```

---

### Phase 5 — Function engine and test harness foundation

#### Goal

Register and invoke functions from the graph/manifest with validation, dependencies, concurrency, traces, and direct composition.

#### Prerequisites

Phases 3–4.

#### Files and packages

| Path                                      | Responsibility                       |
| ----------------------------------------- | ------------------------------------ |
| `packages/engine/src/registry.ts`         | function registry keyed by stable ID |
| `packages/engine/src/invoke.ts`           | invocation pipeline                  |
| `packages/engine/src/context.ts`          | typed public context construction    |
| `packages/engine/src/concurrency.ts`      | per-function admission               |
| `packages/engine/src/dependencies.ts`     | declared dependency enforcement      |
| `packages/engine/src/recursion.ts`        | call-stack policy                    |
| `packages/testing/src/runtime.ts`         | first test runtime                   |
| `packages/testing/src/invoke-function.ts` | standalone function helper           |
| `packages/testing/src/fakes.ts`           | initial dependency fakes             |

#### Dependencies

```text
@zsys/graph
@zsys/runtime-effect
@zsys/schema
@zsys/observability contract stubs
```

#### Inputs

```text
function nodes
runtime manifest handlers
validated input
invocation source metadata
```

#### Steps

1. Verify manifest hash before registry construction.
2. Register each function handler once.
3. Validate input.
4. Apply concurrency admission and deadline.
5. Create invocation record and root/child span.
6. Construct context containing only declared dependency clients.
7. Invoke through the Effect handler bridge.
8. Validate output.
9. Normalize errors and defects.
10. Record completion telemetry.
11. Implement direct child function calls.
12. Enforce recursion policy.
13. Implement `invokeFunction` test helper with default test context.
14. Implement `createTestRuntime` skeleton.

#### Outputs

```text
function registry
invocation engine
public context construction
direct invocation client
test harness foundation
```

#### Expected behavior

Every execution path—later HTTP, job, event, tool, or agent—calls the same `engine.invoke` API. The handler sees no transport-specific object.

#### Required tests

All engine tests from Section 23.12, plus type tests for dependency context narrowing.

#### Commands

```bash
bun test packages/engine packages/testing tests/integration/engine
bun run test:types
```

#### Definition of done

- full fixture functions invoke directly;
- validation, errors, timeouts, and cancellation are observable;
- undeclared dependency access is impossible in types and rejected at runtime through forged inputs;
- test helper is usable by generated examples.

#### Common mistakes

```text
duplicating invocation logic in future materializers
validating output only in tests
sharing mutable context between invocations
counting waiting calls as active concurrency incorrectly
```

---

### Phase 6 — Routes, Hono materialization, OpenAPI, and HTTP client

#### Goal

Generate and run the internal Hono application exclusively from graph trigger nodes.

#### Prerequisites

Phases 3 and 5.

#### Files and packages

| Path                                              | Responsibility              |
| ------------------------------------------------- | --------------------------- |
| `packages/runtime-hono/src/create-app.ts`         | Hono application creation   |
| `packages/runtime-hono/src/materialize-routes.ts` | HTTP trigger registration   |
| `packages/runtime-hono/src/request-mapping.ts`    | mapping AST execution       |
| `packages/runtime-hono/src/response-mapping.ts`   | result/error conversion     |
| `packages/runtime-hono/src/middleware.ts`         | generic middleware pipeline |
| `packages/runtime-hono/src/internal-endpoints.ts` | health and inspector APIs   |
| `packages/openapi/src/generate.ts`                | OpenAPI 3.1 generation      |
| `packages/client-generator/src/generate.ts`       | typed HTTP client           |
| `packages/testing/src/http.ts`                    | in-memory HTTP harness      |

#### Dependencies

```text
hono
@zsys/engine
@zsys/graph
@zsys/schema
@zsys/observability contracts
```

#### Inputs

```text
HTTP trigger registration plan
function schemas and errors
route request/response mapping
middleware manifest
```

#### Steps

1. Build deterministic route precedence.
2. Install framework middleware for IDs, traces, limits, and request records.
3. Execute request mapping AST.
4. Validate mapped function input.
5. Invoke target through the engine with source `http`.
6. Convert declared errors and validation failures to responses.
7. Validate development/test responses.
8. Implement liveness/readiness and versioned internal APIs.
9. Generate OpenAPI from graph.
10. Generate typed client from OpenAPI/graph contracts.
11. Add in-memory Hono test client.
12. Add real Bun listener tests for disconnect behavior.

#### Outputs

```text
working HTTP server
OpenAPI JSON
generated TypeScript client
HTTP test harness
request telemetry hooks
```

#### Expected behavior

The `/hello` generated-project route works without the application importing Hono. Runtime routes, OpenAPI, client methods, and inspector metadata all agree because they come from the graph.

#### Required tests

All HTTP tests from Section 23.13 plus:

```text
OpenAPI golden
client type inference
client status/error union
internal endpoint versioning
no Hono type in public handler context
```

#### Commands

```bash
bun test packages/runtime-hono packages/openapi packages/client-generator tests/integration/http
```

#### Definition of done

- fixture app serves all routes;
- OpenAPI/client generation is deterministic;
- request failures create safe records;
- client disconnect interrupts the function.

#### Common mistakes

```text
scanning Hono to generate OpenAPI
passing Hono context to a handler
using arbitrary request-mapping closures
registering internal endpoints before collision checks
```

---

### Phase 7 — Global providers, buckets, and cache

#### Goal

Implement global provider selection and the first local managed capabilities.

#### Prerequisites

Phases 2, 4, and 5.

#### Files and packages

| Path                                       | Responsibility                         |
| ------------------------------------------ | -------------------------------------- |
| `packages/app/src/providers.ts`            | serializable provider-set declarations |
| `packages/engine/src/provider-registry.ts` | active provider resolution             |
| `packages/providers-local/src/index.ts`    | local provider set                     |
| `packages/providers-local/src/buckets/*`   | atomic filesystem bucket               |
| `packages/providers-local/src/cache/*`     | bounded typed cache                    |
| `packages/buckets/src/client.ts`           | public Promise client contract         |
| `packages/cache/src/client.ts`             | public Promise client contract         |
| `packages/testing/src/buckets.ts`          | bucket fakes/inspectors                |
| `packages/testing/src/cache.ts`            | cache fakes/inspectors                 |
| `tests/contracts/buckets/*`                | reusable bucket provider suite         |
| `tests/contracts/cache/*`                  | reusable cache provider suite          |

#### Dependencies

```text
@zsys/runtime-effect
filesystem APIs
internal hashing/canonical JSON
```

#### Inputs

```text
active environment
provider set from app descriptor
bucket/cache graph nodes
function dependency declarations
```

#### Steps

1. Resolve the provider set for the active environment.
2. Validate every referenced logical profile.
3. Construct providers within the generation scope.
4. Implement bucket key normalization and atomic writes.
5. Implement bucket metadata, limits, and listing.
6. Implement cache canonical keys, TTL, bounds, and single-flight.
7. Create typed public clients through the invocation bridge.
8. Add declared/observed graph edge telemetry.
9. Add readiness and shutdown behavior.
10. Implement fakes and shared contract suites.

#### Outputs

```text
global provider registry
local bucket provider
local cache provider
typed context clients
provider contract suites
```

#### Expected behavior

A descriptor declares only logical policy. Changing the global provider set changes implementation without changing function code or graph resource identity.

#### Required tests

All bucket/cache tests from Section 17.10 plus provider startup failure, shutdown, profile mismatch, and function dependency enforcement.

#### Commands

```bash
bun run test:contracts
bun test tests/integration/engine
```

#### Definition of done

- local fixture can store objects and cache values;
- provider contract suite passes;
- graph contains logical profiles but no live clients or credentials;
- local state survives restart where promised.

#### Common mistakes

```text
putting filesystem paths in bucket descriptors
using JSON.stringify without canonical ordering for cache keys
letting cache TTL tests depend on real sleeps
creating one provider per function instead of per generation
```

---

### Phase 8 — Durable jobs and schedules

#### Goal

Implement typed at-least-once jobs, retries, leases, idempotency records, schedules, and restart recovery.

#### Prerequisites

Phases 5 and 7.

#### Files and packages

| Path                                             | Responsibility                          |
| ------------------------------------------------ | --------------------------------------- |
| `packages/jobs/src/client.ts`                    | enqueue API                             |
| `packages/engine/src/materialize-jobs.ts`        | queue/schedule plan binding             |
| `packages/providers-local/src/jobs/store.ts`     | append-only durable state               |
| `packages/providers-local/src/jobs/queue.ts`     | availability and lease logic            |
| `packages/providers-local/src/jobs/retry.ts`     | delay calculation                       |
| `packages/providers-local/src/jobs/scheduler.ts` | cron/test-clock scheduler               |
| `packages/providers-local/src/jobs/admin.ts`     | local retry/cancel/dead-letter controls |
| `packages/testing/src/jobs.ts`                   | deterministic job harness               |
| `tests/contracts/jobs/*`                         | provider contract suite                 |
| `tests/restart/jobs/*`                           | child-process recovery tests            |

#### Dependencies

```text
@zsys/engine
@zsys/runtime-effect
cron parser selected and wrapped internally
filesystem atomic operations
```

#### Inputs

```text
job nodes
queue and schedule trigger plan
retry/idempotency policy
job target function
```

#### Steps

1. Implement job input validation at enqueue.
2. Persist accepted messages before acknowledgement.
3. Implement available/delayed/leased/completed/dead-letter states.
4. Implement lease acquisition and expiry.
5. Invoke target through the common engine with source `job`.
6. Classify declared errors by retry metadata.
7. Implement exponential delay and deterministic jitter source in tests.
8. Implement idempotency record lookup and retention.
9. Implement schedule parsing and next-fire calculation.
10. Implement overlap policy.
11. Implement startup recovery and malformed-record quarantine.
12. Expose job status/query/admin APIs to inspector protocol.
13. Add failure injection points.

#### Outputs

```text
durable local job provider
schedule runtime
typed enqueue client
job telemetry and inspector API
restart test harness
```

#### Expected behavior

A crash after handler success but before acknowledgement can cause a duplicate. A lease expires and work becomes available again. Retries advance using the test clock without arbitrary sleeps.

#### Required tests

All tests from Sections 15.7 and 23.14, including child-process kill and restart.

#### Commands

```bash
bun test tests/contracts/jobs tests/integration/jobs tests/restart/jobs
```

#### Definition of done

- durable fixture jobs recover after process restart;
- state machine is visible in API and logs;
- duplicate behavior is tested and documented;
- schedules fire deterministically.

#### Common mistakes

```text
marking completed before handler success
using setTimeout sleeps in tests
claiming exactly-once delivery
forgetting to renew or expire leases
allowing malformed state to crash startup without quarantine
```

---

### Phase 9 — Events, pub/sub, and event-trigger materialization

#### Goal

Implement versioned event publication and function trigger bindings with ephemeral and durable delivery.

#### Prerequisites

Phases 5, 7, and 8 for reusable durable-state patterns.

#### Files and packages

| Path                                               | Responsibility                          |
| -------------------------------------------------- | --------------------------------------- |
| `packages/events/src/client.ts`                    | typed publish API                       |
| `packages/engine/src/materialize-events.ts`        | event contract and trigger registration |
| `packages/providers-local/src/events/log.ts`       | accepted event envelope log             |
| `packages/providers-local/src/events/router.ts`    | selector matching and fan-out           |
| `packages/providers-local/src/events/delivery.ts`  | durable leases/retries                  |
| `packages/providers-local/src/events/ephemeral.ts` | transient in-process delivery           |
| `packages/testing/src/events.ts`                   | publish/drain/inspect harness           |
| `tests/contracts/events/*`                         | provider contract suite                 |
| `tests/restart/events/*`                           | durable recovery tests                  |

#### Dependencies

```text
@zsys/engine
@zsys/runtime-effect
job-style lease and retry utilities
canonical event envelope serializer
```

#### Inputs

```text
event graph nodes
event trigger graph nodes
expanded selector event/version pairs
target function refs
delivery and retry policy
```

#### Steps

1. Validate event payload before provider acceptance.
2. Create deterministic envelope fields in tests and secure IDs in runtime.
3. Persist durable events before acknowledging publication.
4. Match explicit selector expansions, not source patterns at runtime.
5. Fan out one accepted event to all matching event triggers.
6. Execute each listener target through the function engine with source `event`.
7. Implement ephemeral delivery with explicit loss semantics.
8. Implement durable delivery leases, retry, and dead-letter state.
9. Preserve correlation, causation, trace, key, and attributes.
10. Add per-key ordering capability metadata.
11. Add event/query/delivery APIs for inspector.
12. Add failure injection after persistence, fan-out, handler success, and acknowledgement.
13. Verify no public `defineSubscription` or subscription node exists.

#### Outputs

```text
typed event publishing
ephemeral event provider
durable event provider
event-trigger materialization
delivery telemetry and inspector APIs
```

#### Expected behavior

One published event can invoke multiple independent functions. A durable listener may receive a duplicate after a crash. A raw all-event listener is restricted and warned. The inspector displays event triggers/listeners.

#### Required tests

All tests from Sections 16.13 and 23.15, plus source scan ensuring no `*.subscription.ts` fixture is generated.

#### Commands

```bash
bun test tests/contracts/events tests/integration/events tests/restart/events
bun run test:types
```

#### Definition of done

- full fixture publishes and consumes events;
- selector expansion is deterministic;
- durable delivery survives restart;
- event pages can be driven entirely by APIs.

#### Common mistakes

```text
re-evaluating wildcard patterns against unknown runtime event names
rolling back successful fan-out deliveries when one listener fails
losing event version in target input
using “subscription” as a new graph resource
```

---

### Phase 10 — Tools, agents, and fake model runtime

#### Goal

Expose functions safely as tools and implement bounded agent execution using global model profiles.

#### Prerequisites

Phases 5, 7, and 9.

#### Files and packages

| Path                                          | Responsibility                        |
| --------------------------------------------- | ------------------------------------- |
| `packages/tools/src/runtime.ts`               | tool validation and invocation policy |
| `packages/agents/src/runtime.ts`              | agent loop contract                   |
| `packages/agents/src/generated-function.ts`   | generated agent invocation identity   |
| `packages/agents/src/model-provider.ts`       | internal provider interface           |
| `packages/agents/src/approval.ts`             | tool approval state                   |
| `packages/providers-local/src/models/fake.ts` | scripted fake model                   |
| `packages/testing/src/agents.ts`              | agent script and assertion helpers    |
| `tests/integration/agents/*`                  | deterministic agent tests             |

#### Dependencies

```text
@zsys/engine
@zsys/runtime-effect
@zsys/schema
global provider registry
```

#### Inputs

```text
tool nodes and target functions
agent nodes
model profile configuration
scripted or real model provider response
```

#### Steps

1. Derive tool schemas from target function contracts.
2. Validate model tool arguments before invocation.
3. Enforce tool allowlist and side-effect approval policy.
4. Invoke tool target through the common engine with source `tool`.
5. Generate one internal function identity per agent.
6. Implement bounded model/tool loop.
7. Enforce max steps, max tool calls, response size, timeout, and cancellation.
8. Validate final agent output.
9. Add model/tool child spans and safe metadata.
10. Implement scripted fake model provider.
11. Add inspector query model for agent timelines and pending approvals.
12. Keep prompt/result capture disabled by default.

#### Outputs

```text
function-backed tools
bounded agent runtime
generated agent functions
fake model provider
agent telemetry and tests
```

#### Expected behavior

An agent can call only declared tools. Every tool call is an ordinary function invocation and appears in traces. Merge-blocking tests do not call external model APIs.

#### Required tests

All tests from Sections 18.9 and 23.16.

#### Commands

```bash
bun test packages/tools packages/agents tests/integration/agents
```

#### Definition of done

- scripted support-agent fixture completes deterministically;
- limits and approvals cannot be bypassed;
- final output is validated;
- no model secret or prompt is logged by default.

#### Common mistakes

```text
letting tools own duplicate handlers
trusting model-produced JSON without validation
continuing the loop after cancellation
storing full prompts by default
using vendor model names in agent descriptors instead of logical profiles
```

---

### Phase 11 — Observability, logs, traces, and request history

#### Goal

Implement correlated structured telemetry, bounded local storage, query APIs, and live SSE.

#### Prerequisites

Phases 4–10.

#### Files and packages

| Path                                             | Responsibility                    |
| ------------------------------------------------ | --------------------------------- |
| `packages/observability/src/model.ts`            | request/log/span record contracts |
| `packages/observability/src/collector.ts`        | in-memory event collection        |
| `packages/observability/src/redaction.ts`        | field/value redaction             |
| `packages/observability/src/storage/segments.ts` | NDJSON append/rotation            |
| `packages/observability/src/storage/index.ts`    | bounded query index               |
| `packages/observability/src/query.ts`            | filters and pagination            |
| `packages/observability/src/stream.ts`           | cursor-based live stream          |
| `packages/inspector-api/src/observability.ts`    | HTTP/SSE routes                   |
| `tests/security/redaction/*`                     | recursive secret scans            |

#### Dependencies

```text
@zsys/runtime-effect
filesystem APIs
Hono internal endpoints
```

#### Inputs

```text
runtime log events
span lifecycle events
request lifecycle events
job/event/tool/agent state changes
observability configuration
```

#### Steps

1. Define versioned record contracts.
2. Build one collector entry point used by runtime components.
3. Redact before records reach memory, disk, terminal, JSON, or SSE sinks.
4. Implement human and production JSON logger formats.
5. Implement request lifecycle records.
6. Implement span trees and correlation indexes.
7. Implement append-only NDJSON segments and rotation.
8. Implement startup repair and malformed segment quarantine.
9. Implement bounded retention by age and total bytes.
10. Implement query filters, pagination, and stable cursors.
11. Implement SSE with reconnect cursor and backpressure counters.
12. Add body capture policy with strict defaults.
13. Add recursive secret-leak tests.

#### Outputs

```text
request history
logs and traces
local retention
versioned query APIs
live SSE
terminal logger
```

#### Expected behavior

A completed HTTP request appears in terminal output, request API, trace API, and live SSE with the same request/trace IDs. No raw secret appears in any sink.

#### Required tests

All tests from Sections 19.9 and 23.17.

#### Commands

```bash
bun test packages/observability tests/integration/observability tests/security/redaction
```

#### Definition of done

- request logs are queryable without a separate application data service;
- startup repairs a truncated final line;
- live stream reconnect works;
- secret scan passes.

#### Common mistakes

```text
redacting only terminal output but not disk/SSE
storing raw bodies before deciding whether to redact
using unbounded in-memory arrays
creating different correlation IDs in different subsystems
```

---

### Phase 12 — Supervisor and versioned inspector API

#### Goal

Implement safe candidate activation, stable proxying, generation lifecycle, and all backend APIs needed by the UI.

#### Prerequisites

Phases 3–11.

#### Files and packages

| Path                                       | Responsibility                          |
| ------------------------------------------ | --------------------------------------- |
| `packages/supervisor/src/state-machine.ts` | generation states and transitions       |
| `packages/supervisor/src/watcher.ts`       | grouped file change detection           |
| `packages/supervisor/src/candidate.ts`     | compile/start/verify candidate          |
| `packages/supervisor/src/proxy.ts`         | stable-port active target               |
| `packages/supervisor/src/drain.ts`         | old generation shutdown                 |
| `packages/inspector-api/src/router.ts`     | versioned API root                      |
| `packages/inspector-api/src/graph.ts`      | graph queries                           |
| `packages/inspector-api/src/runtime.ts`    | functions/jobs/events/resources queries |
| `packages/inspector-api/src/actions.ts`    | local safe actions                      |
| `packages/cli/src/commands/dev.ts`         | `zsys dev` orchestration                |

#### Dependencies

```text
@zsys/compiler
@zsys/engine
@zsys/runtime-hono
@zsys/observability
Effect internal runtime
```

#### Inputs

```text
source change batch
candidate graph and manifest
candidate readiness result
active generation metadata
```

#### Steps

1. Implement explicit supervisor state machine.
2. Debounce/coalesce source changes without losing the latest version.
3. Compile candidate into generation-specific output directory.
4. Start candidate on an internal dynamic port.
5. verify graph hash, manifest hash, internal API version, and readiness.
6. Switch proxy atomically.
7. Drain old generation with timeout and cancellation.
8. Preserve active generation on any candidate failure.
9. Emit generation lifecycle logs and SSE events.
10. Implement versioned graph, descriptor, request, log, trace, diagnostics, and runtime-state APIs.
11. Implement local-only function invocation, job retry/cancel, event retry, and tool approval endpoints with safety checks.
12. Add production protection/disable rules.

#### Outputs

```text
zsys dev backend supervisor
stable development port
safe hot activation
complete inspector backend API
```

#### Expected behavior

Saving invalid TypeScript displays diagnostics but the previously working route remains reachable. Fixing the source activates a new generation and the inspector receives a live generation-change event.

#### Required tests

All supervisor/API tests from Sections 20.12 and 23.18 that do not require the browser.

#### Commands

```bash
bun test packages/supervisor packages/inspector-api tests/inspector
```

#### Definition of done

- candidate failure never destroys active development service;
- old requests drain correctly;
- every required inspector page has a versioned backend endpoint;
- production control endpoints are protected.

#### Common mistakes

```text
restarting the active backend before candidate verification
sharing output directories between generations
proxying SSE without preserving cursors
letting the UI read provider files directly
```

---

### Phase 13 — Next.js inspector

#### Goal

Build the graph-driven development UI with request composer, live logs, traces, diagnostics, and managed-capability views.

#### Prerequisites

Phase 12.

#### Files and packages

| Path                               | Responsibility                                    |
| ---------------------------------- | ------------------------------------------------- |
| `apps/inspector/app/layout.tsx`    | application shell                                 |
| `apps/inspector/app/page.tsx`      | overview                                          |
| `apps/inspector/app/graph/*`       | graph view                                        |
| `apps/inspector/app/routes/*`      | route list/detail/composer                        |
| `apps/inspector/app/functions/*`   | function list/detail/invoke                       |
| `apps/inspector/app/jobs/*`        | job state and local actions                       |
| `apps/inspector/app/events/*`      | event contracts and triggers                      |
| `apps/inspector/app/buckets/*`     | bucket metadata/browser where safe                |
| `apps/inspector/app/cache/*`       | cache metadata, not raw sensitive keys by default |
| `apps/inspector/app/tools/*`       | tool contracts                                    |
| `apps/inspector/app/agents/*`      | agent timeline and approvals                      |
| `apps/inspector/app/requests/*`    | request list/detail                               |
| `apps/inspector/app/logs/*`        | live/searchable logs                              |
| `apps/inspector/app/traces/*`      | trace waterfall                                   |
| `apps/inspector/app/diagnostics/*` | compile/runtime diagnostics                       |
| `apps/inspector/lib/api.ts`        | versioned client                                  |
| `apps/inspector/lib/stream.ts`     | SSE reconnect client                              |
| `tests/e2e/*`                      | Playwright flows                                  |

#### Dependencies

```text
next
react
react-dom
Playwright for tests
no direct application/runtime package imports
```

#### Inputs

```text
versioned inspector APIs
SSE event stream
source location metadata
active graph hash
```

#### Steps

1. Build shell, navigation, active generation indicator, and error boundary.
2. Build a typed API client from inspector protocol contracts.
3. Implement SSE reconnect and cache invalidation.
4. Build overview and graph pages.
5. Build route detail and schema-generated request composer.
6. Build function detail and manual invocation.
7. Build jobs/events/resources pages.
8. Use “event listener”/“event trigger” terminology.
9. Build request list/detail with correlated logs and span waterfall.
10. Build live logs and trace pages.
11. Build agent timeline and approvals.
12. Build diagnostics overlay that does not hide the active generation.
13. Add source links for configured editors.
14. Add accessibility labels and keyboard navigation for critical flows.
15. Add Playwright tests against deterministic fixture APIs.

#### Outputs

```text
Encore-like local inspector
live request logs
route/function invocation forms
graph and trace views
diagnostics and generation status
```

#### Expected behavior

A developer can discover every route, call it, inspect the target function and dependencies, see the request timeline, view emitted logs/events/jobs, and trace an agent tool call without reading generated files.

#### Required tests

All browser flows from Section 23.18, plus responsive smoke tests and accessibility checks for critical forms.

#### Commands

```bash
bun run test:inspector
bun run test:e2e
```

#### Definition of done

- all required pages are implemented;
- live request appears without reload;
- compile failure is visible while active app remains usable;
- no secrets or raw provider clients reach browser payloads.

#### Common mistakes

```text
reconstructing the graph in the browser
using unstable CSS selectors in tests
showing raw request bodies by default
calling internal runtime objects through server actions instead of APIs
```

---

### Phase 14 — CLI, project scaffolder, and generated-project acceptance

#### Goal

Deliver the user-facing commands and make `bunx create-zsys` produce a complete working project.

#### Prerequisites

Phases 1–13.

#### Files and packages

| Path                                   | Responsibility                |
| -------------------------------------- | ----------------------------- |
| `packages/cli/src/main.ts`             | CLI entry and command routing |
| `packages/cli/src/commands/check.ts`   | compile/diagnostics           |
| `packages/cli/src/commands/build.ts`   | production build              |
| `packages/cli/src/commands/start.ts`   | start built server            |
| `packages/cli/src/commands/graph.ts`   | print/check/diff graph        |
| `packages/cli/src/commands/env.ts`     | env commands                  |
| `packages/cli/src/commands/doctor.ts`  | environment checks            |
| `packages/create-zsys/src/index.ts`    | generator entry               |
| `packages/create-zsys/src/options.ts`  | flags and defaults            |
| `packages/create-zsys/src/generate.ts` | temporary-dir generation      |
| `packages/create-zsys/src/validate.ts` | name/path validation          |
| `templates/default/*`                  | generated project template    |
| `tests/generator/*`                    | packed-artifact smoke suite   |

#### Dependencies

```text
@zsys/compiler
@zsys/supervisor
@zsys/runtime-effect logger
Bun package/process APIs
```

#### Inputs

```text
CLI arguments
template version
project name/directory
workspace package compatibility matrix
```

#### Steps

1. Implement stable command parsing and `--json` mode.
2. Route all output through Effect logging/reporters.
3. Implement `zsys check`, `build`, `start`, `graph`, `env`, and `doctor`.
4. Implement generator validation and temporary sibling directory strategy.
5. Bundle versioned templates into the published package.
6. Generate exact package versions and scripts.
7. Generate minimal app, route, function, and tests.
8. Run install, doctor, and check before final rename.
9. Print actionable next steps.
10. Pack the package and run smoke tests from the tarball.
11. Verify generated projects do not import internal frameworks.
12. Verify generated lockfile and frozen reinstall.

#### Outputs

```text
zsys CLI
create-zsys package
default project template
generated-project acceptance suite
```

#### Expected behavior

A new developer runs one command, enters the project, starts development, sees the backend and inspector, calls the example route, and runs tests without manual framework wiring.

#### Required tests

All generator tests from Sections 21.14 and 23.19 plus CLI exit-code and JSON-output tests.

#### Commands

```bash
bun test packages/cli packages/create-zsys tests/generator
bun run scripts/pack-and-smoke-create-zsys.ts
```

#### Definition of done

- packed generator creates a passing project;
- all commands have help and deterministic exit codes;
- failed generation leaves no partial destination;
- default project documentation matches actual commands.

#### Common mistakes

```text
testing generator only inside the monorepo with workspace resolution
writing into destination before all checks pass
leaving version placeholders
printing next commands that do not match scripts
```

---

### Phase 15 — Deployment plan, Pulumi Automation API, and AWS

#### Goal

Deploy the graph-defined application to AWS with Pulumi preview/up/destroy and tested stable resource identities.

#### Prerequisites

Phases 3, 6–11, and 14.

#### Files and packages

| Path                                      | Responsibility                     |
| ----------------------------------------- | ---------------------------------- |
| `packages/deploy/src/plan.ts`             | provider-neutral plan contracts    |
| `packages/deploy/src/from-graph.ts`       | graph-to-plan compiler             |
| `packages/deploy/src/diff.ts`             | deployment risk summary            |
| `packages/deploy-pulumi/src/workspace.ts` | Automation API workspace/stack     |
| `packages/deploy-pulumi/src/program.ts`   | plan-to-Pulumi program             |
| `packages/deploy-pulumi/src/events.ts`    | Pulumi event to Effect log mapping |
| `packages/cloud-aws/src/components/*`     | AWS Pulumi components              |
| `packages/cloud-aws/src/runtime/*`        | AWS provider implementations       |
| `packages/cli/src/commands/deploy.ts`     | deploy subcommands                 |
| `tests/deployment/plan/*`                 | plan golden tests                  |
| `tests/deployment/pulumi/*`               | Pulumi mock tests                  |
| `tests/deployment/aws/*`                  | isolated cloud tests               |

#### Dependencies

```text
@pulumi/pulumi
@pulumi/aws
@pulumi/awsx where justified
Docker
AWS SDKs only inside cloud package/runtime providers
```

#### Inputs

```text
canonical graph
graph hash
production build/image plan
resolved deployment configuration
Pulumi backend and stack
AWS credentials/region
```

#### Steps

1. Implement pure graph-to-deployment-plan conversion.
2. Validate that every production capability has an AWS implementation.
3. Generate stable logical resource names from app/descriptor IDs.
4. Implement Pulumi inline or generated program.
5. Implement reusable AWS component resources with parent relationships and tags.
6. Map HTTP runtime to ECR, ECS/Fargate, ALB, health checks, and autoscaling defaults.
7. Map jobs to SQS/DLQ and schedules.
8. Map events to EventBridge rules and durable listener queues.
9. Map buckets to S3 and cache to the selected managed cache topology.
10. Generate least-privilege service role policy from declared edges where practical.
11. Implement Automation API stack init/select/config/preview/up/refresh/destroy.
12. Stream Pulumi events through Effect logs.
13. Produce machine-readable preview report and output report.
14. Add Pulumi mocks and plan golden tests.
15. Add isolated AWS integration workflow with guaranteed cleanup.
16. Test source-file move with stable IDs causes no resource replacement.

#### Outputs

```text
deployment.plan.json
Pulumi program
AWS components and runtime providers
zsys deploy commands
preview/up/destroy reports
```

#### Expected behavior

`zsys deploy preview` shows a deterministic plan without changes. `zsys deploy up` creates a reachable service and managed capabilities. Running it again with no graph change is a no-op. Moving source files without changing IDs does not replace resources.

#### Required tests

All deployment tests from Sections 22.12 and 23.20 plus IAM snapshot review and destructive-change confirmation behavior.

#### Commands

```bash
bun run test:deployment
zsys deploy preview --stack ci-<id> --non-interactive
```

Nightly/release:

```bash
bun run test:aws-integration
```

#### Definition of done

- plan and Pulumi mock tests pass;
- ephemeral AWS stack passes HTTP/job/event/bucket/cache smoke;
- no-op update has no replacements;
- destroy cleans resources;
- no alternate infrastructure engine is required.

#### Common mistakes

```text
putting Pulumi Outputs into the graph
using source paths in cloud resource names
creating a second state system
logging Pulumi secret values
leaking AWS SDK types into public packages
```

---

### Phase 16 — Hardening, performance baseline, documentation, and release acceptance

#### Goal

Verify the complete POC as a product, close cross-cutting gaps, and create a reproducible release record.

#### Prerequisites

Phases 0–15.

#### Files and packages

| Path                       | Responsibility                          |
| -------------------------- | --------------------------------------- |
| `scripts/verify.ts`        | final complete verification pipeline    |
| `scripts/performance.ts`   | repeatable baseline measurements        |
| `scripts/release-check.ts` | package/version/artifact checks         |
| `docs/getting-started.md`  | project creation and first route        |
| `docs/testing.md`          | application and framework testing       |
| `docs/deployment.md`       | Pulumi/AWS workflow                     |
| `docs/architecture.md`     | graph/runtime overview                  |
| `docs/troubleshooting.md`  | diagnostic-led fixes                    |
| `RELEASE_CHECKLIST.md`     | signed review evidence                  |
| `examples/commerce/`       | complete POC example and acceptance app |

#### Dependencies

All previous packages and test tools.

#### Inputs

```text
packed ZSys packages
packed create-zsys package
clean temporary machine/container
complete fixture application
isolated AWS test account/stack
```

#### Steps

1. Run frozen install from a clean checkout.
2. Run all merge-blocking tests.
3. Run Playwright and container tests.
4. Create a project from the packed generator.
5. Complete the documented getting-started flow exactly.
6. Build and start the generated project.
7. Verify inspector routes, requests, logs, and traces.
8. Run Pulumi preview and isolated AWS acceptance.
9. Run no-op update and destroy.
10. Run secret scans over all artifacts.
11. Record performance baselines.
12. Scan public declarations for forbidden internal dependencies.
13. Scan graph and docs for out-of-scope subsystem artifacts.
14. Verify all generated outputs are reproducible.
15. Produce package checksums and release notes.
16. Obtain review sign-off from runtime, compiler, security, developer-experience, and cloud owners.

#### Outputs

```text
accepted POC release candidate
complete documentation
performance baseline
security evidence
cloud acceptance evidence
reproducible package artifacts
release checklist
```

#### Expected behavior

A developer unfamiliar with the implementation can follow the documentation to create, test, inspect, build, and deploy an application. The same graph is visible in generated artifacts, runtime APIs, inspector, and deployment plan.

#### Required tests

```text
bun run verify
bun run test:e2e
bun run test:container
bun run scripts/pack-and-smoke-create-zsys.ts
bun run test:deployment
release-gated AWS integration
```

#### Definition of done

- every final acceptance criterion in Section 25 passes;
- documentation commands have been executed verbatim on a clean environment;
- no high-severity security issue remains open;
- all review owners sign the release checklist.

#### Common mistakes

```text
treating documentation as untested prose
publishing workspace-linked packages instead of packed artifacts
skipping destroy verification
optimizing before recording a baseline
accepting inspector/runtime graph disagreement
```

---

## 25. Final POC acceptance criteria

The POC is accepted only when all statements are true.

### 25.1 Authoring

- A generated project uses the directory and suffix conventions in Section 5.
- Convention violations produce warnings and do not remove descriptors.
- Functions are the only authored handlers.
- Routes, jobs, event triggers, and tools target functions.
- Event authoring uses `defineEvent` and `onEvent`.
- Application examples use normal async TypeScript and Standard Schema.
- Public declarations expose no Effect types.

### 25.2 Compilation and graph

- One deterministic graph describes all managed concepts.
- The runtime manifest hash matches the graph hash.
- Routes and event listeners compile to generic trigger nodes.
- No executable closure or resolved secret appears in graph JSON.
- Two clean compilations from different paths produce identical outputs.
- Graph diff identifies breaking contract changes.

### 25.3 Runtime

- All execution paths use the same function engine.
- Cancellation reaches `ctx.signal`.
- declared errors, timeouts, cancellations, provider failures, and defects are distinguished.
- All framework terminal logs use Effect logging sinks.
- Global provider selection works for development, test, and production.
- Local jobs and durable event listeners recover after restart with documented at-least-once behavior.

### 25.4 Inspector

- The Next.js inspector shows graph, routes, functions, jobs, events/listeners, buckets, cache, tools, agents, requests, logs, traces, environment metadata, and diagnostics.
- A request appears live and links to its trace.
- Invalid source does not stop the last valid generation.
- The inspector consumes only versioned APIs.
- Secret values are not exposed.

### 25.5 Project creation and testing

- `bunx create-zsys@latest my-app` produces a complete project.
- The generated project passes install, check, typecheck, test, and build.
- The example route runs and appears in the inspector.
- The framework test suite covers type, compiler, graph, provider, runtime, restart, browser, generator, deployment, container, and security layers.
- `bun run verify` is deterministic and documented.

### 25.6 Deployment

- Pulumi is the deployment engine.
- AWS is the first cloud target.
- Deployment consumes a provider-neutral plan derived from the graph.
- Preview, up, outputs, refresh, and destroy work through Automation API.
- Stable descriptor IDs preserve cloud resource identity across file moves.
- A no-op update is actually a no-op.
- An isolated acceptance stack can be destroyed cleanly.

### 25.7 Scope integrity

- No plugin system or extension marketplace exists in the POC.
- No alternate infrastructure engine is required.
- No Rust component exists.
- Out-of-scope application concerns do not appear as graph node kinds, generated project directories, inspector navigation, or implementation phases.

---

## 26. Official reference material

The implementation team should prefer primary documentation.

### iii

- Functions: `https://iii.dev/docs/using-iii/functions`
- Workers, triggers, and functions: `https://iii.dev/docs/understanding-iii`
- Trigger types: `https://iii.dev/docs/creating-workers/triggers`
- Pub/sub tutorial: `https://iii.dev/docs/tutorials/linkly/durable-execution`
- Console: `https://iii.dev/docs/using-iii/console`

### Effect

- Runtime: `https://www.effect.website/docs/runtime`
- Logging: `https://www.effect.website/docs/v3/observability/logging`
- Effect 3 release: `https://www.effect.website/blog/releases/effect/30`

### Pulumi

- TypeScript and Bun language support: `https://www.pulumi.com/docs/iac/languages-sdks/javascript/`
- Automation API: `https://www.pulumi.com/docs/iac/concepts/automation-api/`
- Component resources: `https://www.pulumi.com/docs/concepts/resources/components`
- AWS integration: `https://www.pulumi.com/docs/integrations/clouds/aws/`
- Pulumi unit testing: `https://www.pulumi.com/docs/iac/guides/testing/unit/`

### Bun, Hono, and Next.js

Use the current official documentation pinned to the dependency versions selected in the workspace lockfile. The release record must note those versions.

---

## 27. Final decision summary

```text
Executable primitive       function
Public authoring style      pure define* descriptors
Decorators                  not in POC
Event listener model        onEvent → generic trigger → function
Separate subscription API   no
Effect                      internal kernel only
Public handler              plain sync/async TypeScript
Public schema               Standard Schema via @zsys/schema by default
Providers                   global by environment and logical profile
HTTP runtime                Hono, internal
Inspector                   Next.js over versioned APIs
Request logs                yes, first-class
Project creation            bunx create-zsys@latest <name>
Deployment                  Pulumi Automation API
First cloud                 AWS
Rust                        later only after profiling
```
