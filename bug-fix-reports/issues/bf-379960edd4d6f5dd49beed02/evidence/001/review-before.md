# Review baseline

The pre-fix review identified eight actionable regressions in the uncommitted
readiness work:

1. Prepared manifests removed route targets needed for runtime descriptor
   semantics.
2. Generated aliases were matched by substring, so overlapping aliases could
   cancel preparation.
3. Deferred chunks were mutable after candidate verification.
4. Capability certification did not validate package-catalog identity or the
   recorded 20-attempt readiness evidence.
5. Packed restart warmup was excluded from the readiness result.
6. The early telemetry buffer retained stale bounds and redaction policy after
   storage handoff.
7. Telemetry storage acquisition could wait forever after a failed handoff.
8. Pending relay queries and live subscriptions omitted buffered records.

This baseline came from changed-line review rather than an executable pre-fix
snapshot, so it is retained as review evidence and is not represented as a
failed test command.
