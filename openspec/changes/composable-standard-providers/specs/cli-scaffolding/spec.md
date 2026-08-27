## MODIFIED Requirements

### Requirement: Project creation entry points and defaults

`bunx create-relkit@latest <name>` and `relkit create <name>` SHALL generate a convention-based TypeScript/Bun project with one public provider topology, protocol adapter examples, deployment target/adapter configuration, a minimal function and named-method route, typed config, tests, Bun package management, and Git initialization when available unless flags override supported choices.

#### Scenario: Default project is generated

- **WHEN** a developer generates a default deployable project
- **THEN** its application has no provider environment branches or `RELKIT_ENV` schema field and hosting selection appears only in `relkit.config.ts`

### Requirement: Generated application stays on public APIs

Generated source SHALL use ordinary async handlers, Standard Schema, public descriptors/testing helpers, one composable provider topology, body capture off by default, and no internal runtime, cloud SDK, Hono, Next.js, Effect, or Pulumi import.

#### Scenario: Generated sources are scanned

- **WHEN** minimal, API, and agent templates are generated
- **THEN** they use `external`/`managed` protocol bindings and contain no removed provider recipes or application-declared `RELKIT_ENV`

## ADDED Requirements

### Requirement: Doctor validates provider references safely

Doctor SHALL validate required adapter environment references, reserved keys, deployment ownership support, and missing configured adapter factories without resolving or printing secret values.

#### Scenario: External Redis secret is missing

- **WHEN** doctor checks an application whose required external Redis URL is absent
- **THEN** it reports the missing environment key and binding identity without printing any connection value
