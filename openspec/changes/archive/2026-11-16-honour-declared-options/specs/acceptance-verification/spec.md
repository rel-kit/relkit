## ADDED Requirements

### Requirement: The test application honours its context option

`createTestApplication` SHALL give handlers the fields passed as `context`, with the meaning the option has in `createTestRuntime`.

#### Scenario: A handler reads a replaced context field

- **WHEN** a test passes `context` to `createTestApplication` and invokes a function that reads one of its fields
- **THEN** the function reads the value the test passed
