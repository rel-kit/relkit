## ADDED Requirements

### Requirement: Inspector visualizes workflow topology

Inspector SHALL expose graph definitions as a first-class `Graphs` destination in the main sidebar, separate from agent chat and from the application dependency graph. Each selected graph SHALL display explicit start/end, registered nodes, conditional and dynamic routes, parallel branches and joins, loops, and subgraphs using deterministic stable layout.

#### Scenario: Parallel conditional graph is opened

- **WHEN** a graph contains parallel branches, a join, and command destinations
- **THEN** a top-to-bottom canvas starts at `START`, ends at `END`, and the accessible relationship fallback makes all possible routes and synchronization visible without executing predicates or models

#### Scenario: Graph catalog is opened

- **WHEN** the user selects `Graphs` in the main sidebar
- **THEN** Inspector lists only `defineGraph` definitions and opens their node topology without routing through an agent detail or chat page

### Requirement: Definitions and execution instances remain distinct

Inspector SHALL distinguish static workflow definitions from live and historical node/task attempts, preserving retries, loops, graph revisions, nested scopes, and observed dynamic transitions.

#### Scenario: Node retries

- **WHEN** one node has multiple attempts
- **THEN** Inspector retains each attempt and does not overwrite history on the node definition

### Requirement: Inspector renders selected public state and human input

Inspector SHALL show authorized selected state on its owning execution and render waiting-input forms from the persisted response schema using the same typed continuation operation as generated clients.

#### Scenario: Todo agent pauses

- **WHEN** a todo-enabled agent reaches a boolean human-input pause
- **THEN** its current todo list remains visible and the form submits a boolean reply to the same thread

### Requirement: Inspector chat uses reusable presentation components

Inspector SHALL use transport-independent shadcn chat presentation while retaining RELKIT as the sole execution, state, transport, persistence, and authorization owner.

#### Scenario: Assistant response streams

- **WHEN** a response arrives incrementally
- **THEN** the transcript, scrolling behavior, Markdown, tools, todo state, and activity panels update without an AI SDK or CopilotKit runtime

### Requirement: Workflow inspection is accessible and responsive

Workflow search, pan/zoom controls, minimap, expand/collapse, node details, chat, todo state, tool activity, and human-input forms SHALL expose semantic labels, visible focus, keyboard operation, reduced-motion behavior, and responsive layout.

#### Scenario: Graph and chat are used by keyboard

- **WHEN** a user explores a workflow and resumes an interruption without a pointer
- **THEN** topology, current status, input validation, submission, and focus remain understandable and operable
