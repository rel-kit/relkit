## ADDED Requirements

### Requirement: Observability binding is independent

Observability SHALL resolve through its own capability binding and SHALL receive no bucket, cache, job, event, model, or hosting credentials. An observability binding failure SHALL affect readiness only when that binding is graph-required by policy.

#### Scenario: External OTLP fails

- **WHEN** an external observability endpoint is required but unavailable
- **THEN** runtime reports the observability binding failure without constructing clients with unrelated provider credentials
