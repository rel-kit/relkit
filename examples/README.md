# ZSYS examples

`commerce` is the canonical executable application. It doubles as a proof that
public authoring APIs compile, run, test, document, inspect, and deploy through
the same graph. The generator templates remain intentionally smaller quick
starts.

| Feature                                        | Canonical source                                        | Verification                                                                     |
| ---------------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Application, profiles, environment, secrets    | `commerce/src/app.ts`, `commerce/src/env.ts`            | `tests/integration/commerce-example-consistency.test.ts`                         |
| Functions, dependencies, errors                | `commerce/src/functions`, `commerce/src/errors`         | `tests/integration/engine/fixture-functions.test.ts`                             |
| All HTTP methods and multi-method files        | `commerce/src/routes/orders`                            | `commerce/tests/http.test.ts`, `tests/integration/http/commerce-example.test.ts` |
| Static, dynamic, catch-all, optional catch-all | `commerce/src/routes`                                   | `tests/compiler/commerce-example.test.ts`                                        |
| Inferred and explicit request/response mapping | `commerce/src/routes/orders`                            | `tests/integration/http/commerce-example.test.ts`                                |
| Multipart files and body limits                | `commerce/src/routes/uploads/route.ts`                  | `tests/integration/http/commerce-example.test.ts`                                |
| Middleware and rate limiting                   | `commerce/src/middleware`, `commerce/src/routes/orders` | `tests/integration/http/commerce-example.test.ts`                                |
| Events and typed callback listeners            | `commerce/src/events`                                   | `tests/restart/events.test.ts`                                                   |
| Jobs and schedules                             | `commerce/src/jobs`                                     | `tests/integration/jobs/commerce-example.test.ts`                                |
| Buckets and cache                              | `commerce/src/buckets`, `commerce/src/cache`            | `tests/integration/engine/fixture-resources.test.ts`                             |
| Tools and agents                               | `commerce/src/tools`, `commerce/src/agents`             | `tests/integration/agents/commerce-example.test.ts`                              |
| Generated client, OpenAPI, Scalar              | generated from `commerce/src/routes`                    | `tests/integration/http/commerce-example.test.ts`                                |
| Inspector and observability                    | compiled commerce graph                                 | `tests/integration/commerce-example-consistency.test.ts`, `tests/inspector`      |
| AWS deploy profile                             | `commerce/src/app.ts`                                   | `tests/deployment/aws-integration.test.ts`                                       |

Run the example from its directory after building the workspace:

```sh
bun run check
bun run typecheck
bun run test
bun run build
bun run dev
```

Every new public feature must update its owning tests, this canonical example,
and the relevant documentation in the same change.
