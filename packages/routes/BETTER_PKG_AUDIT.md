# Routes package audit

Every authored runtime module below has an Effect execution path. Synchronous
exports run that path and preserve TypeError compatibility. Expected package
validation failures use `RouteOperationError`; unexpected defects remain defects.
Each operation has one stable Effect span and bounded telemetry through
`RouteTelemetry`. Pure inner calculations use value helpers inside the parent
Effect runtime and share its observation rather than starting a separate runtime.

| Runtime module                    | Executable exports and role                                                                             | Test coverage                                                  |
| --------------------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `define-middleware.ts`            | `defineMiddleware`, `isMiddlewareDescriptor`, `isMiddlewarePath`, and their `Effect` variants           | Descriptor, path, invalid input, and ID Layer tests            |
| `define-route.ts`                 | `defineRoute` and `defineRouteEffect`                                                                   | Function/raw routes, policy and mapping errors, typed failures |
| `route-definition.ts`             | `prepareRouteValue` validates and builds a descriptor inside `defineRouteEffect`                        | Both route kinds, validation precedence, identity timing       |
| `define-service-routes.ts`        | `defineServiceRoutes` and `defineServiceRoutesEffect`; `SERVICE_ROUTE_METHODS` is constant data         | Every HTTP method, member lookup, invalid tables               |
| `http-dsl.ts`                     | `defineTransform`, `defineRequestTransform`, `isTransformRef`, `http`, and Effect counterparts          | Transform metadata, references, all facade methods             |
| `http-dsl-operations.ts`          | `httpEffects` contains Effect implementations of every HTTP mapping constructor                         | All constructor kinds, defaults, invalid input                 |
| `http-dsl-source-operations.ts`   | `httpSourceEffects` implements input and request-source methods used by `httpEffects`                   | All source kinds, optional/default settings                    |
| `http-dsl-values.ts`              | `httpValue` and `isTransformRefValue` are pure calculations invoked by the Effect constructors          | All reachable constructor branches                             |
| `http-dsl-mapping-validation.ts`  | Mapping and request guards/assertions with Effect counterparts; recursive mapping helper                | Valid and malformed mapping graphs                             |
| `http-dsl-response-validation.ts` | Response and middleware-decision guards/assertions with Effect counterparts                             | Status, schema, body, and decision variants                    |
| `http-dsl-value-validation.ts`    | Schema, status, and record guards/assertions with Effect counterparts; pure inner predicates            | Boundary and invalid values                                    |
| `route-auth.ts`                   | Registration reading and protected-path copying with Effect counterparts                                | Registration, sorting, deduplication, invalid patterns         |
| `route-client.ts`                 | Client and stream policy copying with Effect counterparts                                               | Valid policies and typed failures                              |
| `route-options.ts`                | Rate-limit copying, positive integer and success-status validation with Effect counterparts             | Numeric/cache policies and boundaries                          |
| `route-observability.ts`          | Tagged errors, `RouteTelemetry`, `RouteTelemetryLive`, observation, identity, and compatibility helpers | Test Layers, live spans and metrics, defects, ID failures      |

`index.ts` and `http-dsl-validation.ts` are pure barrels. The ten `*.types.ts`
files are declarations only. `vitest.config.ts` is test configuration. All
package tests are under `tests/`; no generated or vendored files were edited.

There are no package-owned listeners, subscriptions, timers, or live handles to
release. Route handlers are references owned by the application. Construction
and validation are synchronous; service-route members are processed in order so
validation precedence and generated ID order stay stable. Parallelism would
change those behaviors without improving IO throughput.

The seven Vitest files exercise direct Effect paths, compatibility adapters,
tagged failures, Layer substitution, single spans, metrics, and malformed
boundaries. V8 coverage includes all 15 runtime modules and enforces 100%
lines, branches, functions, and statements. There are no known untested runtime
operations.
Every authored TypeScript file has at most 200 lines.

The boundary rule now permits Effect in `@relkit/routes`; existing Effect imports
in `@relkit/services` still fail the repository check. The Phase 0 export smoke
fails on the unchanged `@relkit/events` export map. The aggregate package run
passed all 301 Vitest files (1,366 tests) and both Bun test groups (714 passed,
1 skipped).
