---
"relkit": minor
"@relkit/cli": minor
"@relkit/testing": minor
---

Middleware can declare the data it provides: `defineMiddleware(path, { provides: schema, handler })` gives the handler `relkit.provide(data)`, which validates the data against the schema. Routes map a provided field into their function's input with `http.from(middleware, "field")`, typed from the schema; the generated client and OpenAPI leave such fields out. `defineMiddleware(path, handler)` keeps working for Hono-style middleware.
