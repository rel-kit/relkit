# Spec Delta

## MODIFIED Requirements

### Requirement: Plain TypeScript public boundary

Application developers SHALL author normal synchronous or asynchronous TypeScript handlers and
Standard Schema-compatible contracts without importing Effect, Hono, Next.js, Pulumi, cloud SDK or
provider-client types. The `relkit` main entry point SHALL expose no Effect types, Effect-specific
helpers SHALL live in the opt-in `relkit/effect` entry point, and handlers that return an Effect SHALL
be supported.

#### Scenario: Public declaration inspection

- **WHEN** the `relkit` root declarations and generated application declarations are emitted and
  scanned
- **THEN** no Effect, Hono, Next.js, Pulumi or cloud SDK type appears in an application-facing
  signature

#### Scenario: Effect helpers are opt-in

- **WHEN** an application needs `failEffect`
- **THEN** it imports it from `relkit/effect`, and the root entry point does not export it

#### Scenario: Handler returns an Effect

- **WHEN** a handler returns an Effect that succeeds or fails with a declared error
- **THEN** its result or error is handled exactly as for a Promise handler

### Requirement: Standard Schema validation and projection

RelKit SHALL accept any Standard Schema-compatible schema, including Zod 4, ArkType, Effect Schema and
Valibot, for function, event, task and error contracts. JSON Schema projection SHALL use the schema's
`~standard.jsonSchema` when present and the library's own converter otherwise. The built-in
zero-dependency builder SHALL be exported as `s` from `relkit/schema`.

#### Scenario: Supported schema validates

- **WHEN** a sync or async compatible schema receives an unknown value
- **THEN** validation returns a typed value or structured issues with stable paths

#### Scenario: Zod schemas compile

- **WHEN** a function's input and output are Zod 4 schemas
- **THEN** `relkit check` succeeds and OpenAPI contains their JSON Schema

#### Scenario: Library without a JSON Schema hook

- **WHEN** a Valibot or Effect Schema contract does not expose `~standard.jsonSchema`
- **THEN** the library's own converter supplies the projection

#### Scenario: JSON Schema is unavailable

- **WHEN** a third-party Standard Schema cannot supply or support the JSON Schema needed for
  graph/OpenAPI generation
- **THEN** compilation fails with `RELKIT_SCHEMA_UNAVAILABLE` and a useful source location

### Requirement: Declared public errors

Applications SHALL declare typed errors with an explicit ID, validated safe data, a message, optional
HTTP mapping and optional retry metadata. Handlers SHALL throw or return instances of declared
errors, and both SHALL type-check. Omitted retry metadata SHALL mean non-retryable, and a declared
error that a handler never raises SHALL NOT be a type error.

#### Scenario: Declared error is thrown

- **WHEN** a handler throws an error instance created from a declared error descriptor
- **THEN** the runtime can distinguish and safely expose the declared failure from provider failures,
  cancellation, timeouts, and unexpected defects

#### Scenario: Declared error is returned

- **WHEN** a handler returns an instance of a declared error
- **THEN** the runtime treats it the same as throwing it

#### Scenario: Error identity is omitted

- **WHEN** a `defineError` declaration omits `id`
- **THEN** compilation fails with a source-located diagnostic requiring an explicit ID, because the
  ID is the error's public code

#### Scenario: Retry metadata is omitted

- **WHEN** a declared error does not specify `retry`
- **THEN** its normalized retry classification is `never`

#### Scenario: Retry delay is declared

- **WHEN** retry metadata is `later` or contains `{ kind: "later", afterMs }`
- **THEN** the descriptor records a retryable classification and validates any `afterMs` as a finite
  non-negative millisecond delay

#### Scenario: Declared error is never raised

- **WHEN** a function declares an error that its handler never raises
- **THEN** type-checking succeeds, and an optional lint rule can report the unused declaration

### Requirement: Functions expose invocation and tool views

A function descriptor SHALL expose `asTool(options?)` and SHALL be callable through
`ctx.functions.<name>` when declared as a dependency, through the runtime handle, and through
`invokeFunction` in tests. Descriptors SHALL NOT expose a public `invoke` method, and none of these
views SHALL duplicate the function handler.

#### Scenario: Function is called from another function

- **WHEN** a handler declares `priceOrder` under `dependencies.functions` and awaits
  `ctx.functions.priceOrder(input)`
- **THEN** TypeScript infers the function input and output and the call enters the common RelKit
  invocation boundary

#### Scenario: Function is invoked from ordinary application code

- **WHEN** code outside a handler awaits `getRelkit().functions.orders.getOrder({ orderId })`
- **THEN** TypeScript infers the function input and output and the call enters the common RelKit
  invocation boundary as a `system` call

#### Scenario: Function becomes a tool

- **WHEN** `getOrder.asTool(...)` is declared
- **THEN** the resulting tool inherits the function schemas, errors, and handler target while adding
  only tool metadata

#### Scenario: Descriptor invoke is removed

- **WHEN** code calls `priceOrder.invoke(input)`
- **THEN** type-checking fails, and `relkit migrate` rewrites the call to the context or
  runtime-handle form

## ADDED Requirements

### Requirement: Dependencies are declared once

A function SHALL declare everything it calls under `dependencies` — functions, databases, cache,
buckets, events, channels, tasks, jobs and agents — and SHALL reach each through `ctx.<kind>.<name>`.
The graph SHALL take its call edges from these declarations.

#### Scenario: Undeclared dependency

- **WHEN** a handler uses `ctx.cache.prices` without declaring `prices`
- **THEN** type-checking fails

#### Scenario: Event publication

- **WHEN** a function declares `orderCreated` under `dependencies.events`
- **THEN** it publishes through `ctx.events.orderCreated.publish(payload)` and the graph shows the
  publication edge

### Requirement: One spelling per concept

Each concept SHALL have one public API: one `defineJob`, one `defineAgent`, one `jobs` key on
`defineApp`, and no alias pairs such as `getJsonSchema` and `toJsonSchema`, the builder's `void` and
`undefined`, or `defineTransform` and `defineRequestTransform`.

#### Scenario: Removed alias is used

- **WHEN** an application uses a removed alias or duplicate API
- **THEN** type-checking fails and `relkit migrate` rewrites it to the remaining API

### Requirement: Route response options

A function route SHALL be able to set the response status, headers and cookies from its route
definition, using the function's output, without changing the function.

#### Scenario: Created resource

- **WHEN** a route sets status 201 and a `Location` header from the function's output
- **THEN** the response carries both, and the function stays callable from jobs and tools

### Requirement: Typed middleware data

Middleware SHALL be able to declare a schema for the data it provides, and routes SHALL be able to map
that data into their function's input. Hono-style middleware SHALL remain available for raw HTTP
concerns.

#### Scenario: Tenant from middleware

- **WHEN** tenant middleware provides `tenantId` and a route maps it into the function input
- **THEN** the function receives a validated `tenantId`

## REMOVED Requirements

### Requirement: Job service spelling migration does not enable legacy execution

**Reason**: The deprecated `profile` alias for `service` ends with the one breaking release, which
removes aliases and legacy jobs.

**Migration**: Use `service`; `relkit migrate` rewrites `profile`.
