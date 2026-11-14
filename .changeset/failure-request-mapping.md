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
