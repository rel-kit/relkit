## Purpose

Provides one searchable, generated, executable source of truth that teaches developers how to create, use, inspect, test, and operate every public RELKIT capability.

## ADDED Requirements

### Requirement: Searchable documentation application

RELKIT SHALL provide a buildable documentation application with keyboard-accessible search across conceptual guides, generated API reference, CLI reference, migration guidance, and troubleshooting content.

#### Scenario: Developer searches for route uploads

- **WHEN** a developer searches the documentation for upload or multipart behavior
- **THEN** results link to the route guide, schema/API reference, and an executable example covering limits and validation

### Requirement: Complete task-oriented guides

Documentation SHALL cover project creation, application/configuration, every public descriptor and runtime feature, all HTTP methods and segment/input forms, middleware, rate limiting, events/jobs, resources, tools/agents, CLI commands, local development, testing, observability, deployment, and troubleshooting without describing planned behavior as implemented.

#### Scenario: Developer follows a feature guide

- **WHEN** a developer follows any documented public feature from a clean generated project
- **THEN** the imports, types, commands, runtime behavior, failure modes, and verification steps match the released implementation

### Requirement: Generated public API reference

Application-facing exports SHALL produce deterministic API reference pages from rich TypeScript documentation containing descriptions, categories, version metadata, examples, links, and important constraints; internal and generated implementation exports SHALL be excluded.

#### Scenario: Public export lacks documentation

- **WHEN** an application-facing export lacks required description, category, version, or executable example metadata
- **THEN** documentation verification identifies the export and fails

### Requirement: CLI reference shares command metadata

The CLI reference SHALL be generated from the same command tree that renders terminal help, including nested commands, flags, defaults, examples, environment variables, exit behavior, and machine-output guarantees.

#### Scenario: CLI option changes

- **WHEN** an option is added, removed, or renamed in the command tree
- **THEN** regenerated CLI pages and help output change together and stale reference output is rejected

### Requirement: Executable canonical examples

Documentation SHALL point to a canonical commerce workspace example that exercises every public feature, and critical snippets SHALL be type-checked or executed rather than maintained as unverified copies.

#### Scenario: Example behavior drifts

- **WHEN** an API change breaks a documented snippet or canonical example flow
- **THEN** the owning example/documentation check fails before release

### Requirement: AI-readable documentation output

The documentation build SHALL expose concise and full plain-text indexes generated from the same released sources without secrets, internal implementation details, or conflicting API descriptions.

#### Scenario: AI-readable index is requested

- **WHEN** a client loads `/llms.txt` or `/llms-full.txt`
- **THEN** it receives current navigable public documentation derived from the same source as the site
