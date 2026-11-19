## MODIFIED Requirements

### Requirement: Real-application audit before release

A change that claims a finding of the real-application audit fixed SHALL be verified by re-running the request harness and the Inspector page walk against packages packed from the change, under an npm install and a Bun install. A contract row that the change leaves failing by decision SHALL be accepted only when the documentation states the behaviour the row observes, and the harness's expectations SHALL NOT be edited to make a row pass.

#### Scenario: Re-audit of packed candidates

- **WHEN** the harness and the walk run against the packed candidates
- **THEN** every baseline failure is passing or recorded as by design with its diagnostic, and no new failure appears

#### Scenario: A contract row remains by decision

- **WHEN** a row that compares the served answers with the OpenAPI document still fails after the change
- **THEN** the change's report names the documentation that states the behaviour and proposes the change to the harness's expectation
