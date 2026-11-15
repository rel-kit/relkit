---
"@relkit/better-auth": patch
---

Fixed: the API reference for the mounted Better Auth endpoints is true to what they send. Better
Auth's `nullable: true` (OpenAPI 3.0) becomes `type: [..., "null"]` (OpenAPI 3.1), so the `image`
of a new user validates as `null`; `POST /organization/delete` describes the organization it
returns, `POST /organization/has-permission` allows `error: null`, and `check-slug`,
`list-invitations` and `list-members` declare their 200 answers. Every endpoint that takes a body
also declares 413 (`payload-too-large`, from the server's body limit) and 415 (Content-Type not
accepted). The new `BetterAuthProblem` component holds the Problem Details schema of the 413.
Differences that remain are listed on the Better Auth documentation page.
