## ADDED Requirements

### Requirement: End to end instrumentation evidence

Release evidence SHALL cover commerce middleware/database/cache/nested functions/event fan-out/job retry, agent/tools, outbound clients and deliberately paused live HTTP execution with explicit relationship assertions. The first invoice attempt SHALL observe a bucket failure then request retry through the declared-error mechanism.

#### Scenario: Browser follows execution

- **WHEN** acceptance runs against the real Inspector and Bun host
- **THEN** a developer can inspect active and terminal work, span metadata/logs, async retries, direct trace navigation, reconnect and missing/truncated state

### Requirement: Instrumentation verification gates

Verification SHALL cover concurrent async context, validation/admission, exactly-once completion, observer failures, streaming/bodyless/early-host paths, durable restart and malformed metadata, mocked AWS, indexed storage parity/limits/retention, OTLP/privacy/bundle safety and exporter outages. Strict OpenSpec, repository verify, restart/integration/security, generated-project and browser checks SHALL have recorded outcomes. HTTP/operation/query/heap performance SHALL be compared to baseline and median overhead above 5 percent or p95 above 10 percent investigated, not advertised as guarantees.

#### Scenario: Environment is unavailable

- **WHEN** an environment-dependent check cannot run
- **THEN** evidence explicitly records the unavailable check without claiming success or running unapproved paid cloud work
