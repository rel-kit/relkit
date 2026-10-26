---
"@relkit/agents": minor
"@relkit/app": minor
"@relkit/better-auth": minor
"@relkit/cli": minor
"@relkit/client": minor
"@relkit/compiler": minor
"@relkit/contracts": minor
"create-relkit": minor
"@relkit/deploy-pulumi": minor
"@relkit/drizzle": minor
"@relkit/engine": minor
"@relkit/integrations": minor
"@relkit/observability": minor
"@relkit/provider": minor
"@relkit/providers-local": minor
"relkit": minor
"@relkit/runtime-hono": minor
"@relkit/testing": minor
"@relkit/aws": minor
"@relkit/effect-mq": minor
"@relkit/inngest": minor
"@relkit/pulumi": minor
"@relkit/redis": minor
"@relkit/sentry": minor
"@relkit/trigger": minor
"@relkit/langchain": patch
"@relkit/observability-local": patch
---

Keep ordinary backend, generic client and testing installations free of unselected
native SDKs. Selected integrations declare optional peers and validate their actual
installed versions before configuration evaluation, startup or deployment.

Move native agent APIs and test helpers to `@relkit/langchain`, local diagnostic
storage to `@relkit/observability-local`, and native auth/database testing to explicit
testing leaves. Frontend clients and optional HTTP transports remain explicit
selections. Runtime lifecycle belongs to the engine; production starts emitted
JavaScript with an exact selected dependency manifest. The legacy CLI inspector
remains a Stage 1 development dependency.

The lightweight creator owns new project creation; existing project editing belongs
to the CLI. The wrapper resolves compatible project-local tooling, and the catalog
contains metadata only. Selected auth scaffolds preserve Better Auth 1.7.1 schema
history and the existing Drizzle patch while carrying the official fetch typing fix.

These packages retain independent versions. Existing package minor releases carry
the intentional import and dependency-policy changes; the new native packages have
their own initial release identities. No publication or version command is included.
