# agent-adapters Specification

## Purpose
Defines how RelKit agents run through interchangeable execution adapters while RelKit owns the agent
definition, tools, access rules, state, approvals, streaming and observability.

## Requirements

### Requirement: Portable agent definition

`defineAgent` from `relkit` SHALL declare an agent's ID, input and output schemas, model profile,
instructions, RelKit tools, limits and client policy, plus a `runtime` adapter that executes it.

#### Scenario: Adapter swap

- **WHEN** an agent that uses no adapter-specific options changes its `runtime` from the LangChain
  adapter to the AI SDK adapter
- **THEN** it passes the same agent conformance tests without other edits

### Requirement: Adapter-specific options

Each adapter SHALL accept SDK-specific extras, such as native middleware or native tools, through its
own options, and an agent that uses them SHALL be tied to that adapter.

#### Scenario: LangChain middleware

- **WHEN** an agent passes LangChain middleware through `langchain({ middleware })`
- **THEN** the middleware runs, and selecting another adapter for that agent fails at check time

### Requirement: RelKit-owned agent behavior

Tool execution through the common engine, access rules, durable threads, approvals, AG-UI streaming,
MCP exposure and traces SHALL behave the same under every adapter.

#### Scenario: Approval under each adapter

- **WHEN** a tool that requires approval is called under either first-party adapter
- **THEN** the run pauses for approval and resumes the same way

### Requirement: Model profiles

Agents SHALL reference model profiles bound in `relkit.config.ts`, and adapters SHALL resolve the
model from that profile.

#### Scenario: Profile is rebound

- **WHEN** the `default` model profile is bound to a different model
- **THEN** agents that use it run on the new model without code changes

### Requirement: First-party adapters

RelKit SHALL ship a LangChain adapter first and a Vercel AI SDK adapter second, both passing one shared
conformance suite. Adapters SHALL be Labs until the adapter interface is declared stable.

#### Scenario: Shared conformance

- **WHEN** the agent conformance suite runs
- **THEN** both first-party adapters pass every case

### Requirement: Graph workflows are Labs

Agent graph workflows SHALL remain Labs until the adapter interface is declared stable.

#### Scenario: Graph workflow docs

- **WHEN** a developer opens the graph workflow docs
- **THEN** the page carries the Labs badge
