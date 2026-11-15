---
"relkit": patch
---

Added: the request outcome `refused`, for the framework's own early answers. A path no route
matches (404), a method the path does not accept (405) and a body over `maxBodyBytes` (413) are
recorded as `refused` instead of `declared-error` or `validation-error`, so the outcome filter
separates them from errors an application declared. `REQUEST_OUTCOMES` and `RequestOutcome` include
the new value; code that switches over every outcome needs a case for it. A route's own 404 keeps
`declared-error`.
