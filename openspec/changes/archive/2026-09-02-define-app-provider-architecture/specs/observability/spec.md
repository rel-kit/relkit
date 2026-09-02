## ADDED Requirements

### Requirement: Inspector persistence precedes external sampling

Every admitted telemetry record SHALL pass capture policy and redaction before bounded Inspector persistence and live streaming; external trace sampling SHALL occur afterward, be decided once at the root, and be inherited by child spans. Errors and diagnostics SHALL remain unsampled by default.

#### Scenario: Trace is excluded from external export

- **WHEN** the root sampling decision excludes a successful trace
- **THEN** its complete redacted local request, log, span, and diagnostic timeline remains queryable and live in Inspector

### Requirement: Exporters fan out independently

An application SHALL configure zero or more statically loaded telemetry exporters, including Sentry and OTLP concurrently; exporter failure, backpressure, or bounded queue overflow SHALL not fail application work, block another exporter, or delete the canonical local record.

#### Scenario: OTLP exporter fails

- **WHEN** OTLP export fails while Sentry is healthy
- **THEN** Sentry continues, application work completes, and a redacted local-only diagnostic appears in Inspector without recursively entering OTLP

### Requirement: Export buffering has one owner

Sentry SHALL delegate buffering and bounded flush to its SDK integration, while OTLP SHALL use one bounded RelKit export queue with deterministic overflow and shutdown behavior.

#### Scenario: Runtime shuts down with queued export work

- **WHEN** the bounded flush deadline expires
- **THEN** shutdown reports safe dropped-export counters and completes without delaying application drain indefinitely

### Requirement: CloudWatch Logs is host routing

CloudWatch Logs SHALL NOT be an application telemetry exporter; an AWS host SHALL route the redacted structured production stdout sink through its logging configuration without duplicating it through an in-process CloudWatch client.

#### Scenario: AWS application emits a structured log

- **WHEN** the production host is configured for CloudWatch Logs
- **THEN** the redacted stdout record is routed by the host and no CloudWatch exporter integration is loaded

## REMOVED Requirements

### Requirement: Observability binding is independent

**Reason**: A single observability provider binding is replaced by mandatory local Inspector storage plus zero or more independent exporter integrations.

**Migration**: Configure telemetry capture/redaction/local retention and an exporters map; move CloudWatch behavior to AWS host logging.

#### Scenario: Legacy observability binding is declared

- **WHEN** application configuration uses a provider binding for OTLP or CloudWatch
- **THEN** the old configuration is rejected and no exporter is inferred

