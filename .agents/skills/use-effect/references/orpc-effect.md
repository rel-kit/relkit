# oRPC + Effect

Load only when scoped procedures, middleware, clients, or their owning adapter
use oRPC.

## Official reference and version check

Read the relevant sections of the
[oRPC Effect integration guide](https://orpc.dev/docs/integrations/effect).
The documented adapter is `@orpc/experimental-effect`. Check installed exports,
peer dependencies, and the pinned Effect version before selecting a pattern;
do not add experimental packages or upgrade from an example automatically.

## Apply at the RPC boundary

- Use compatible `handlerGen`/`middlewareGen` adapters for Effect generators,
  and `createEffectClient` for lazy Effect client calls with cancellation.
  Keep handlers thin: delegate domain workflows to Services supplied by Layers.
- `WithEffectContext` describes services passed through `'effect/context'`;
  `'effect/wrap'` can provision or instrument execution. Own shared Layers at
  the runtime boundary and request resources within request scopes. Verify the
  installed adapter's cancellation behavior and preserve authentication context.
- Translate domain tagged failures into declared oRPC errors at the boundary.
  `catchORPCError`, `catchORPCErrorCode`, and `catchORPCErrorCodes` support
  targeted recovery. Preserve unrelated failures, defects, and interruption.
- Use `Schema.toStandardSchemaV1` for schema validation when compatible. Direct
  schema `.input`/`.output` requires the initialization import
  `@orpc/experimental-effect/extensions/input-output`; `.effect` requires
  `@orpc/experimental-effect/extensions/effect`. Load extensions only for their
  chosen API and verify initialization actually runs.
- Consult `EffectSchemaToJsonSchemaConverter` only for required JSON Schema or
  OpenAPI generation. Read the guide's OpenTelemetry section only when that
  integration is used; retain the main skill's logs, metrics, and scoped tracing.

Check core Effect contracts against `<project-root>/repos/effect` and the
selected `api-selection.md` sections. Check adapter contracts against installed
oRPC source/tests or an existing matching vendor checkout; core Effect source
alone cannot verify the RPC integration.

Use Vitest with `@effect/vitest` under the owner's root `tests/` for changed
schema validation, error translation, fake Service Layers, and applicable
request/client cancellation. Verify observability at standalone Service calls
and RPC edges without counting the same operation twice.
