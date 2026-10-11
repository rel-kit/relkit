## MODIFIED Requirements

### Requirement: Last-known-good candidate activation

The development supervisor SHALL obtain a fully validated candidate through compilation or a current integrity-checked development snapshot, start it, hash-check, version-check, and readiness-check it before activation. Any validation, compilation, startup, hash, API-version, or readiness failure SHALL leave the active generation serving traffic. Snapshot reuse SHALL consume one successful validation result without repeating the full check or bundling unchanged source. An actual safe generated application route SHALL be successfully probed before its generation is reported backend-ready; graph-serving readiness SHALL be used when examples are absent.

#### Scenario: Source change does not compile

- **WHEN** a developer saves invalid source while a valid generation is active
- **THEN** diagnostics update and the prior generation remains reachable on the stable development port

#### Scenario: Candidate is ready

- **WHEN** a candidate passes all verification
- **THEN** the supervisor atomically makes it active and emits a correlated generation-change event

#### Scenario: Prepared project is unchanged

- **WHEN** startup accepts a current valid snapshot
- **THEN** the supervisor verifies and activates its backend without another full source check, evaluator pass, or startup bundle

#### Scenario: Snapshot is unavailable or rejected

- **WHEN** the snapshot is missing, stale, corrupt, or incompatible
- **THEN** development follows full safe validation and activates only a successful current candidate, preserving the previous active generation on failure

#### Scenario: Candidate cannot serve its route

- **WHEN** a child binds a socket or reports a matching hash but its required route probe fails
- **THEN** the supervisor stops the failed candidate, preserves the previous active target, and emits no backend-ready claim for it

### Requirement: Inspector presents complete telemetry before export sampling

Request, log, trace, diagnostic, and generation views SHALL use redacted local retention independently of external sampling and SHALL separately display exporter selection, health, dropped-export counters, and sampling decisions. During persistence startup they SHALL disclose buffered state; dropped or unflushed early records SHALL be identified explicitly as incomplete history rather than complete persistence.

#### Scenario: Trace is not exported

- **WHEN** external sampling excludes a trace
- **THEN** its retained local timeline remains navigable and the view indicates only that external export was skipped

#### Scenario: Early history is incomplete

- **WHEN** delayed persistence causes bounded early retention to overflow or shutdown cannot finish its flush
- **THEN** the view reports safe loss counts and incomplete history instead of presenting an empty or complete timeline

## ADDED Requirements

### Requirement: Backend and support readiness are independent

Inspector and persistent telemetry initialization SHALL run outside the backend activation readiness dependency. Backend activation SHALL still require current environment validation, required provider health, worker registrations, and matching activation overrides. Slow, unavailable, or failed support startup SHALL produce bounded safe diagnostics and accurate independent status without stopping a healthy backend or bypassing required application initialization.

#### Scenario: Inspector and storage are delayed

- **WHEN** inspector readiness or telemetry store initialization is deliberately delayed past backend activation
- **THEN** the public backend route responds successfully while support status remains starting or unavailable

#### Scenario: Required service is unhealthy

- **WHEN** an application-required provider, database/auth initialization, or worker registration is not ready
- **THEN** application activation stays blocked even though optional support services are independent

#### Scenario: Healthy local services are prestarted

- **WHEN** declared local services are already healthy with matching ownership, plan, and protocol
- **THEN** the session adopts them safely without reprovisioning and backend startup remains subject to the readiness target

### Requirement: Prepared activation retains generation lifecycle ownership

Fast activation SHALL preserve the stable proxy, lifecycle states, cohort verification, latest-epoch switching, generation isolation, bounded drain, and last-known-good behavior. Cancellation and shutdown SHALL stop accepting new traffic, finalize owned watchers/readers/fibers, terminate and reap owned children, and bound support flush. Detached or user-owned services SHALL remain under their existing ownership policy.

#### Scenario: Edit races activation

- **WHEN** source changes after snapshot validation but before switching, or rapid newer candidates arrive
- **THEN** stale validation cannot authorize activation of a later source epoch and obsolete work cannot replace a newer accepted generation

#### Scenario: Child process fails

- **WHEN** a candidate exits before activation or reports a wrong generation/cohort
- **THEN** it is reaped, diagnostics identify the failure, and the previous generation continues serving without a false Ready message

#### Scenario: Command is cancelled during acquisition

- **WHEN** interruption occurs during preparation, startup, verification, or switching
- **THEN** all acquired resources settle within their cleanup bounds and traffic is never switched to an unverified generation

#### Scenario: Shutdown overlaps streaming and support startup

- **WHEN** shutdown occurs with an in-flight response, pending inspector startup, and buffered telemetry
- **THEN** existing bounded drain applies, support children are reaped, telemetry flush is bounded, loss is reported safely, and no owned process or watcher is stranded
