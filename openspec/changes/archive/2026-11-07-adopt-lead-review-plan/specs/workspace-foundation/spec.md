# Spec Delta

## MODIFIED Requirements

### Requirement: Reproducible Bun workspace

The repository SHALL provide a private Bun workspace on TypeScript 7 whose committed lockfile, strict
shared TypeScript configuration, project references and root scripts produce the same install and
verification behavior from a clean checkout.

#### Scenario: Clean checkout succeeds

- **WHEN** a contributor runs `bun install --frozen-lockfile`, `bun run typecheck`, and
  `bun run verify` from a clean checkout with supported tool versions
- **THEN** all commands complete without hidden local setup or uncommitted generated changes

#### Scenario: Lockfile drift is rejected

- **WHEN** declared dependencies do not agree with the committed lockfile
- **THEN** frozen installation or the no-diff verification step fails with an actionable error

### Requirement: Integrations are independently installable workspace packages

The workspace SHALL publish each integration — Redis, S3, Docker, local services, Cloudflare,
Postgres, agent adapters, Sentry, OTLP, AWS, Pulumi and deploy targets — as its own `@relkit/*`
package on the shared release version. Each SHALL own its exports, project reference, build, check and
test participation, public documentation, packed verification and maturity label. Integration
metadata SHALL live in `create-relkit`, not in a separate catalog package.

#### Scenario: Application installs only Redis

- **WHEN** it depends on `@relkit/redis`
- **THEN** package resolution and generated runtime output do not require S3, AWS, Pulumi, Sentry,
  OTLP, or their SDKs

#### Scenario: Application installs the catalog

- **WHEN** an application or tool needs the list of available integrations
- **THEN** it reads the metadata bundled with `create-relkit`, no `@relkit/integrations` package is
  installed, and selecting Redis uses `@relkit/redis` directly
