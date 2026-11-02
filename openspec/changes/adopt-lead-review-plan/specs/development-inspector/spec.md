# Spec Delta

## ADDED Requirements

### Requirement: Event and job actions

The Inspector SHALL let developers publish and replay events, trigger jobs, and retry or cancel event
deliveries from the UI, through the existing authorized action API.

#### Scenario: Replay an event

- **WHEN** a developer replays a delivered event in the Inspector
- **THEN** its consumers receive it again and the action appears in the history

#### Scenario: Trigger a job

- **WHEN** a developer triggers a job with valid input from the Inspector
- **THEN** a run starts and its page opens

### Requirement: MCP tools page

The Inspector SHALL list the application's MCP-exposed tools with their schemas and SHALL let
developers call them.

#### Scenario: Call an MCP tool

- **WHEN** a developer calls an MCP tool from the Inspector
- **THEN** the call runs through the common engine and its trace opens

### Requirement: Documented Inspector API for other clients

The Inspector API SHALL be documented as a development protocol so that clients other than the
bundled UI, including `relkit mcp` and a possible hosted Inspector, can use it.

#### Scenario: Inspector API reference

- **WHEN** the docs are built
- **THEN** the Inspector API reference lists every endpoint with its version and authentication
