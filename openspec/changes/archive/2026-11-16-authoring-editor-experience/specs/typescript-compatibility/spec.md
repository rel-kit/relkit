## ADDED Requirements

### Requirement: Editor behaviour of the authoring APIs is verified

The repository SHALL keep assertions on what an editor suggests and reports in the authoring APIs, for each authoring surface, and SHALL run them with the type tests on TypeScript 5.9 through its language service and on TypeScript 7 through its language server.

#### Scenario: A typing change removes a suggestion

- **WHEN** a change makes the editor stop suggesting the profile names for `defaults` in `defineApp`
- **THEN** `bun run test:types` fails on both compilers
