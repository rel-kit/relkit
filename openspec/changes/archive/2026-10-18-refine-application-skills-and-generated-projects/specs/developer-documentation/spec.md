# Spec Delta

## ADDED Requirements

### Requirement: Application skills adapt to task intent

Application skills SHALL infer feature, bug, discussion, and mixed requests from context and extend the existing verification workflow. Explicit implementation requests SHALL authorize work after a short plan; further questions SHALL be limited to unresolved decisions materially affecting scope, security, cost, or destructive actions.

#### Scenario: Feature implementation is requested

- **WHEN** a user requests a new feature
- **THEN** the agent establishes the problem, scope, expected behavior, and acceptance criteria, resolves material missing decisions, and presents a short implementation and verification plan before editing
- **AND** it proceeds within the requested scope without a repetitive approval prompt

#### Scenario: A bug is reported

- **WHEN** a user requests a bug fix
- **THEN** the agent establishes expected versus actual behavior, attempts reproduction where possible, traces the affected execution path, distinguishes confirmed causes from hypotheses, and explains the fix and verification approach before editing
- **AND** an unavailable reproduction is reported as a limitation rather than presented as confirmed evidence

#### Scenario: Discussion is requested

- **WHEN** a user asks to discuss an approach without requesting implementation
- **THEN** the agent explains options, tradeoffs, and a recommendation without changing files

#### Scenario: A request combines discussion and implementation

- **WHEN** a request mixes task types
- **THEN** the agent separates the requested work and applies the relevant behavior to each part without requiring the user to classify it

### Requirement: Application onboarding resolves only missing decisions

Before scaffolding a new application, application skills SHALL establish the database engine and driver or an explicit no-database choice, and whether authentication is required. They SHALL ask unanswered choices together and reuse decisions already supplied or established in the project.

#### Scenario: Database and authentication are unspecified

- **WHEN** a new application request leaves both choices unresolved
- **THEN** the agent asks for database engine/driver or no database and authentication needs together before scaffolding

#### Scenario: Decisions are already known

- **WHEN** a user has specified the database and authentication choices or a project already establishes them
- **THEN** the agent reuses those choices without repeating onboarding questions

#### Scenario: A small change does not require onboarding

- **WHEN** the request is an unrelated bug fix or a small change in an established application
- **THEN** the agent does not restart database/authentication onboarding

#### Scenario: Authentication conflicts with the no-database choice

- **WHEN** the user requests no database and an authentication capability whose supported implementation needs persistence
- **THEN** the agent explains the conflict and resolves that choice before writing files, rather than silently adding a database or inventing unsupported auth behavior

#### Scenario: Agent onboarding uses existing CLI options

- **WHEN** the agent has established database and authentication choices for a new application
- **THEN** it uses supported create/add commands without inventing database/auth creation flags or changing the CLI's documented headless defaults

### Requirement: Optional modules require intentional selection

Application skills SHALL recommend only task-relevant optional modules, explain their benefit, and resolve necessary provider/configuration choices against the installed RELKIT version. They SHALL NOT silently add optional infrastructure or seek duplicate permission for capabilities the user explicitly requested.

#### Scenario: A useful optional capability is discovered

- **WHEN** realtime, agents, streaming, buckets, caching, events, or jobs would benefit the requested feature but were not requested
- **THEN** the agent briefly explains the concrete benefit and asks whether to include the relevant capability before expanding scope

#### Scenario: The capability was explicitly requested

- **WHEN** the user has requested order-status realtime updates
- **THEN** the agent resolves only missing provider/configuration decisions and verifies supported installed APIs without asking again whether realtime should be included

#### Scenario: A requested option is unavailable in the installed version

- **WHEN** the installed CLI or declarations do not support the selected module/provider option
- **THEN** the agent explains the limitation and supported alternatives before editing and does not invent an API or silently install different infrastructure

### Requirement: Application guidance defaults to backend resource contracts

Application guidance SHALL default to backend-only work and resource-specific endpoints with explicit contracts, validation, and applicable authorization. It SHALL preserve explicitly requested frontend functionality, intentional protocol handlers, service ownership, and route adapter placement.

#### Scenario: Backend resources are requested

- **WHEN** the user requests users and orders backend operations
- **THEN** the agent creates distinct resource endpoints instead of a public table dispatcher selected by an entity parameter
- **AND** it creates no unsolicited app.js, assets.css, frontend pages, demo interfaces, or frontend scaffolding

#### Scenario: Resource contracts are verified

- **WHEN** the agent exposes users and orders operations requiring authenticated access
- **THEN** acceptance checks each route's valid and invalid input behavior plus denied and allowed access, instead of treating distinct path names or auth-handler presence alone as sufficient

#### Scenario: Internal services and protocol handlers exist

- **WHEN** an application contains database tables, infrastructure-only services, or the authentication protocol handler
- **THEN** guidance does not require exposing every table or service and preserves the intentional auth handler
- **AND** shared internal implementation remains permitted without generic public table dispatch

#### Scenario: Frontend work is explicitly selected

- **WHEN** the user requests frontend work, selects fullstack functionality, or has existing frontend files
- **THEN** guidance respects the requested functionality and does not delete existing frontend work or disable it to enforce backend defaults

#### Scenario: Service and route files are authored

- **WHEN** the agent implements application behavior
- **THEN** service implementation stays beneath its owning service, new grouped projects use src/services/<name>, route adapters stay under src/routes, and the agent follows the current application layout

### Requirement: Migration guidance distinguishes history from machinery

Application guidance SHALL identify SQL migrations and required metadata as versioned application source owned by the database service, with one ordered history for a shared database. It SHALL teach the implemented generation and migration commands, explicit configuration, and RELKIT-owned execution without claiming scaffolding applies migrations.

#### Scenario: A database application is prepared

- **WHEN** a developer follows database or auth guidance
- **THEN** it places migration history alongside the owning database service, keeps that history outside ignored .relkit output, and explains environment setup, generation, review, and explicit application of migrations
- **AND** it does not split the shared database history across business services or copy reusable runner code into the application

### Requirement: Application completion is supported by behavior evidence

Application skills SHALL require focused verification after logical changes and complete affected-behavior verification before completion. Reports SHALL state what changed, what was verified and how, and failed, skipped, or blocked checks. A direct function test alone SHALL NOT establish HTTP-route or complete-flow correctness.

#### Scenario: HTTP bug verification completes

- **WHEN** a route bug is fixed
- **THEN** the agent reviews the diff, runs applicable checks, typechecking, build, unit/integration and existing relevant end-to-end tests, and replays the original failure through the HTTP route
- **AND** it reports any unavailable check or reproduction honestly

#### Scenario: Backend end-to-end coverage is needed

- **WHEN** a backend feature needs flow-level verification
- **THEN** the agent exercises backend/API behavior without creating an unsolicited frontend merely for testing

#### Scenario: Only partial checks pass

- **WHEN** code is written or unit tests pass but required runtime verification is blocked
- **THEN** the completion report identifies the remaining verification and does not claim fully verified delivery

### Requirement: Experimental development boundaries are explicit

Root contributor guidance SHALL state that RELKIT is experimental, interfaces are subject to change, and current consumers are repository samples. This change SHALL update samples directly without introducing legacy upgrade commands or compatibility layers, while preserving sample data and applied migration history.

#### Scenario: Sample migration paths change

- **WHEN** this change updates a repository sample's migration layout
- **THEN** the sample and its guidance are updated directly without resetting its database, changing applied migration identifiers, or building a legacy upgrade mechanism

### Requirement: Distributed application workflow guidance stays synchronized

Affected repository-owned skill entrypoints, references, examples, template copies, and packaged guidance SHALL describe the same task workflow and implemented commands. Verification SHALL cover both distributed content and representative behavior scenarios; global and third-party skills SHALL NOT be implicitly modified.

#### Scenario: A packed template ships application guidance

- **WHEN** a maintained template is packaged
- **THEN** its skill and relevant references contain the updated workflow, resolve their links, and agree with installed commands and supported capabilities

#### Scenario: Behavioral acceptance is evaluated

- **WHEN** the workflow guidance is accepted
- **THEN** evidence includes representative feature, bug, discussion, onboarding, module-selection, and backend/endpoint scenarios rather than only keyword-presence assertions
