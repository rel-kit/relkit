## Context

See `proposal.md` for motivation. The current implementation already recursively discovers `src/**/*.ts`, derives source-scoped identities, snapshots descriptors in an evaluator, generates a graph and executable manifest, materializes Hono routes, supplies application context through a generated registry, and manages provider readiness/draining. Services currently clone functions and attach invocation policy; Drizzle currently captures a live client in a `data-model` descriptor; Better Auth currently brands an already-created instance's handler.

The redesign must preserve strict TypeScript inference, serializable deterministic graph output, compiler non-execution of resource factories, generated-project packaging, and the repository's 200-line implementation-file limit. The user-owned `plans/redesign-domain-service.md` remains the architectural discussion record.

## Goals / Non-Goals

**Goals:**

- Make filesystem domains, rather than global descriptor-kind directories, the canonical ownership boundary.
- Keep service authoring small and referentially transparent while making ownership, exposure, dependencies, and specialized capabilities useful to compilation and inspection.
- Reuse existing route, Drizzle CRUD/transaction, Better Auth session, graph, manifest, provider lifecycle, and testing machinery.
- Deliver the API, compiler/runtime, Inspector, examples/templates, docs, and migration diagnostics as one coherent contract revision.

**Non-Goals:**

- A generic dependency-injection container, service import declaration, workflow engine, or service lifecycle protocol.
- Multiple application database/auth service selection, automatic database migrations, or a generic database/auth provider interface.
- Static call-graph inference, new dependency-cycle policy, standalone schema graph nodes, route generation, or a Better Auth API proxy.

## Decisions

### Domain classification and boundaries

The compiler will classify normalized source paths into root app, route, platform, or top-level domain ownership. Existing recursive scanning remains; conventions, identity derivation, and semantic validation change. Reserved legacy layer names produce migration errors rather than accidental domains. A graph-visible domain descriptor without one locally constructed and singly exported `service.ts` descriptor is fatal; ordinary helper/schema files remain opaque.

Application import facts will be collected from all source modules and resolved through TypeScript's configured resolver, including type-only imports and re-exports. A domain can import itself, platform, packages, or another domain's service file. Routes can import services/platform. Platform cannot import routes/domains. This uses normal imports as the domain dependency source and avoids another dependency vocabulary.

### Service descriptor representation

`defineService` retains common descriptor metadata and stores frozen function/event maps in non-enumerable internal metadata. Its enumerable public surface contains the common descriptor fields and the original member references directly. Runtime guards reject invalid kinds, reserved/colliding names, and malformed maps; compiler ownership validation rejects foreign-domain members. Empty maps are accepted by the factory because only compilation knows the domain's other artifacts.

Service middleware types, exports, policy symbols, ownership cloning, invocation policy plumbing, graph edges, and `FunctionContext.service` are removed. Runtime service attribution comes from each compiled function node's `domainId` during registration.

### Routes and auth protection

`defineServiceRoutes` is a typed transformation over the existing `defineRoute`: configured keys are the seven supported function methods, values are a public service function name or the existing route options without `target` plus `member`, and the result contains only configured methods. Compiler source facts recognize direct destructured exports and bind each descriptor to its method/source location. `ALL` remains raw-only.

Raw route options gain an `auth.protected` field accepted only with a Better Auth-branded handler. The brand identifies the service, not protected paths. The compiler derives one base path from one catch-all mount and emits a mount edge. Hono auth middleware is registered before authored route middleware; both use one request-keyed session promise.

### Drizzle specialization

`defineDrizzleService` is still a descriptor of kind `service`. It snapshots only safe schema/table/model metadata while storing client/dispose callbacks, schema objects, model extensions, overrides, and generated Zod schemas behind internal symbols. Table inspection filters relation exports, requires at least one table and one dialect, and emits JSON-safe column/selectors metadata.

Each schema table key gets the existing base model surface. `defineModel` stores one table and a non-empty extension map. Its mapped consumer type removes the first framework context argument. The context's database type is a dialect-level Drizzle surface inferred from the table; this supports typed SQL builders/transactions and other imported tables without pretending a standalone model knows the application's relational `query` keys. Runtime model binding injects the singleton or active transaction client.

Activation memoizes the sync-or-async client promise. Disposal is separately memoized and runs only after activation. Database migration remains application/deployment work.

### Better Auth specialization

`defineBetterAuthService` accepts `BetterAuthOptions` minus `database` and `basePath`, with those keys typed as `never`, plus `drizzle?: Omit<DrizzleAdapterConfig, "provider">`. It stores native callbacks/options internally and exposes a stable branded handler that resolves the activated instance. Runtime activation receives the sole Drizzle service, inferred provider/full schema, and compiled mount base path, then constructs `drizzleAdapter` and `betterAuth` once. The generated context extracts the service handler's session type and exposes only memoized `getSession`.

### Graph, manifest, and Inspector

Contract versions advance to contract 3, graph 6, manifest 6, and generator 3. Domain-owned nodes gain `domainId`; functions/events/errors gain exposure. Services contain public function/event member metadata and optional Drizzle/Better Auth capability metadata. Errors become graph nodes while the current function error projection remains generated from the same normalized values for HTTP/client consumers.

New edges are `exposes-function`, `exposes-event`, `depends-on-service`, `mounts-service`, and `declares-error`; service middleware edges disappear. Tables/models remain nested capability metadata. The manifest's one `services` map imports live generic/specialized descriptors and replaces `dataModel` and policy semantics.

Inspector API keeps its v1 envelope, adds an errors collection, and keeps `services` as the API collection name. UI labels it Domains and groups nodes by `domainId`, with safe specialized details and public/internal badges.

### Runtime lifecycle

After environment resolution, provider and Drizzle startup may proceed together; Better Auth follows Drizzle and compiled route metadata. Readiness requires all applicable startup promises. Application traffic returns 503 until ready, while liveness and readiness endpoints remain available. Function and route middleware contexts receive generated env/auth types, and functions additionally receive the database context.

Shutdown stops admission, drains work, then attempts telemetry, providers, and Drizzle disposal without one cleanup failure skipping another. Compiled-project test applications use the same activation/close helpers; isolated single-function invocation remains explicit.

## Risks / Trade-offs

- **Large breaking migration surface** → Bump all relevant contracts together, migrate every owned example/template/test, and add source-located legacy diagnostics plus a migration guide.
- **Compiler boundary analysis increases work** → Reuse the existing TypeScript source program/module resolution and collect only application import facts; do not build a second parser or call-graph analyzer.
- **Standalone model cannot know relational query keys** → Expose the dialect-level database and document typed `select().from(otherTable)`; add a schema-bound helper only after a concrete need.
- **Lazy auth handler can be called before activation** → Gate application traffic on complete readiness and make the handler fail safely if invoked outside an activated runtime.
- **Graph schema could leak integration values** → Build capability metadata from explicit safe projections and verify JSON output with secret/callback/client regression fixtures.
- **One database/auth service is restrictive** → Emit explicit duplicate diagnostics and defer selection syntax until a real multi-service requirement exists.

## Migration Plan

1. Land contract and authoring API changes with compiler migration diagnostics and version bumps.
2. Update graph/manifest/context generation and runtime activation as one compatible internal slice.
3. Migrate all repository-owned templates, examples, fixtures, and documentation to domain roots.
4. Regenerate deterministic API documentation and artifacts, then run focused suites followed by full verification.
5. Release as a breaking version. There is no runtime rollback shim; rollback means returning to the preceding package/contract release and its layer-first source layout.
