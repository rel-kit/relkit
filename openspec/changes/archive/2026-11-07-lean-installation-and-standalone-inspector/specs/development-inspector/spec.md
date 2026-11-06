## MODIFIED Requirements

### Requirement: Versioned protected inspector APIs

An explicitly enabled development bridge SHALL provide authenticated live graph/descriptors, safe environment metadata, diagnostics, runtime projections, redacted collection and permitted actions. Historical requests/logs/traces SHALL be served by the standalone tool's store. Production SHALL register neither bridge nor rich inspection APIs, irrespective of legacy environment overrides.

#### Scenario: Local job retry is requested

- **WHEN** the development inspector calls the protected retry action for an eligible dead-letter job
- **THEN** the application's runtime/provider boundary validates mode, identity, authorization, operation ID and state before applying and recording the action

#### Scenario: Production control is unauthenticated

- **WHEN** an unauthenticated client calls a local control endpoint in production
- **THEN** the inspection endpoint is absent and no action occurs

### Requirement: Inspector is an API-only consumer

The standalone inspector SHALL consume versioned bridge APIs/streams and own its diagnostic history. It SHALL NOT scan application source, import handlers/live runtime objects, read provider files, resolve application environment values or construct application cloud/model clients. UI server code SHALL keep bridge credentials server-side.

#### Scenario: Inspector server bundle is scanned

- **WHEN** inspector imports and browser payloads are examined
- **THEN** they contain only tool-owned UI/protocol/history dependencies and no application handler, provider/model implementation or live runtime object; browser payloads contain no server credentials

### Requirement: Backend and support readiness are independent

Independently invoked inspector and persistent telemetry initialization, and optional bridge acquisition, SHALL remain outside backend activation readiness dependencies. Backend activation SHALL still require current environment validation, required provider health, worker registrations, and matching activation overrides. Invalid explicit bridge configuration SHALL fail validation; valid but slow, unavailable, or failed support startup SHALL produce bounded safe diagnostics and accurate independent status without stopping a healthy backend or bypassing required application initialization.

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

#### Scenario: Session bridge survives generation retirement
- **WHEN** a new validated generation activates and the old generation drains
- **THEN** session listener/credential/discovery identity remains stable, active-generation routing switches atomically and old cleanup cannot remove the session descriptor

## ADDED Requirements

### Requirement: Standalone inspection has independent distribution and lifetimes
The publishable @relkit/inspector SHALL own launcher, existing UI server, collector and storage workers as one scoped process tree. The private UI workspace SHALL have the distinct name @relkit/inspector-ui. CLI artifacts SHALL contain no inspector distribution, UI dependencies or store, including optional dependencies.

#### Scenario: Tool runs outside the repository
- **WHEN** a packed standalone tool is installed and invoked through relkit-inspector --project-root .
- **THEN** traced assets, declared runtimes, licenses and supported native dependencies resolve without checkout paths, and history is stored in the project rather than package-runner caches

#### Scenario: Tool and backend stop independently
- **WHEN** either process is stopped or the tool is uninstalled
- **THEN** the other retains its independent lifetime and ordinary backend development remains functional

### Requirement: Inspection launch choices are explicit
Enablement, tool installation and tool execution SHALL be separate actions. Launch-time project/connection/credential/target/history options SHALL be trusted operator inputs, not browser-editable settings. Explicit version-tested runner execution SHALL NOT modify application dependencies or store project history in runner caches.

#### Scenario: Browser requests a new target or file
- **WHEN** a UI request attempts to override a launch-time target, connection path, credential or history root
- **THEN** the request is rejected without reading arbitrary files or forwarding credentials

### Requirement: Bridge sessions own discovery across reloads
The development session SHALL own its listener, fresh session identity/credential and discovery descriptor. Successful candidate validation SHALL precede atomic active-generation switching. Rejected candidates SHALL preserve the prior active generation. A full session restart SHALL replace identity/credentials; prepared artifacts SHALL contain no reusable session secrets.

#### Scenario: Repeated successful and rejected reloads occur
- **WHEN** candidates alternate between valid and invalid states
- **THEN** only verified generations become active, the bridge has no duplicate listener, old in-flight records retain generation attribution and retired candidates cannot delete live discovery

#### Scenario: Validly configured bridge cannot bind
- **WHEN** bridge binding or later service operation fails
- **THEN** inspection reports unavailable with bounded recovery, backend readiness remains accurate and no UI/storage is launched as fallback

### Requirement: Private discovery is session specific and ownership safe
Descriptors under ignored .relkit/connections/ SHALL contain protocol/project/session identity, actual endpoint, process metadata, creation time and session authentication material only. Publication SHALL use owner-only permissions where supported, atomic replacement, containment/symlink checks and ownership-aware cleanup.

#### Scenario: Descriptor publication or cleanup races another session
- **WHEN** two sessions publish or an old session exits
- **THEN** neither overwrites nor deletes the other's descriptor and no arbitrary environment, provider/model secret, configuration or payload appears

#### Scenario: Symlink escapes the connection directory
- **WHEN** a connection path resolves outside permitted containment or to a foreign owned file
- **THEN** publication/cleanup rejects the path without altering its target

### Requirement: Discovery authenticates live identity and rejects ambiguity
Discovery SHALL read descriptors without executing configuration. A compatible live session SHALL be verified by authenticated project/session/protocol/capability handshake rather than PID existence. No-session rediscovery SHALL be bounded; multiple compatible sessions SHALL require explicit connection-file selection.

#### Scenario: Two live compatible sessions exist
- **WHEN** project discovery finds two valid sessions without explicit selection
- **THEN** the tool reports ambiguity and never silently chooses the newest

#### Scenario: Descriptor is stale incompatible or foreign
- **WHEN** its claimed identity does not authenticate or its project/protocol is incompatible
- **THEN** the tool rejects/reports it without reusing credentials or deleting foreign files

### Requirement: Every bridge operation is authenticated and constrained
Bridge operations SHALL enforce authentication, host/origin validation, body limits and state-changing-request protection. Credentials SHALL remain absent from URLs, browser bundles and ordinary logs. Non-loopback access SHALL require explicit network and credential configuration; storage and protocol versions SHALL be independent.

#### Scenario: Token origin or payload is invalid
- **WHEN** a request has missing/wrong credentials, a foreign origin/host, malformed payload or cross-project identity
- **THEN** it fails safely before data disclosure or mutation

#### Scenario: Agent capability is unavailable
- **WHEN** a connected app has no agent execution selected
- **THEN** the handshake/view exposes structured unavailability without importing agent SDKs into the bridge or UI tool

### Requirement: Inspector controls retain application authorization and mutation identity
Actions SHALL execute in the application's runtime/provider boundary with existing authorization, validation and operation-ID/idempotency behavior. Lost responses SHALL NOT cause blind mutation retry. Stale session/generation-bound control requests SHALL fail safely.

#### Scenario: Action response is lost during restart
- **WHEN** a mutation may have been accepted but its response is lost and the session changes
- **THEN** the tool exposes the original operation identity/unknown outcome and does not resubmit blindly or authorize the stale request against another session

### Requirement: Inspector Docker distribution is independent and restricted
A versioned inspector image SHALL include required runtimes, UI/native assets, non-root execution, signal cleanup and distinct listening/disconnected versus connected-ready health. It SHALL require only narrow read-only connection/secret directory mounts and an explicit persistent history volume, never app source/dependencies/environment or Docker socket.

#### Scenario: Application restarts while container stays running
- **WHEN** discovery files are atomically replaced and credentials rotate in the directory mount
- **THEN** the container rediscovers and authenticates the new session without relying on a bind mount pinned to the replaced file

#### Scenario: Documented host and network configurations run
- **WHEN** Docker Desktop host, Linux host-gateway and private-network examples execute
- **THEN** explicit reachable bridge bindings, target overrides, file credentials and network restrictions work, UI publication defaults to host loopback and project/session checks remain enforced

#### Scenario: Container is recreated
- **WHEN** the same project history volume is reattached
- **THEN** diagnostic history persists and signals clean up the tool process tree without stopping the backend

### Requirement: Standalone views preserve selected feature behavior
The existing graph, traces, logs, jobs, agents and supported actions SHALL remain functional for selected application capabilities, with useful unavailable/partial states otherwise. UI behavior SHALL retain existing accessibility, responsive presentation and API-only boundaries.

#### Scenario: Browser performs real inspection work
- **WHEN** browser acceptance navigates selected feature data, follows traces, invokes permitted actions and reconnects after interruption
- **THEN** observed results match the active/historical identity and no homepage-only result substitutes for feature acceptance
