---
"relkit": patch
---

A 500 or 502 response no longer carries the cause of a provider or unexpected failure in any
mode, development included (D10); its `detail` is the generic message. The cause is recorded
instead: in development, one error log record with the redacted cause (`exception.type`,
`exception.message`, `exception.stacktrace`, correlated by request, trace and span ID) and an
`exception` event with the same attributes on the request span; in other modes, the failure's
class only (`exception.type`, `relkit.error.code`), without message text. Bound parameters a
database driver appends to a failed query (`params: …`) are masked. The invocation span gets an
`exception` event naming the failure's class in every mode.

A declared application failure records its identifier as `relkit.error.id` on the invocation span
and on the request span. The `http.validation.failed` event carries
`relkit.validation.issue_count` and, for the first ten issues,
`relkit.validation.issues.<n>.code` and `relkit.validation.issues.<n>.path`, never messages or
values; it is now also recorded when the function's own input validation rejects a request.

An HTTP route whose function has an access rule with `roles` or `permissions` now answers 401
(no session) or 403 (missing role or permission) before it reads or validates the request input,
so the answer names no input field. Rules with an `allow` predicate, which reads input, still run
after validation.

JSON bodies are decoded strictly: strings are converted to numbers and booleans only for values
read from the path, query, headers and cookies. A JSON body value of `"3500"` for an integer field
is now a validation error instead of being accepted as `3500`.

A route that maps JSON body fields rejects a body that is not a JSON object (`null`, an array, a
string or a number) with one validation issue, code `body-not-object`. Before, such a body counted
as "no fields": a `PATCH` succeeded as an empty change and a `POST` reported each field missing.
