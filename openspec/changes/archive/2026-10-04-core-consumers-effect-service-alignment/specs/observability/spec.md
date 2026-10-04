## ADDED Requirements

### Requirement: Core consumer and development support operations are independently observable

Independently callable domain operations in the client, Inspector API, development supervisor, and testing support SHALL emit execution counts, terminal outcomes, monotonic durations, applicable workload measurements, and meaningful structured logs through their owning runtime's telemetry context. Outcomes SHALL distinguish success, expected failure, unexpected defect, and interruption. Labels SHALL use bounded domain, operation, outcome, and workload sets. Compatibility adapters SHALL NOT duplicate the owning operation's measurements. Constructing an unexecuted operation SHALL NOT emit execution telemetry.

#### Scenario: Standalone operation uses supplied telemetry

- **WHEN** a consumer invokes a domain operation outside a larger framework workflow with a supplied logger, tracer, and metric registry
- **THEN** the operation emits its own correlated execution telemetry through those supplied facilities

#### Scenario: A compatibility adapter invokes an operation

- **WHEN** an existing Promise, iterator, HTTP, React, or synchronous adapter executes an owning domain operation
- **THEN** the operation is counted once and nested distinct operations retain their own bounded attribution

#### Scenario: Observation ends before its source work

- **WHEN** a stream consumer closes an iterator or a subscription is interrupted
- **THEN** observation telemetry completes once with the appropriate outcome after its owned cleanup, without reporting the independently owned underlying job or agent run as cancelled

#### Scenario: Execution fails or telemetry delivery fails

- **WHEN** a domain operation fails, defects, or is interrupted, including while a telemetry sink fails
- **THEN** telemetry preserves the original operation result or cause and does not turn an exhausted failure into success or replace it with a telemetry error

### Requirement: Core operation logs respect runtime configuration and privacy

Core consumer and development support operations SHALL emit important lifecycle and outcome events at enabled operational levels, recovery events at warning level, and unrecovered failures at the owning error boundary. Noisy details SHALL respect debug filtering. Runtime-owned sinks and minimum-level configuration SHALL remain authoritative. Child work SHALL inherit correlation and logging context; child-specific level overrides SHALL leave parent and sibling levels unchanged. Payloads, credentials, cookies, raw URLs, persisted client keys, and dynamic identities SHALL NOT become automatic metric dimensions or unredacted log content. Telemetry reads SHALL NOT recursively amplify their own live event stream or leak server-only dependencies into browser consumers.

#### Scenario: Runtime uses its normal log threshold

- **WHEN** a standalone operation completes or recovers under the application's configured non-debug logging threshold
- **THEN** relevant enabled lifecycle, outcome, and recovery records reach the actual configured sink with safe operation context

#### Scenario: Child workflow changes its threshold

- **WHEN** a child workflow overrides its logging threshold while a parent and sibling continue
- **THEN** only the child's filtering changes and inherited annotations remain available to all three workflows

#### Scenario: Inspector observes its own telemetry

- **WHEN** an Inspector telemetry query or live subscription emits operation diagnostics
- **THEN** the query and stream remain bounded without repeated self-generated updates causing recursive diagnostic traffic

#### Scenario: Sensitive input reaches a browser client operation

- **WHEN** a browser client operation uses authorization, tenant, session, or request input
- **THEN** its configured telemetry exposes only safe bounded metadata, preserves browser-compatible execution, and does not install a server logger or transport
