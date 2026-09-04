## ADDED Requirements

### Requirement: Live request execution inspection

Inspector SHALL support request to trace to selected-span navigation while execution is active and afterward. Waterfalls SHALL show nesting, timestamp offsets, durations and parallel branches; instantaneous events SHALL appear distinct from timed spans. HTTP outcome SHALL be separate from child-operation outcome and middleware duration labeled inclusive.

#### Scenario: Developer opens paused HTTP request

- **WHEN** a request is paused during execution
- **THEN** Inspector shows HTTP arrival and active work immediately, then updates through response completion, failure, timeout, cancellation or explicit incomplete/abandoned state without losing prior steps

### Requirement: Complete selected span panel

A selected span SHALL show identity, name/kind, parent, times, duration, status/outcome, captured redacted attributes, resource attributes, events, links, correlated logs and safe errors. Logs and events SHALL remain separate. Missing/truncated/dropped data SHALL be explicit; source links SHALL resolve only against matching generation/graph data or show source unavailable.

#### Scenario: Span selection survives refresh

- **WHEN** a relevant trace/origin update arrives or the browser reconnects
- **THEN** selected identity is preserved, current details reload without duplicates, and unrelated updates do not trigger refresh

### Requirement: Independent trace and continuation browsing

Trace browsing SHALL remain available without an HTTP request, including schedules, standalone invocations, event deliveries and job attempts. Producer/consumer links SHALL navigate separately displayed asynchronous continuations, fan-out, retry attempts and work active after HTTP completion, using accessible labels/icons rather than color alone.

#### Scenario: Request enqueues retrying work

- **WHEN** HTTP completes and a job fails then retries
- **THEN** both attempt traces are navigable from the request without extending the HTTP duration
