## ADDED Requirements

### Requirement: A task limit is enforced or reported

A jobs backend SHALL enforce a task's `maxDuration` and `maxElapsed`, or SHALL report by name each of these options it cannot honour when the application is checked and when it starts. No backend SHALL ignore one of them silently.

#### Scenario: The local backend ends a long attempt

- **WHEN** an attempt of a task on the local backend is active longer than the task's `maxDuration`
- **THEN** the attempt fails with the failure kind `timeout`

#### Scenario: A backend cannot honour an option

- **WHEN** an application's task sets an option that its selected backend cannot honour
- **THEN** `relkit check` and the application's start report the backend and the option by name
