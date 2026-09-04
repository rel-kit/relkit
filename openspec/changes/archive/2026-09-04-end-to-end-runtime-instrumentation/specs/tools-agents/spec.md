## ADDED Requirements

### Requirement: Real agent model and tool spans

Agents, model turns, tool callbacks, parallel tool calls and approvals SHALL use the shared span lifecycle rather than synthetic summary spans. Actual callbacks SHALL execute with their corresponding span active, with manual trace API available to tool handlers.

#### Scenario: Parallel tools log

- **WHEN** two model-selected tools execute concurrently and one fails
- **THEN** each tool's logs and operations have its own active span, the failure is identifiable, and the parallel relationship is preserved
