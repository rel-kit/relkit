---
"relkit": patch
"@relkit/inspector": patch
---

The Inspector API's publication rows carry `producerTraceId` and `originRequestId`, so an event's publication links to its trace and to the request that caused it. Payloads stay out of the list, as before.

When the application refuses an Inspector request with its own Problem Details answer, the Inspector keeps that answer and names the reason (for example the origin check) in place of a bare HTTP status.
