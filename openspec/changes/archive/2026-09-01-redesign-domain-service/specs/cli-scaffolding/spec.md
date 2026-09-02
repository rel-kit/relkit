## MODIFIED Requirements

### Requirement: Generated templates teach service composition

Every generated template SHALL use domain-first source layout and public service APIs. The API and agent templates SHALL demonstrate public service functions, direct invocation, and applicable events/tools; the minimal template SHALL contain one small `hello` domain without speculative integrations.

#### Scenario: API template is generated

- **WHEN** a developer creates the API template
- **THEN** its route maps to a public service function, nested calls use service members, and all source descriptors live beneath owned domains or the routes/platform layers

#### Scenario: Minimal template is generated

- **WHEN** a developer creates the minimal template
- **THEN** it contains one service and one function under `src/hello` and does not scaffold empty categories, agents, events, database, or auth

