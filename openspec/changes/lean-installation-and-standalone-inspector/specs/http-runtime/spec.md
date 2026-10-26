## MODIFIED Requirements

### Requirement: Versioned internal endpoints

Core liveness/readiness and activation probes SHALL remain independently owned under their established versioned application transport. Client identity, public jobs, streaming, realtime and typed RPC SHALL remain available without inspection. Rich graph/resource/diagnostic inspection and administrative APIs SHALL require the optional development bridge; historical queries SHALL belong to the tool. Production SHALL exclude rich inspection regardless of legacy environment overrides.

#### Scenario: Readiness is queried during startup

- **WHEN** required providers or registrations are not ready
- **THEN** liveness can succeed while readiness reports non-ready without exposing secrets

#### Scenario: Production protection is absent

- **WHEN** a production configuration would expose unprotected core internal endpoints
- **THEN** startup or deployment validation rejects the configuration

#### Scenario: No-example application disables inspection
- **WHEN** development verifies a generation without a sample route or inspector bridge
- **THEN** core serving proof still verifies live graph, generation, route-table and activation identity, and client identity/jobs/RPC remain functional

### Requirement: Runtime OpenAPI and API reference

OpenAPI generation SHALL remain independent of an interactive documentation UI. The backend SHALL serve its active deterministic document under the existing protected documentation contract; interactive Scalar reference SHALL be explicitly selected with validated dependencies before readiness. Production documentation SHALL require explicit protected opt-in independently of inspection.

#### Scenario: Developer opens the API reference

- **WHEN** a valid development generation with explicitly selected API reference is active
- **THEN** the reference renders the same OpenAPI contract enforced by that generation

#### Scenario: Production opt-in lacks protection

- **WHEN** production enables API documentation without internal-endpoint authorization
- **THEN** startup or deployment validation rejects the configuration

### Requirement: Application traffic follows complete readiness

Liveness SHALL remain available during startup. Readiness and non-internal application traffic SHALL remain unavailable until environment, selected dependency requirements, required providers and registrations, and selected Drizzle/Better Auth capabilities complete activation. Optional inspection and history failures SHALL NOT block an otherwise healthy application.

#### Scenario: Request arrives during auth startup
- **WHEN** an application request arrives before Better Auth activation completes
- **THEN** the runtime returns a not-ready response rather than invoking a raw or function route

### Requirement: Deferred loading has generation-specific ownership

Concurrent first requests for a deferred implementation SHALL share one per-generation initialization. Shared executable modules SHALL retain one identity. Loading SHALL use verified immutable generation inputs and SHALL remain cancellable within generation shutdown. Failed loading SHALL produce the existing safe failure response and correlated diagnostic without a fabricated successful route response or duplicate side effects.

#### Scenario: Concurrent requests first reach one route

- **WHEN** multiple requests need the same unmaterialized implementation
- **THEN** it initializes once for that generation and each request preserves its own execution context and cancellation

#### Scenario: Deferred implementation fails

- **WHEN** import, integrity verification, or initialization fails
- **THEN** requests receive a safe error, the failure is correlated, and other loaded routes remain available

#### Scenario: Generation retires during loading

- **WHEN** a generation is replaced or shut down while an implementation load is pending
- **THEN** the load remains owned by that generation, pending work is finalized within the drain bound, and its result cannot enter the replacement generation

#### Scenario: Typed RPC is the only optional transport selected
- **WHEN** concurrent requests initialize typed RPC without MCP, AG-UI, Scalar or agents installed
- **THEN** only selected implementation loading occurs, initialization is single-flight per generation, request contexts stay isolated and retired generations join disposal

## ADDED Requirements

### Requirement: Optional HTTP features are validated independently
MCP, AG-UI and interactive documentation SHALL be isolated optional entrypoints with selected dependency requirements. Ordinary REST/RPC SHALL retain Hono and essential oRPC behavior without those SDKs. Selected feature failures SHALL be diagnosed before readiness rather than first business use.

#### Scenario: Each optional feature is selected separately
- **WHEN** MCP, AG-UI or Scalar is selected with its peer absent, incompatible or failing initialization
- **THEN** startup reports the correct selected requirement or original failure without requiring unrelated optional transports

### Requirement: Transport isolation preserves request protections
Moving inspection and selecting transports SHALL preserve authentication, origin/body limits, rate limits, middleware order, cancellation and exactly-once request logging. Existing jobs identity, authorization and operation-ID semantics SHALL remain on their application/provider boundary.

#### Scenario: Inspection is absent during jobs and RPC requests
- **WHEN** allowed and denied real HTTP requests reach jobs, client identity, realtime and RPC
- **THEN** the same authorization and request policies apply, successful operations retain their IDs, and no duplicate log or initialization side effect occurs
