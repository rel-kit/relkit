# Spec Delta

## Purpose

Defines the development-only MCP server that lets coding agents inspect, run and change a RelKit
application through the same capabilities as the Inspector.

## ADDED Requirements

### Requirement: Development MCP server

`relkit mcp` SHALL start an MCP server for the project's running development session, bound to
localhost and authenticated with the same session token as the Inspector bridge.

#### Scenario: Agent connects

- **WHEN** a coding agent starts `relkit mcp` while `relkit dev` is running
- **THEN** the agent can list the server's tools and call them for that session

#### Scenario: No development session

- **WHEN** `relkit mcp` starts while no development session is running
- **THEN** it exits with a coded message that says to start `relkit dev`

### Requirement: Development tools

The server SHALL provide tools to query the graph, read diagnostics, read the logs and trace of a
request, invoke a function, run `check`, and apply an `add` operation with rollback on failure.

#### Scenario: Agent fixes a failing route

- **WHEN** an agent reads a failing request's trace, edits code and runs `check` through the server
- **THEN** each tool returns structured results that the agent can act on

### Requirement: Never in production

The development MCP server SHALL NOT be included in, or reachable from, production builds.

#### Scenario: Production build scan

- **WHEN** a production build is inspected
- **THEN** it contains no development MCP entry point

### Requirement: MCP Inspector compatibility

`relkit mcp` and the application's `/mcp` endpoint SHALL pass a test driven by the MCP Inspector CLI
for every release.

#### Scenario: MCP Inspector connects

- **WHEN** the MCP Inspector connects to `relkit mcp`
- **THEN** it lists and calls the tools successfully

### Requirement: Actionable approval errors

When an MCP client calls a tool that requires approval and the call cannot be approved through the
client, the application's MCP endpoint SHALL return a coded error that explains how to approve it.

#### Scenario: Client cannot approve

- **WHEN** an MCP client without approval support calls an approval-required tool
- **THEN** it receives a coded error that explains how to approve the call

### Requirement: Published agent evaluations

The repository's agent evaluations SHALL run for each release, and their pass rate SHALL be published
with the release metrics.

#### Scenario: Release evaluations

- **WHEN** a release is published
- **THEN** its metrics page shows the agent evaluation pass rate
