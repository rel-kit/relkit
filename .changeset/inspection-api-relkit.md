---
"relkit": patch
---

The inspection API now passes a channel's declared `params`, `replay` and `presence`, and an agent's `modelSource` and `instructions`, through the graph projection, so the Inspector shows a channel's partition parameters and replay window instead of "Not declared" and "live only".

A rejected Inspector action now carries the application's answer under `cause`: the HTTP status it would have sent and its safe error code (`{ "status": 401, "code": "unauthenticated" }` for a function whose access rule needs a session, a declared error's id and status, or `validation` with the invalid field paths), never the message or data. The action's own status and `error` code are unchanged.
