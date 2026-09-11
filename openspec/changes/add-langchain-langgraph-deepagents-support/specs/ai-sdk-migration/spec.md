## Purpose

Defines the compatibility and migration boundary for replacing RELKIT’s AI SDK execution and UI protocol surfaces with native LangChain, LangGraph, DeepAgents, and AG-UI behavior.

## ADDED Requirements

### Requirement: New builds contain no AI SDK runtime path
RELKIT packages, integrations, generated applications, examples, and templates SHALL use the native runtime and SHALL NOT ship AI SDK model adapters, tool-loop execution, UI framing, or AI SDK frontend dependencies.

#### Scenario: Published artifacts are scanned
- **WHEN** release packages and generated applications are inspected
- **THEN** no active AI SDK runtime, adapter, protocol endpoint, or dependency remains

### Requirement: Native AG-UI framing replaces the legacy UI endpoint
RELKIT SHALL emit valid AG-UI objects through its agent endpoint and SHALL remove the legacy AI SDK UI stream endpoint and terminal framing rather than redirecting incompatible protocols.

#### Scenario: External AG-UI client observes a run
- **WHEN** a standards-compatible client decodes RELKIT SSE
- **THEN** it receives valid lifecycle, message, tool, state, and interruption events without AI SDK framing

### Requirement: Historical runs remain read-only
Historical AI SDK journal records SHALL remain safely inspectable when compatible with retained schemas but SHALL NOT be presented as native resumable checkpoints.

#### Scenario: Historical interrupted run is opened
- **WHEN** Inspector loads an old AI SDK run without a native checkpoint
- **THEN** it labels the run read-only and does not offer native resume controls

### Requirement: Contract versions negotiate native capabilities
Generated contract, graph, manifest, and stream capability versions SHALL change so incompatible clients or runtimes fail explicitly rather than silently misreading native state or continuation events.

#### Scenario: Old client connects
- **WHEN** a client lacks required native stream capabilities
- **THEN** connection fails with a compatibility diagnostic and does not downgrade authentication or event semantics

### Requirement: Migration examples are executable
Commerce, generated agent/fullstack templates, and documentation examples SHALL demonstrate native models, tools, middleware, graphs, persistence, thread IDs, typed state, continuation, SSE, WebSocket, and Inspector usage.

#### Scenario: Generated project acceptance runs
- **WHEN** each supported template is generated and tested locally
- **THEN** it installs, type-checks, builds, starts, streams its examples, and exposes the expected Inspector contracts without paid services

