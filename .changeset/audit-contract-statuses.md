---
"relkit": patch
---

Fixed: the generated OpenAPI document now declares the Problem Details responses the server sends
for each operation. A route with an access rule declares 401 and 403 (route authentication alone
declares 401), an operation that reads input declares 422, one that can have a request body also
declares 413 `payload-too-large`, a rate-limited route declares 429 with the rate limit headers,
and every operation that runs a function declares 500. An operation that reads no input declares
no 422, and one without a request body declares no 413. A response the route declares itself
replaces the generated one, and raw handlers keep their single `default` response. The responses
refer to one shared `Problem` schema in `components.schemas` instead of repeating it, so a client
generated from the document sees a new `Problem` component and `allOf` for the narrowed
validation, oversize and rate limit bodies. `OpenApiDocument.components.securitySchemes` is now
optional and `components.schemas` is added; `problemSchema` and `PROBLEM_SCHEMA` are exported from
`relkit/openapi`.
