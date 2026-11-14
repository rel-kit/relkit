---
"relkit": patch
---

The inspection API now passes a channel's declared `params`, `replay` and `presence`, and an agent's `modelSource` and `instructions`, through the graph projection, so the Inspector shows a channel's partition parameters and replay window instead of "Not declared" and "live only".

A rejected Inspector action now carries the application's answer under `cause`: the HTTP status it would have sent and its safe error code (`{ "status": 401, "code": "unauthenticated" }` for a function whose access rule needs a session, a declared error's id and status, or `validation` with the invalid field paths), never the message or data. The action's own status and `error` code are unchanged.

Every graph and runtime collection page of the inspection API now carries `total`, the number of records matching its filters, so the Inspector can say "20 of 23". The runtime events page passes through a delivery `total` and per-state `counts` when the event provider reports them.

`createInspectorEventActions` (from `relkit/inspector-api`) provides the Inspector's event publish, replay, status, retry and cancel for a development server: publish goes through the application's own event client with the event's declared schema, so an invalid payload is refused (`422`, `cause.issues` naming the fields); replay uses the provider's `replay` when it has one and otherwise publishes the stored payload of the publication again; a provider without the operation answers `RELKIT_INSPECTOR_ACTION_UNSUPPORTED` (`501`). Inspector action errors whose code names a validation now answer `422` and unsupported ones `501`. The local event provider's query accepts `publicationId` and then returns that publication's stored `payload`.

Observed edges in the inspection API now keep `count`, `firstSeenAt` and `lastSeenAt` when the runtime reports them.
