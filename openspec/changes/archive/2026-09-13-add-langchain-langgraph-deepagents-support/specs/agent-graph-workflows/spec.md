## Purpose

Defines typed RELKIT authoring and execution of native LangGraph workflows, including reusable function nodes, dynamic routing, parallelism, interruptions, and public results.

## ADDED Requirements

### Requirement: Graph control uses graph-specific nodes
RELKIT SHALL provide graph-node declarations for state updates, native commands, possible destinations, and typed human resume contracts without changing ordinary function handler contracts.

#### Scenario: Node pauses for boolean input
- **WHEN** a graph node declares a boolean resume schema and reaches a native interrupt
- **THEN** execution persists a waiting state that accepts only a boolean continuation

### Requirement: Functions expose handler-free graph-node views
A callable function SHALL expose a graph-node view that inherits its input, output, errors, dependencies, identity relationship, policies, tracing, and cancellation while delegating execution through the common engine.

#### Scenario: Reusable function becomes a node
- **WHEN** a function is exposed with a graph-local node ID
- **THEN** the graph executes the original function once and applies its validated object result as a partial state update

### Requirement: Registered nodes define typed topology
Graph declarations SHALL accept state, input, output, a unique registered-node list, and an edge builder whose string endpoints are restricted to those node IDs plus valid start/end sentinels.

#### Scenario: Unknown edge is authored
- **WHEN** an edge references a node absent from the registered list
- **THEN** type checking and compilation reject the graph

### Requirement: Native routing semantics are preserved
Graph execution SHALL preserve supported sequential edges, conditional edges, parallel joins, reducers, dynamic sends, commands, parent routing, loops, subgraphs, retries, and pending writes.

#### Scenario: Command updates and routes
- **WHEN** a node returns a command with a valid update and destination
- **THEN** native reducers apply the update and execution continues only through native scheduled routes

#### Scenario: Parallel branches join
- **WHEN** two start branches feed an array-form join edge
- **THEN** the joined node runs after both required updates are committed

### Requirement: Graph output is schema selected
The graph output schema SHALL select and validate the public final result independently from private native state and streamed-state projection.

#### Scenario: Private state exists at completion
- **WHEN** a graph completes with public and private channels
- **THEN** only schema-selected output is returned and only explicitly selected state is streamed publicly

### Requirement: Interrupt and command failures remain control flow
Native interruption and command values SHALL reach the native scheduler without being normalized as ordinary failures or serialized as HTTP function/tool output.

#### Scenario: Interrupted node resumes
- **WHEN** a valid continuation is submitted for the same thread and snapshot
- **THEN** the native node re-enters according to upstream semantics and its interrupt returns the validated reply

