## Why

Services currently add member cloning and invocation middleware around a function map without establishing a useful application-domain boundary. Large applications need one compiler-visible domain layer that owns behavior and resources while preserving ordinary TypeScript composition and keeping routes and platform configuration separate.

## What Changes

- **BREAKING** Replace the layer-first `src/functions`, `src/services`, and sibling descriptor directories with `src/<domain>/**`, requiring exactly one `src/<domain>/service.ts` descriptor while retaining `src/routes`, `src/platform`, and root `relkit.config.ts`.
- **BREAKING** Make `defineService` a direct public facade for domain functions and events, remove service middleware/member cloning/service context, and derive domain dependencies from TypeScript imports.
- Add `defineServiceRoutes` for mapping HTTP method exports to public service functions while preserving `defineRoute` for individual and raw routes.
- **BREAKING** Replace eager `defineDataModel` and `DataModelDescriptor.custom` with lazy `defineDrizzleService` and functional `defineModel` authoring, including transaction-bound extensions and optional disposal.
- **BREAKING** Replace `betterAuthAdapter` with `defineBetterAuthService`, automatic Drizzle integration, route-derived `basePath`, declarative protection, and typed request session context.
- **BREAKING** Extend graph and manifest contracts with domain ownership, public/internal exposure, first-class errors, service capabilities, domain dependency edges, and service mounts.
- Add Inspector domain/error views and migrate generated templates, examples, documentation, and acceptance coverage in the same release.
- Provide source-located migration diagnostics for the removed layout and APIs without compatibility aliases or an automatic codemod.

## Capabilities

### New Capabilities

- `domain-services`: Domain roots, service facades, service-aligned routes, Drizzle services/models, Better Auth services, domain boundaries, and specialized runtime lifecycle.

### Modified Capabilities

- `public-authoring`: Replace layer-first conventions and service middleware with domain-first authoring and the new route/service APIs.
- `service-orchestration`: Redefine services as domain facades and ownership metadata rather than invocation-policy containers.
- `compiler-graph`: Add domain discovery, import-boundary validation, new identities, graph nodes/edges, and service manifest lowering.
- `function-runtime`: Generate typed env/database/auth contexts and activate/dispose specialized services with the application lifecycle.
- `http-runtime`: Add service-route lowering, route-derived auth mounting, protection ordering, and readiness behavior.
- `development-inspector`: Present domains, public/internal artifacts, errors, database metadata, and auth dependencies.
- `cli-scaffolding`: Generate domain-first templates and migrate generator validation.
- `developer-documentation`: Document the new source layout, services, database/auth integration, and breaking migration.
- `acceptance-verification`: Verify the new contracts across packages, examples, generated projects, graph/manifest, runtime, Inspector, and documentation.

## Impact

This changes public authoring exports, compiler conventions and source facts, graph/manifest versions, generated runtime startup and shutdown, context registry generation, HTTP middleware ordering, Inspector APIs/UI, all templates and executable examples, and the corresponding normative specs and test fixtures. It reuses the existing descriptor, route, Drizzle model-operation, Better Auth session, provider lifecycle, and Hono runtime implementations; no new external dependency or generic DI/database/auth abstraction is introduced.
