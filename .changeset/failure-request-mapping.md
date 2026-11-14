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
