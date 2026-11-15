---
"relkit": patch
"@relkit/cli": patch
---

The local event provider exposes `retry`, `cancel` and `replay`, so the Inspector's event actions
work in development: `retry(deliveryId)` runs a dead-lettered delivery again, `cancel(deliveryId)`
cancels a pending or scheduled one (it becomes a dead letter whose failure outcome is
`cancelled`), and `replay(publicationId)` delivers the stored publication again to its triggers as
a new delivery of the same publication (same instance id and payload), which the reaction sees
with the source `event-replay`; nothing is published anew. Its `query` reports `total` and
per-state `counts` for the filter, read from the same snapshot, and the generated runtime's events
page sums them across event profiles.
