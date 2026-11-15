---
"relkit": patch
"@relkit/inspector": patch
---

A history query the validator rejects answers with the validator's own message and the parameter
it names, beside the code: `{ "error": "RELKIT_OBSERVABILITY_QUERY_INVALID", "message":
"Observability query status is invalid: expected an HTTP status from 100 to 599 or a class from
1xx to 5xx", "parameter": "status" }`. Both the application's history API and the Inspector's own
history backend answer this way, and the Inspector's client keeps the message and the parameter
on the error it throws. Failures of any other kind still answer with their code only.
`ObservabilityQueryError` and `QueryValidationError` carry an optional `parameter`.
