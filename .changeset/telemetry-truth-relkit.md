---
"relkit": patch
---

A request whose client closes a streamed response it received (a realtime subscription, a server-sent event stream) is now recorded with the status that was sent, for example `200`, and the outcome `cancelled`; `499` is recorded only for a request cancelled before any response.

The local event provider no longer floods the logs of an idle application: its 100 ms delivery poll and its inspection query record no success log for their provider operations (failures still log, and a delivered event handler keeps the application's log policy). The poll no longer builds a full inspection snapshot, and one inspection query reads the delivery queue once instead of once per stored delivery: over 500 stored deliveries a query performs 9 provider operations instead of 4,011.

Without a configured telemetry exporter no export queue starts, so `exportCounters().exportFailures` stays at zero; it used to count the records an exporter-less queue rejected under load. With an exporter, `exportFailures` counts records an exporter failed to export and the new `exportCapacityRejections` counts records the full export queue rejected.
