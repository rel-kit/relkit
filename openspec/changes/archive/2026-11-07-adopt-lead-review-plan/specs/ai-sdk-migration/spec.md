# Spec Delta

## ADDED Requirements

### Requirement: AI SDK support is adapter-only

The Vercel AI SDK SHALL be used only inside its agent adapter package, and applications that do not
select that adapter SHALL NOT install or load it.

#### Scenario: Application without the AI SDK adapter

- **WHEN** an application's agents all use the LangChain adapter
- **THEN** no AI SDK package is installed or loaded

## REMOVED Requirements

### Requirement: New builds contain no AI SDK runtime path

**Reason**: The Vercel AI SDK returns as an optional agent adapter (`agent-adapters`).

**Migration**: None; applications opt in by selecting the AI SDK adapter.
