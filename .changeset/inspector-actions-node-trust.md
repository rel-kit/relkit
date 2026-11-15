---
"@relkit/inspector": patch
---

The Inspector refuses a state-changing request that the browser marks as sent by another site (`Sec-Fetch-Site: cross-site` or `same-site`) before anything reaches the application. What it forwards to the application is its own call: the browser's `Origin`, `Referer`, `Sec-Fetch-*` and proxy forwarding headers are dropped, and so are the browser's cookies, which for the Inspector's host also include the application's, so invoking a function, publishing or replaying an event and sending a route request run without a user session, as documented. An `Authorization` header typed in the route composer is still sent.

History status says what is true. During an outage of the application, retained history is `ready` and the new `collection` field is `application-unreachable`, with the failure in the new `applicationError` field; `state: degraded` and `error` now mean that history itself is unavailable (`collection: history-unavailable`). A tool with no development session and no lost record no longer reports history as `incomplete`; a loss reported once stays reported for that session.
