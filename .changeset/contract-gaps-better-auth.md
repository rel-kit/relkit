---
"@relkit/better-auth": patch
---

Fixed: the API reference declares the error body the Better Auth endpoints send. Every 4xx and 5xx
JSON response of an authentication operation refers to the new `BetterAuthError` schema (`message`,
usually `code`, and `issues` on a validation failure) in place of the `message`-only schema Better
Auth's generator writes. The errors themselves are unchanged: they stay in Better Auth's format and
are not Problem Details. The 403 of a state-changing operation, such as
`POST /api/auth/organization/set-active`, also lists `application/problem+json`, which RelKit's
transport policy sends for a request from another origin. `POST /api/auth/get-session` is listed
only when `session.deferSessionRefresh` is set, because Better Auth answers 405 to it otherwise.
