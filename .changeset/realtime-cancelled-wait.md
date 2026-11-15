---
"relkit": patch
---

Fixed: a channel stream whose client went away while the server waited for the next event failed
with `HttpBoundaryError realtime.wait` and was logged at error level as "Execution operation
failed" (`operation=realtime.observe`), although its request was recorded as cancelled. The stream
now ends when its caller's signal aborts during the wait, and no error is logged.
