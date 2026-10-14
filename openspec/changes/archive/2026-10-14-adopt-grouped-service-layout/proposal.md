## Why

Applications currently place each service directly beneath `src/`, mixing business capabilities with the reserved Routes and Platform layers. A grouped, service-first layout makes ownership easier to navigate as applications grow, provided moving source does not change logical identities, security boundaries, provider ownership, or durable state.

## What Changes

- Make `src/services/<service>/service.ts` the standard application service boundary, alongside `src/routes/` and `src/platform/`. Preserve previously valid flat applications and layout-aware additions; reject mixed layouts, duplicate ownership, aggregate grouping services, and nested independent services.
- Use one internal layout interpretation across discovery, ownership, source identity derivation, diagnostics, generated contracts, scaffolding, build/watch tooling, and source navigation. The grouping directory is identity-neutral; physical provenance remains accurate.
- Preserve public authoring APIs, specialized database/auth contracts, route URLs, exposure, provider bindings, and durable identities. Enforce import boundaries for helpers as well as descriptors, including project aliases and statically resolvable import forms.
- Add a preview-first, transactional migration with syntax-aware rewrites, conflict reporting, staged validation, restoration on failure, and repeatable no-op behavior. Preserve persistent resources and user-owned files.
- Verify explicitly imported Platform configuration fragments and environment contracts throughout configuration loading, cache invalidation, and development activation.
- Update template sources, layout-aware `add`, canonical examples, documentation, and affected repository skills with their references/examples when grouped support is implemented. Verify skill instructions against both new grouped and existing flat applications. Keep minimal output small and retain existing creation capability certification gates.
- Apply the complete `$use-effect` skill and its required references to every added, edited, or moved authored file, with an applicable per-file review at each implementation phase and a final coverage check. Preserve public descriptor APIs and avoid artificial Effect wrappers in pure helpers or non-runtime files.
- Require paired flat/grouped compatibility evidence, real HTTP security checks, durable recovery, offline deployment identity comparisons, packed distribution checks, and refreshed affected startup certification.

## Capabilities

### New Capabilities

None. This extends existing application contracts; organizational folders do not introduce framework capabilities.

### Modified Capabilities

- `domain-services`: Grouped ownership, one layout per application, flat compatibility, and layer/import boundaries.
- `compiler-graph`: Shared layout interpretation, identity neutrality, configuration dependency tracking, and incremental correctness.
- `cli-scaffolding`: Grouped defaults, layout-aware additions, and safe application-layout migration.
- `developer-documentation`: Complete placement reference, executable flat-to-grouped migration guidance, and synchronized repository skills and agent instructions.
- `development-inspector`: Layout-independent domain presentation, accurate moved-source links, and state-preserving rebuild behavior.
- `acceptance-verification`: Flat/grouped contract, security, migration, durability, package, readiness, skill-guidance, and per-file use-effect evidence.

## Impact

Implementation spans internal contracts/compiler, CLI and `packages/create-relkit`, generated types and execution references, runtime/build/watch consumers, Inspector, `templates/default/v1`, `examples/commerce`, tests, scripts, and current documentation. Existing database/auth, HTTP, realtime, tasks/jobs, agents, providers, and deployment remain compatibility surfaces rather than redesigned APIs.

No automatic moves, configurable source roots, nested independent services, microservice deployment model, new workflow APIs, monorepo reorganization, or removal of valid flat-layout support are included. Main specifications will receive these deltas through the normal sync/archive workflow; archived changes remain historical. New template output changes intentionally, but previously valid flat applications retain support. Cloud acceptance requires separate authorization.
