---
"relkit": patch
---

A request whose client closes a streamed response it received (a realtime subscription, a server-sent event stream) is now recorded with the status that was sent, for example `200`, and the outcome `cancelled`; `499` is recorded only for a request cancelled before any response.

The local event provider no longer floods the logs of an idle application: its 100 ms delivery poll and its inspection query record no success log for their provider operations (failures still log, and a delivered event handler keeps the application's log policy). The poll no longer builds a full inspection snapshot, and one inspection query reads the delivery queue once instead of once per stored delivery: over 500 stored deliveries a query performs 9 provider operations instead of 4,011.

Without a configured telemetry exporter no export queue starts, so `exportCounters().exportFailures` stays at zero; it used to count the records an exporter-less queue rejected under load. With an exporter, `exportFailures` counts records an exporter failed to export and the new `exportCapacityRejections` counts records the full export queue rejected.

Requests handled outside declared routes are no longer recorded with the route `unknown`: requests answered by the mounted Better Auth handler are recorded under `relkit.auth`, the generated server's `/healthz` probe under `relkit.system.health` and the framework RPC endpoint under `relkit.rpc`. `systemRouteNodes(graph)` from `relkit/observability` lists these system routes for a route list.

History queries take four new filters that combine with the existing ones and with `search`: `status` (exact, `500`, or class, `5xx`), `method` (any case), `path` (prefix of the request path, starting with `/`) and `errorId` (the declared error identifier of a request, or `relkit.error.id` on a span). Status, method and path select request records. With `count: true` a page also carries `total`, the number of matching records across all pages; counting scans every match, so it is opt-in. Malformed values fail with `RELKIT_OBSERVABILITY_QUERY_INVALID`.
