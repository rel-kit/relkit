# Redesign Domain Service

Status: accepted and implemented by OpenSpec change `redesign-domain-service`.

## Objective

Make a RELKIT service the public facade and ownership boundary of an
application domain or explicit technical capability rather than a runtime
wrapper around a group of functions.

The redesign should improve large-application organization without turning a
service into a dependency-injection container, middleware stack, or God object.

## Agreed source layout

The application source root is domain-first. The redundant `services/` and
global `functions/` layers are removed.

```text
src/
  database/
    service.ts
    schema/
    models/
    migrations/

  auth/
    service.ts
    functions/

  orders/
    service.ts
    functions/
    errors/
    schemas/
    events/
    jobs/
    cache/

  customer-support/
    service.ts
    functions/
    agents/
    tools/

  billing/
    service.ts
    functions/
    events/

  routes/
  platform/
```

Rules:

- `src/<domain>/service.ts` marks a top-level directory as a domain.
- `src/database/` is the application persistence capability. It owns the
  database client, schema, migrations, transactions, and persistence models,
  but not business workflows.
- `src/auth/` is the authentication domain. It owns authentication behavior,
  plugins, hooks, emails, and auth-specific functions.
- Every graph-visible business function belongs to exactly one domain.
- Domain-owned events, errors, jobs, tools, agents, caches, schemas, and other
  artifacts live inside their owning domain when applicable.
- `src/routes/` remains a reserved transport tree because URL topology is not
  necessarily the same as domain topology.
- `src/platform/` remains reserved for genuinely application-wide deployment
  concerns such as public origins, provider setup, environment wiring, and
  observability. Application database schema and authentication behavior do
  not belong in Platform.
- Do not create a generic `shared` domain. A cross-domain workflow should have
  an explicit owner, such as `checkout` or `customer-support`.
- Do not scaffold empty category directories; create them when the domain needs
  them.

## Service responsibility

`defineService` defines a domain's public contract. It does not discover every
artifact in the domain and does not execute business logic itself.

A service must expose at least one meaningful capability, not necessarily at
least one function. A normal business service exposes functions and events.
Specialized factories such as `defineDrizzleService` and
`defineBetterAuthService` expose integration-specific runtime capabilities.
They must produce the same underlying service identity and graph node rather
than introduce a parallel service system.

The minimal proposed public contract is:

```ts
import { defineService } from "@relkit/app/services";
import * as functions from "./functions/index.js";
import * as events from "./events/index.js";

export const orders = defineService({
  functions,
  events,
});
```

Semantics:

- `functions` contains public callable operations.
- `events` contains public facts published by the domain.
- Functions and other descriptors not exposed by the service can still be
  domain-owned and graph-visible, but they are internal.
- Function errors and input/output schemas should be derived from function
  contracts rather than repeated on the service.
- Jobs, tools, agents, caches, and similar descriptors should be associated
  through their source location and descriptor references rather than repeated
  in the service manifest.
- The service may use existing descriptor metadata such as title, description,
  and tags when those values are consumed by docs or Inspector.

## Canonical member identity

There should be one developer-facing representation of a public service
function:

```ts
orders.createOrder;
```

It should reference the original function descriptor rather than a cloned
member facade:

```ts
orders.createOrder === createOrder;
```

Avoid multiple competing forms such as:

```ts
createOrder;
orders.functions.createOrder;
orders.createOrder;
```

Service metadata and ownership may be stored internally without changing the
descriptor identity developers use.

## Public and internal boundaries

Directory containment determines ownership. The service manifest determines
public exposure.

```text
src/orders/functions/create-order.function.ts
  owner: Orders
  exposure: public, because service.ts exposes it

src/orders/functions/calculate-total.function.ts
  owner: Orders
  exposure: internal, because service.ts does not expose it
```

Another domain imports the public service facade:

```ts
import { orders } from "@app/orders/service.js";
```

It must not import another domain's internal files:

```ts
// Rejected outside the Orders domain.
import createOrder from "@app/orders/functions/create-order.function.js";
```

Cross-domain dependencies are expressed by normal TypeScript imports.
`defineService` does not need an `imports` option. Importing another domain's
`service.ts` creates one `depends-on-service` graph edge. Exact `.invoke()` calls
remain runtime-observed invocation edges; the compiler does not infer calls.

## No service middleware or dependency injection

Service middleware is not part of the redesigned service contract. Transport
middleware belongs to routes, while business checks and dependencies remain
explicit at the relevant function.

The generic `defineService` contract should not:

- Inject repositories or infrastructure into every member.
- Inherit hidden dependencies into functions.
- Apply invocation middleware.
- Own route configuration.
- Become a general-purpose lifecycle container with arbitrary startup and
  shutdown hooks.
- Reproduce NestJS module imports when direct typed descriptors already exist.

A specialized resource service may own the narrow lifecycle required by its
capability, such as lazily creating and closing a Drizzle client. This does not
make ordinary domain services dependency-injection containers.

Auth using the application database is a real runtime dependency, not an
`imports` allowlist. When there is exactly one compatible Drizzle service, the
compiler should resolve that dependency automatically and record the graph
edge. Zero or multiple compatible database services should produce a clear
diagnostic rather than silently selecting one.

Function-level dependencies remain the exact runtime resources consumed by the
function, such as caches, events, jobs, and buckets.

## Ownership versus consumption

An artifact can be consumed by many domains while still having one owner.

Examples:

- `orders.created` is owned by Orders and may be consumed by Billing,
  Fulfillment, and Analytics.
- A receipt-delivery job is owned by Notifications even when Orders enqueues it.
- A logical product-price cache is owned by Catalog, while its Redis provider
  belongs to Platform.
- An agent focused on one domain belongs to that domain. An agent coordinating
  several domains belongs to an explicit orchestration domain such as
  `customer-support`.
- A tool is an adapter over a public function and is owned by the agent or
  application capability exposing it.

Shared use must not create ownerless descriptors or a dumping-ground domain.

## Specialized technical services

`database` and `auth` follow the same top-level domain shape as business
services, but their public capabilities are different:

```text
database service
  -> Drizzle client
  -> schema and generated contracts
  -> models
  -> portable transactions

auth service
  -> Better Auth handler
  -> session capability
  -> authentication configuration and hooks
  -> database service
```

Use vendor-specific factories for the integrations that actually exist:

- `defineDrizzleService`, not a speculative generic `defineDatabaseService`.
- `defineBetterAuthService`, not a second generic auth abstraction.

A generic abstraction should be introduced only when another implementation
creates a concrete compatibility requirement.

## Drizzle database service

The Drizzle service owns one lazy client factory, the complete application
schema, and registered custom models.

```ts
import { Database } from "bun:sqlite";
import { defineDrizzleService } from "@relkit/drizzle";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "./schema/index.js";
import userModel from "./models/user.model.js";

export default defineDrizzleService({
  schema,
  client: ({ env }) =>
    drizzle({
      client: new Database(env.DATABASE_PATH),
      schema,
    }),
  models: {
    user: userModel,
  },
});
```

Requirements:

- Name the lazy factory `client`, not `create`.
- Do not create the database client while the compiler evaluates the service
  descriptor.
- Let the compiler inspect serializable schema and model metadata without
  opening a connection or executing migrations.
- Derive the Drizzle dialect/provider from the registered schema and client
  integration rather than repeating it in consuming services.
- Keep business workflows in their owning business domains. Database models
  should contain persistence-oriented queries and atomic operations.
- Support one default application database initially. Add explicit database
  selection only when multiple database services become a real requirement.

### Custom Drizzle models

Custom models live in focused files and use a functional extension contract
instead of the current two-step `base.custom(tableName, ModelClass)` API.

```ts
import { defineModel } from "@relkit/drizzle";
import { eq } from "drizzle-orm";
import { userTable } from "../schema/user.js";

export default defineModel({
  table: userTable,
  extend: {
    byEmail: ({ table, database }, email: string) =>
      database.select().from(table).where(eq(table.email, email)),
  },
});
```

Semantics:

- A model does not declare `client: drizzle`; the enclosing Drizzle service
  owns and supplies the configured client.
- Each extension receives one framework-owned context object followed by its
  public call arguments.
- `table` is the model's typed table.
- `database` is the active, schema-aware Drizzle client. During a portable
  transaction it must be the transaction-bound client, never the application
  singleton.
- Consumers call `context.database.user.byEmail(email)` without supplying the
  extension context.
- Custom methods may access other tables and Drizzle transaction facilities.
- Generated CRUD operations remain reserved. Base-operation overrides stay a
  separate, explicit configuration surface.
- The implementation may reuse the existing runtime model binding internally;
  the redesign concerns the authoring API.
- Inspector may list custom model methods beneath the database service, but
  they are not independently routable function descriptors.

## Better Auth service

`defineBetterAuthService` should construct Better Auth internally. Application
code should not need to import `betterAuth`, `drizzleAdapter`, or the database
service for the normal single-database case.

```ts
import { defineBetterAuthService } from "@relkit/better-auth";
import { organization } from "better-auth/plugins";
import { sendResetPassword } from "./emails/send-reset-password.js";
import { sendVerificationEmail } from "./emails/send-verification-email.js";
import { databaseHooks, hooks } from "./hooks/index.js";
import { socialProviders } from "./providers/index.js";

export default defineBetterAuthService({
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    sendResetPassword,
  },
  emailVerification: {
    sendVerificationEmail,
  },
  socialProviders,
  plugins: [organization()],
  databaseHooks,
  hooks,
});
```

Requirements:

- Preserve Better Auth's native option names and types, including
  `emailAndPassword`, `socialProviders`, `emailVerification`, `plugins`,
  `databaseHooks`, `hooks`, sessions, secondary storage, and related options.
- Do not introduce a second `authentication` configuration vocabulary that
  developers must translate from Better Auth documentation.
- Reserve framework-owned options such as `database` and `basePath`; RELKIT
  supplies them when constructing Better Auth.
- Automatically resolve the sole compatible Drizzle service, obtain its active
  client, schema, and provider, construct the Drizzle adapter, and emit an
  `auth -> database` dependency edge.
- Retain a narrow optional escape hatch for Better Auth Drizzle-adapter settings
  that cannot be inferred, such as plural table names, schema namespaces, or
  explicit schema mappings.
- Keep large callbacks, email delivery, hooks, and provider definitions in
  focused files under `src/auth/`; `service.ts` remains the composition point.

### Auth route ownership

The Better Auth base path is owned by the route tree, not the auth service.

```ts
// src/routes/api/auth/[[...auth]]/route.ts
import { defineRoute } from "@relkit/app/routes";
import auth from "@app/auth/service.js";

export const ALL = defineRoute({
  handler: auth.handler,
});
```

The compiler derives `/api/auth` from the route's filesystem path and supplies
it as Better Auth's `basePath` during runtime construction. Multiple route
mounts for the same auth handler are ambiguous and should produce a diagnostic.

`baseURL` remains separate from `basePath`: it represents the deployed public
origin and belongs to environment or Platform configuration. Route middleware
and application-route protection remain under `src/routes/`; they are not
configured on the auth service.

## Service route alignment

Keep routes under `src/routes/`. Add a typed helper that maps all supported HTTP
method exports in one route file to public members of one service.

Proposed name: `defineServiceRoutes`, plural because one call can produce
multiple route descriptors.

```ts
import { defineServiceRoutes } from "@relkit/app/routes";
import { orders } from "@app/orders/service.js";

export const { GET, POST } = defineServiceRoutes(orders, {
  GET: "searchOrders",
  POST: {
    member: "createOrder",
    successStatus: 201,
  },
});
```

Requirements:

- Support the same HTTP methods and per-method options as `defineRoute`.
- Infer the URL path from the existing route filesystem convention.
- Restrict member names to public functions of the selected service.
- Support a short member-name form and an expanded configuration form.
- Produce the same underlying route descriptors as `defineRoute`.
- Keep `defineRoute` as the escape hatch for raw or exceptional routes.
- Use `defineRoute({ handler: auth.handler })` for the Better Auth catch-all;
  `defineServiceRoutes` remains for authored service functions.
- Do not infer REST methods from function names or generate routes
  automatically.

## Discovery and Inspector

Service exposure must not be the compiler's discovery gate. The compiler scans
the complete `src/**` tree for RELKIT descriptors.

Inspector should show every graph-visible descriptor, including:

- Domains/services.
- Public and internal functions.
- Errors.
- Events and listeners.
- Jobs and schedules.
- Agents and tools.
- Caches, buckets, and other resources.
- Database services, with schema, table, and custom-model metadata shown as
  service details rather than unrelated top-level descriptors.
- Auth services and their resolved storage dependency.
- Routes.
- Providers and platform resources.

Schemas are normally displayed as contract details on functions, errors, and
events rather than standalone graph nodes. Plain TypeScript models, helpers,
and policies are not graph nodes.

Inspector grouping rules:

- Descriptors under `src/<domain>/**` are grouped under that domain.
- Public members are visually distinguished from internal members.
- Descriptors under `src/routes/**` are shown in the transport layer and linked
  to their targets.
- Descriptors under `src/platform/**` are shown in the platform layer.
- Specialized services remain normal service nodes with serializable capability
  metadata; live clients, credentials, callbacks, and handlers never enter the
  graph.
- A graph-visible descriptor outside a domain, routes, or platform is reported
  as an orphan.

Expected graph relationships include:

```text
POST /orders
  -> orders.createOrder
  -> orders.created
  -> orders.orderCache
  -> notifications.sendReceipt

customerSupport.agent
  -> lookupOrder tool
  -> orders.getOrder

ALL /api/auth/*
  -> auth.handler

auth
  -> database

database
  -> user table
  -> user.byEmail model method
```

## Keeping service files small

Define each function, event, and other descriptor in its own focused file. Use
ordinary TypeScript barrel exports for the public service contract.

Database schemas and models should likewise be split under `schema/` and
`models/`. Better Auth email callbacks, hooks, plugins, and provider definitions
should be imported from focused files. Neither specialized `service.ts` should
grow into the implementation of every capability it composes.

Do not introduce mutable registries, builders, filesystem globs, or generated
registration code for the initial design. If a public barrel becomes extremely
large, split the bounded context rather than hiding the size behind more
machinery.

## Non-goals

- Turning every domain into a separately deployed microservice.
- Making `defineService` a workflow engine.
- Adding service-level middleware, dependency injection, or imports.
- Turning generic `defineService` into a universal resource container.
- Repeating the Drizzle client on every model.
- Wrapping or renaming Better Auth's complete configuration surface.
- Treating custom database model methods as route-targetable functions.
- Adding generic database or auth provider abstractions before a second
  implementation requires them.
- Moving URL routing into service configuration.
- Making every TypeScript file visible in Inspector.
- Exposing internal implementation merely because Inspector discovers it.
- Adding new command/query abstractions when functions already represent both.

## Resolved implementation decisions

- The route helper is `defineServiceRoutes` and supports every standard method
  except `ALL`; raw handlers retain `ALL` through `defineRoute`.
- Errors remain operation-specific and become public through public functions;
  there is no `orders.errors` namespace.
- `routes` and `platform` are reserved structural roots. Every other
  graph-visible descriptor belongs to a top-level domain with one `service.ts`.
- Better Auth's `drizzle` option is the narrow adapter escape hatch. `database`
  and `basePath` are framework-owned; `baseURL` remains native Better Auth
  configuration.
- `defineModel` is exported only by `@relkit/drizzle`.
- This is one breaking release. `defineDataModel`, service middleware,
  `context.service`, and `betterAuthAdapter` are removed without aliases.
- The four serialized contracts move to contract 3, generator 3, graph 6, and
  manifest 6. The Inspector API envelope remains version 1.
- Implementation details, test evidence, and remaining task status live in
  `openspec/changes/redesign-domain-service/`.
