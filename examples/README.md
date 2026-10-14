# RELKIT examples

`commerce` is the canonical executable application. Its grouped service tree keeps
native authoring APIs, logical IDs, routes and ownership contracts together.
The generator templates are smaller maintained fixtures; public creation currently
offers the certified minimal tuple only.

| Feature                                       | Maintained source                                                                | Verification                                                                                           |
| --------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Application, profiles and environment         | `commerce/relkit.config.ts`, `commerce/src/platform/env.ts`                      | `tests/integration/commerce-example-consistency.test.ts`                                               |
| Functions, calls, errors and resources        | `commerce/src/services/orders/`, `commerce/src/services/receipts/`               | `commerce/src/authoring-assertions.test.ts`, `tests/integration/runtime-instrumentation.test.ts`       |
| HTTP methods, mapping, uploads and middleware | `commerce/src/routes/`                                                           | `commerce/tests/http.test.ts`, `tests/integration/http/commerce-example.test.ts`                       |
| Public service contracts                      | `commerce/src/services/*/service.ts`                                             | `tests/integration/http/service-contract.test.ts`                                                      |
| Events and receiver-owned subscriptions       | `../apps/docs/examples/events/`, explicit flat event fixtures                    | `tests/restart/events.test.ts`                                                                         |
| Tasks, jobs, cache and buckets                | `commerce/src/services/orders/`, `commerce/src/services/assets/`                 | `commerce/src/authoring-assertions.test.ts`, `tests/restart/jobs.test.ts`                              |
| Native LangChain/LangGraph/DeepAgents         | `commerce/src/services/orders/agents/`, `commerce/src/services/orders/tools/`    | `commerce/src/agent-authoring-assertions.test.ts`, `tests/integration/agents/commerce-example.test.ts` |
| Realtime channels and authorization           | `commerce/src/services/announcements/`, `commerce/src/services/orders/channels/` | `commerce/tests/channels.test.ts`                                                                      |
| Native Drizzle models and transactions        | `data-model/src/services/database/`                                              | `data-model/tests/data-model.test.ts`                                                                  |
| Better Auth and protected routes              | `auth-drizzle/src/services/auth/`, `auth-drizzle/src/routes/`                    | `auth-drizzle/tests/auth.test.ts`                                                                      |
| Inspector and observability                   | Compiled commerce graph                                                          | `tests/inspector/`, `tests/integration/commerce-example-consistency.test.ts`                           |
| Offline deployment plans                      | `commerce/relkit.config.ts`                                                      | `tests/deployment/`; real AWS acceptance requires separate authorization                               |

Services own immediate `src/services/<name>/service.ts` boundaries and local helpers,
schemas, assets and descriptors. Routes stay in `src/routes/`; shared configuration
belongs to Platform. Retained flat fixtures prove compatibility at `src/<name>/service.ts`.
Additions preserve the detected root. Preview an optional coordinated move with
`bun run relkit migrate layout`; validate and freshly prepare before restarting it.

Run an example from its directory after building the workspace:

```sh
bun run check
bun run typecheck
bun run test
bun run build
bun run dev
```

Every new public feature must update its owning tests, the appropriate executable
example, and its documentation in the same change. Test paths identify the owning
checks; they do not imply that paid providers or cloud acceptance ran.
