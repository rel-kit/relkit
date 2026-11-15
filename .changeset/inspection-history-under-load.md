---
"relkit": patch
---

Fixed: with the Inspector attached, a burst of requests no longer loses requests from history or
leaves them "in progress". The application sends the Inspector one revision per finished span
instead of one per attribute or event (a request now leaves 4 to 17 records instead of 15 to 74),
and the development inspection buffer holds 8,192 records and 8 MiB instead of 2,048 and 2 MiB.
When the buffer is full it gives up whole records of the lowest value first (framework success
logs, other logs, unfinished span revisions, then other records), and a request's completed record
last, so a request whose start was kept always keeps its end. The buffer's status counts what it
gave up by kind in `droppedByKind`.

Changed (decision D15): the framework's own success logs (`Execution operation completed`) are no
longer sent to the Inspector, so its Logs page opens on the request line, failures and the
application's own logs. The span of each operation still carries its outcome and duration, and the
local store, exporters and JSON log sink still receive these logs. Pass
`remote: { ..., frameworkSuccessLogs: true }` to `createObservabilityRuntime` to send them again.
