# ZSYS-DR-001: Foundational Architecture and Developer Experience

**Date:** 2026-08-06
**Status:** Proposed
**Owners:** ZSys maintainers
**Related brief:** [`../briefs/2026-08-06-project-brief.md`](../briefs/2026-08-06-project-brief.md)

## Context

The recurring cost of production TypeScript applications is not only feature implementation. Each project repeatedly configures API routing, contracts, database schemas, migrations, authentication, organizations, permissions, frontend applications, documentation, email, caching, observability, infrastructure, and deployment. The setup is verbose, varies by team, and is difficult for humans and AI agents to modify consistently.

The proposed project should provide a well-defined structure comparable to the predictability of Next.js routing conventions, but covering the full application stack.

## Direction discussed

ZSys should be a filesystem-driven application compiler rather than a one-time project generator. It should discover project declarations, construct a normalized application graph, validate cross-system relationships, and render the result through adapters into established TypeScript frameworks and infrastructure tools.

## Proposed decisions

### D-001: Use modules as the physical ownership boundary

Keep entities, routes, views, workflows, tools, agents, jobs, email, and policies for a business capability together under `modules/<name>/`. Provide global virtual views through the CLI and diagrams instead of scattering source files by technical category.

### D-002: Give every resource a canonical logical address

Use stable addresses such as `route://`, `entity://`, `workflow://`, and `database://`. Generate public HTTP or realtime URLs only for resources that should be externally reachable.

### D-003: Make the Application Graph the central semantic model

The filesystem and TypeScript declarations are authoring formats. The versioned graph IR is the source used for validation, generation, visualization, impact analysis, agent tooling, and deployment planning.

### D-004: Compile into established frameworks

Initial adapters should target Hono, oRPC, Drizzle, Next.js, Better Auth, shadcn/ui, Fumadocs, Scalar, React Email, Resend, OpenTelemetry, Sentry, and SST. ZSys should not rebuild routing, authentication, ORM, or cloud state machinery without a demonstrated need.

### D-005: Separate capabilities from providers

Modules request logical capabilities such as database, cache, email, storage, and telemetry. Deployment stages bind those capabilities to local or hosted providers.

### D-006: Use SST as the first deployment adapter

Start with one strongly integrated deployment path. Add direct Pulumi support after the application and provider abstractions are stable. Treat Alchemy support as target-specific and initially experimental.

### D-007: Default to hybrid generation

Developers own feature behavior; the compiler owns reproducible registries, wiring, documentation, clients, diagrams, and deployment artifacts. Managed mode and explicit detachment are also supported.

### D-008: Prototype in TypeScript, then move stable compiler responsibilities to Rust

Use TypeScript to discover the correct conventions and adapter APIs quickly. A future Rust core may own graph construction, validation, incremental compilation, caching, and diagnostics while TypeScript remains the ecosystem/plugin host.

### D-009: Optimize AI integration around structure, not cryptic source code

Canonical project configuration remains readable. Short-key aliases may exist in a machine serialization layer, but stable IDs, JSON output, graph queries, structured diagnostics, and semantic edit operations are the primary agent interface.

### D-010: Share semantics across platforms, not necessarily one renderer

Contracts, policies, schemas, view models, navigation IDs, and design tokens can be shared across web, mobile, and desktop. Platform adapters should be allowed to render different user interfaces appropriate to each platform.

## Consequences

### Benefits

- A consistent architecture across projects and contributors.
- Early validation of route, schema, policy, cache, event, and deployment relationships.
- Reusable adapters without forcing a proprietary implementation of every subsystem.
- Better context and safer mutations for AI agents.
- Visual diagrams and documentation generated from the same semantic model.
- A credible escape path through ordinary framework output and detachment.

### Costs and risks

- The IR and plugin contracts become long-lived compatibility surfaces.
- Filesystem inference can become magical unless diagnostics and explicit overrides are excellent.
- Supporting many frameworks too early would dilute the quality of the core graph and initial adapters.
- Generated/user-owned file boundaries must be unambiguous.
- Schema and infrastructure changes require careful planning and production approval controls.
- Cross-platform UI claims must remain realistic.

## Open questions

1. What is the minimum node and edge set for the first Application Graph version?
2. How are inferred graph edges overridden or declared explicitly?
3. Which artifacts are checked into source control?
4. What are the compatibility guarantees for adapters and plugins?
5. What should `z deploy` do when a migration is destructive or cannot be rolled back safely?
6. How should generated code preserve formatting, comments, and custom code when regeneration is required?
7. Which workflow, queue, and realtime primitives belong in the core versus provider adapters?

## Follow-up actions

- Build a TypeScript spike that discovers one module with an entity, oRPC route, Hono runtime, and Drizzle schema.
- Define `ApplicationGraphV0` and serialize it deterministically.
- Generate an OpenAPI document, typed client, ER diagram, and module diagram from the same graph.
- Implement `z inspect`, `z check`, and `z graph` before attempting broad code generation.
- Create one SST deployment adapter for local and preview environments.
- Test detachment at module scope and document ownership rules.

## Supersedes

None.

## Superseded by

None.

## Change history

- 2026-08-06: Initial record created from the foundational product and architecture discussion.
