# ZSys Project Brief

**Date:** 2026-08-06
**Status:** Working brief
**Audience:** TypeScript developers, AI coding agents, framework contributors, and platform engineers

## Summary

ZSys is a proposed filesystem-driven application compiler for building production full-stack applications from a consistent, high-level project structure.

Its central model is:

> The filesystem is the authoring syntax, an application graph is the semantic model, and framework and infrastructure adapters are compiler targets.

The project should reduce repeated setup and integration work while preserving ordinary, editable TypeScript output. It should help teams build APIs, database models, authentication, organizations, teams, user interfaces, documentation, email, caching, workflows, AI agents, observability, and deployable infrastructure through one coherent system.

ZSys should compile into established tools rather than replace them without a strong reason.

## Product goals

ZSys should provide:

- A predictable project structure similar in clarity to Next.js file conventions.
- Contract-first APIs and generated typed clients.
- Database schemas, relations, migrations, and visual ER diagrams.
- Web, API, documentation, email, workflow, and later mobile and desktop surfaces.
- Authentication, organizations, teams, roles, permissions, and policies.
- Redis, queues, scheduled jobs, realtime channels, and event wiring.
- OpenAPI output and Scalar API references.
- Observability through OpenTelemetry, Sentry, logging, metrics, and health checks.
- One-command local development, validation, planning, and deployment.
- Stable machine-readable interfaces for AI agents.
- Managed, hybrid, and detached modes so developers are never trapped.

## Primary target stack

| Capability | Initial target |
|---|---|
| Backend runtime | Hono |
| API contracts | oRPC, contract-first |
| Web frontend | Next.js |
| UI | shadcn/ui |
| Authentication | Better Auth |
| Database | PostgreSQL |
| ORM and migrations | Drizzle ORM and Drizzle Kit |
| API documentation | OpenAPI, Swagger-compatible output, Scalar |
| Product documentation | Fumadocs |
| CMS | Payload CMS adapter |
| Email rendering | React Email |
| Email delivery | Resend, with provider adapters |
| Cache and coordination | Redis-compatible capability |
| AI | Mastra and/or LangChain adapters |
| Mobile | Expo first; shared semantics with platform-specific rendering |
| Observability | OpenTelemetry and Sentry adapters |
| Deployment | SST first, followed by Pulumi and selected Alchemy support |

## Proposed project structure

Modules are the main ownership boundary. This keeps one business capability together instead of scattering it across global folders.

```text
zsys-app/
├─ zsys.config.ts
├─ apps/
│  ├─ api/
│  ├─ web/
│  ├─ mobile/
│  └─ docs/
├─ modules/
│  ├─ identity/
│  │  ├─ module.ts
│  │  ├─ entities/
│  │  ├─ api/
│  │  ├─ views/
│  │  ├─ realtime/
│  │  ├─ workflows/
│  │  ├─ agents/
│  │  ├─ tools/
│  │  ├─ jobs/
│  │  ├─ emails/
│  │  └─ policies/
│  └─ billing/
├─ resources/
│  ├─ main.database.ts
│  ├─ sessions.redis.ts
│  ├─ transactional.email.ts
│  └─ observability.ts
├─ ui/
└─ deploy/
   ├─ local.stage.ts
   ├─ preview.stage.ts
   └─ production.stage.ts
```

The CLI and visual tooling can expose category-oriented virtual views such as all routes, entities, workflows, tools, and resources, while the physical repository remains domain-oriented.

## Canonical resource addresses

Not every resource should be exposed through an HTTP URL. Every resource should instead receive a stable logical address, with a network URL only when appropriate.

```text
route://identity/users/:userId
view://identity/users/:userId
entity://identity/user
workflow://identity/invite-member
agent://identity/onboarding
tool://identity/find-member
channel://identity/presence
database://main
cache://sessions
telemetry://default
stack://production/api
```

These identifiers make graph traversal, diagnostics, generated documentation, deployment output, and AI-agent operations deterministic.

## Application graph

The compiler should normalize the filesystem and TypeScript declarations into a versioned Application Graph intermediate representation. Nodes may include apps, modules, entities, relations, routes, contracts, views, policies, events, channels, workflows, agents, tools, resources, and deployments.

Important edge types include:

```text
owns, imports, exports, reads, writes, renders, invokes,
publishes, subscribes, caches, invalidates, authorizes,
documents, observes, and deploys
```

The graph enables:

- Route, entity, permission, and dependency validation.
- ER diagrams and module dependency diagrams.
- Runtime invocation and deployment topology views.
- OpenAPI generation and typed clients.
- Change-impact analysis.
- Structured context and mutation operations for AI agents.

## Compiler architecture

The first prototype should be implemented in TypeScript to iterate quickly on conventions, the IR, and adapters. Once those contracts stabilize, performance-sensitive orchestration can move into Rust.

A likely long-term split is:

- **Rust core:** discovery, hashing, graph construction, incremental compilation, validation, diagnostics, caching, graph diffs, and plugin orchestration.
- **TypeScript host:** evaluating user configuration, loading ecosystem objects, framework adapters, generators, and extension hooks.

The compiler should produce ordinary framework projects and generated artifacts, not require a proprietary runtime for all application behavior.

## Generation and detachment

ZSys should support three ownership modes:

1. **Managed:** generated files are compiler-owned and reproducible.
2. **Hybrid:** business logic is developer-owned while registries, contracts, wiring, docs, and infrastructure output remain generated. This should be the default.
3. **Detached:** selected modules or applications are materialized as ordinary Hono, Next.js, Drizzle, oRPC, and infrastructure code and are no longer compiler-owned.

Detachment should preserve integration through explicit external-module interfaces. ZSys should not promise unrestricted bidirectional synchronization after arbitrary edits to detached generated code.

## Developer and agent experience

Representative commands:

```bash
z dev
z check
z inspect route://billing/invoices --json
z graph
z urls
z plan --stage production
z deploy --stage production
z detach module billing
```

Human-authored configuration should use clear canonical names. Optional short aliases such as `rt` for `route` may be supported only as a normalized machine serialization dialect. AI usefulness should primarily come from stable identifiers, structured diagnostics, graph queries, semantic edit commands, and an MCP or equivalent tool interface.

## Deployment model

The application declares logical capabilities, while each stage binds them to providers. Business modules should request a database, cache, email service, storage, or telemetry capability without embedding provider-specific details.

The initial deployment target should be SST because it fits the TypeScript ecosystem and can provide an integrated development and deployment experience. Pulumi should be supported as a lower-level and broader provider target. Alchemy can be evaluated for selected targets as its production characteristics mature.

ZSys should not create its own general cloud state engine. Planning, state, replacements, imports, and resource lifecycle should be delegated to established infrastructure engines.

## MVP boundary

The first production-oriented release should include:

- Module-first filesystem conventions.
- Hono API generation and runtime wiring.
- oRPC contract-first endpoints and typed clients.
- PostgreSQL, Drizzle schemas, relations, and migrations.
- Next.js and shadcn/ui CRUD surfaces.
- Better Auth with organizations, teams, roles, and permissions.
- OpenAPI and Scalar output.
- Redis capability and basic event/job abstractions.
- React Email and Resend integration.
- OpenTelemetry and Sentry hooks.
- ER and module graphs.
- SST-based local, preview, and production stages.
- Hybrid generation, detachment, and machine-readable CLI output.

Native mobile and desktop renderers, multiple workflow engines, multiple infrastructure engines, and visual application editing should follow after the graph and adapter contracts are proven.

## Current differentiator

ZSys should not be positioned as another scaffold generator. Its differentiator is a continuously understood, typed full-stack application graph that can be rendered into familiar TypeScript frameworks, queried by humans and agents, validated before deployment, and detached without losing developer ownership.

## Open questions

- Which declarations are inferred entirely from the filesystem and which require explicit metadata?
- What is the smallest stable IR that can support the first adapters without over-generalizing?
- How should user-authored code expose graph edges that cannot be inferred safely?
- How should migration safety and destructive changes be approved in local, preview, and production stages?
- Which generated artifacts are committed, cached, or always ephemeral?
- What plugin API boundaries are required before external contributors can build reliable adapters?
- Should the first release include a workflow runtime or only interfaces to existing workflow engines?

## Recordkeeping

Material discussions and decisions should be captured under `docs/records/`. Each record has a stable ID and links to any record it supersedes. This brief describes the current direction; detailed rationale belongs in individual records.
