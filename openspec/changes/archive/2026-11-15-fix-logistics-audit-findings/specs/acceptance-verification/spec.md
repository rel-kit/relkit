## ADDED Requirements

### Requirement: Node acceptance covers the commands a project uses

The Node creation acceptance run SHALL, without Bun installed, add a database, migrate it from an environment file, run `check`, start the Inspector until it listens, and run `start` without a build expecting the coded diagnostic.

#### Scenario: Node acceptance on a pull request

- **WHEN** the Node acceptance job runs
- **THEN** each of those commands is exercised and a failure of any fails the job

### Requirement: Real-application audit before release

A change that claims a finding of the real-application audit fixed SHALL be verified by re-running the request harness and the Inspector page walk against packages packed from the change, under an npm install and a Bun install.

#### Scenario: Re-audit of packed candidates

- **WHEN** the harness and the walk run against the packed candidates
- **THEN** every baseline failure is passing or recorded as by design with its diagnostic, and no new failure appears
