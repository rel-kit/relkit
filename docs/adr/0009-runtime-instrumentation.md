# RELKIT-ADR-009: Automatic runtime instrumentation

- Status: Accepted for implementation
- Date: 2026-09-03
- Specification: `openspec/changes/end-to-end-runtime-instrumentation`

## Decision

Use one invocation-owned ambient carrier and shared span lifecycle for automatic
runtime boundaries and `ctx.trace`. Keep portable W3C propagation in contracts
and Effect integration/collector wiring in runtime-effect. A server span owns
the runtime-observable response-body lifecycle; durable consumer attempts start
fresh traces linked to producers and never inherit request cancellation.

Replace telemetry with canonical model v2 and operation signals. Derive request
lifecycle from spans/events, use indexed execution queries and show live requests,
individual spans, attributes, separate events/logs and asynchronous continuations
in Inspector. Completed snapshots are authoritative and all recording is bounded.

Export completed spans and logs through the existing OTLP package. Sampling is
deterministic per trace, including errors; Collector tail sampling requires
`traceRate: 1`. Redact before every sink and isolate observer/export failures.

This is a clean breaking change: no legacy unions, adapters, endpoints or state
migration. Preserve existing state and report incompatibility explicitly so the
developer can choose fresh state. Do not introduce another backend, tracing
dependency, global fetch patch or in-process tail buffer.
