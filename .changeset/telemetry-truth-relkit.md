---
"relkit": patch
---

A request whose client closes a streamed response it received (a realtime subscription, a server-sent event stream) is now recorded with the status that was sent, for example `200`, and the outcome `cancelled`; `499` is recorded only for a request cancelled before any response.
