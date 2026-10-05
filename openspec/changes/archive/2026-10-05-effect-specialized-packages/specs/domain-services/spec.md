## ADDED Requirements

### Requirement: Specialized runtime dependencies are substitutable

Database and authentication runtime operations SHALL support deterministic dependency substitution within the owning application lifetime. Existing synchronous authoring, Promise compatibility APIs, schema inference, model overrides, transaction-bound models, native auth session types, and route contracts SHALL remain compatible. Compilation SHALL NOT acquire database clients or construct live authentication instances.

#### Scenario: Deterministic dependencies replace production dependencies

- **WHEN** a test supplies database and authentication implementations at their runtime composition boundary
- **THEN** the same operation contracts execute with those implementations without acquiring hidden production dependencies

#### Scenario: Existing authored declarations compile

- **WHEN** an existing supported database/auth declaration is compiled without starting the application
- **THEN** its public types and normalized graph remain compatible and no client factory or auth factory is executed

### Requirement: Specialized activation has explicit ownership

Shared activation SHALL deduplicate acquisition within its existing owner, isolated activation SHALL remain independent, and failed acquisition SHALL permit a later attempt. Auth SHALL borrow its database without disposing it. Closing a database owner SHALL release owned resources once after admitted work has safely finished or been cancelled; shutdown and interruption SHALL NOT leave coordination permits stranded or permit resources to escape a closed owner.

#### Scenario: Concurrent shared activation fails then recovers

- **WHEN** concurrent callers share an acquisition that fails and a later caller retries
- **THEN** the first callers observe the failure, the failed acquisition is not retained indefinitely, and the later caller can acquire a healthy instance

#### Scenario: Isolated auth activation is used

- **WHEN** a runtime requests isolated auth activation
- **THEN** it receives an independent native auth instance without replacing the shared descriptor handler or closing the database it borrows

#### Scenario: Owner closes during an uncancellable native call

- **WHEN** shutdown begins while an admitted native database call cannot be cancelled
- **THEN** resource release and admission of conflicting work wait for a safe completion boundary, and the implementation does not claim that interruption cancelled the native call

### Requirement: Transaction failures preserve coordination and causes

Transactions SHALL preserve database and dialect semantics, serialize conflicting work at the actual client boundary, release coordination after acquisition, callback, commit, rollback, or interruption failure, and retain meaningful primary and cleanup failure information. Non-idempotent transactions SHALL NOT be retried automatically.

#### Scenario: SQLite begin fails

- **WHEN** SQLite rejects transaction begin
- **THEN** the failure reaches the caller and a later transaction can acquire coordination rather than waiting forever

#### Scenario: Rollback also fails

- **WHEN** a transaction callback fails and rollback fails during cleanup
- **THEN** the callback failure remains diagnosable together with the cleanup failure and the coordinator does not remain locked

#### Scenario: Transaction models execute

- **WHEN** a custom model operation executes inside a transaction
- **THEN** it receives the transaction-bound database and retains existing argument, return, and override behavior

### Requirement: Specialized operations are independently observable

Independently callable database and authentication operations SHALL emit correlated operation outcomes, durations, applicable workload metrics, and structured lifecycle/failure logs through the configured application instrumentation. Instrumentation SHALL distinguish success, typed failure, defects, and interruption, use bounded metric labels, avoid duplicate compatibility-wrapper counting, respect log-level configuration, and exclude credentials, cookies, tokens, query values, and sensitive rows.

#### Scenario: Standalone operation fails

- **WHEN** an operation executes outside a larger enclosing workflow and fails
- **THEN** its configured diagnostics record the operation and failure outcome without exposing sensitive inputs or changing its failure semantics

#### Scenario: Child log threshold is overridden

- **WHEN** an owned child workflow uses a local log threshold override
- **THEN** it retains inherited correlation context while the parent and sibling thresholds remain unchanged

#### Scenario: Compatibility adapter calls an operation

- **WHEN** a public Promise adapter invokes an instrumented service operation
- **THEN** each operation is counted once and the adapter preserves its public error and return contract
