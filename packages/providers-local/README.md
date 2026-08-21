# @zsys/providers-local

Local generations own `.zsys/state/buckets` and `.zsys/state/cache` (or the
configured state root). Bucket objects and cache snapshots use atomic commits;
malformed records are moved into a provider-owned `.zsys-quarantine` directory
and do not prevent the rest of the generation from starting.

The local cache remains bounded and generation-local. Direct construction
without `stateRoot` is memory-only; generation startup supplies a profile root,
enables restart recovery, and reports `persistence: "restart-recovery"`.
Canonical cache keys, deterministic clock expiry, LRU bounds, and the
metadata-only `onSnapshot` hook remain unchanged. Provider objects expose typed
bucket/cache operations only; application code does not receive file readers.

Durable job queue entries retain validated idempotency keys for their configured
retention. A duplicate enqueue returns the retained instance and acceptance
metadata; delivery remains at-least-once after the record expires or an
acknowledgement gap.

Ephemeral event delivery is memory-only and has no restart recovery. Each
trigger admits at most 100 simultaneous deliveries by default; the router can
configure the capacity, drops newest overflow, and reports the capacity/drop
policy instead of creating a hidden backlog or recovery claim.

Durable event delivery reuses the job store/queue/retry seams for one trigger
ledger. Accepted envelopes are available only after durable append, handler
success is acknowledged through a completed transition, expired leases recover
after restart, and retries become delayed or dead-lettered with safe failure
metadata. Delivery is at-least-once, exactly-once is false, and per-key
ordering is explicitly unsupported.

The local event admin contract is versioned and inspector-safe: queries expose
event contracts, selector expansions, publication metadata, delivery state,
dead letters, and honest capability flags without payload projection. Only a
validated local dead-letter retry is mutating; it is disabled in production and
records an audit action.

Agent tests use the `ai/test` `MockLanguageModelV3` surface with a finite script
of validated tool-call, final, error, or cancelled turns. Its recorded calls
make merge-blocking tests deterministic without model network calls.
