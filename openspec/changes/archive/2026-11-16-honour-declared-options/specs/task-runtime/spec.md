## ADDED Requirements

### Requirement: A task limit is enforced or reported

A jobs backend SHALL enforce a task's `maxDuration` and `maxElapsed`, or SHALL be reported by name for each of these options it does not enforce, when the application is checked and when it starts. No backend SHALL ignore one of them without that report. The report SHALL be a warning: it SHALL NOT fail the check and SHALL NOT stop the application from starting.

#### Scenario: The local backend ends a long attempt

- **WHEN** an attempt of a task on the local backend is active longer than the task's `maxDuration`
- **THEN** the attempt fails with the failure kind `timeout` and the code `RELKIT_TIMEOUT`
- **AND** the task's retry policy decides whether another attempt runs

#### Scenario: Time asleep does not count toward maxDuration

- **WHEN** an attempt on the local backend sleeps and resumes
- **THEN** the time asleep is not counted toward `maxDuration`, and the time worked before the sleep is

#### Scenario: The local backend ends a run past maxElapsed

- **WHEN** the time since a run on the local backend was accepted reaches the task's `maxElapsed`, while the run works, sleeps or waits to retry
- **THEN** the run ends without another attempt

#### Scenario: A run stopped by a limit is timed out

- **WHEN** a run on the local backend ends because of `maxDuration` or `maxElapsed`
- **THEN** its status is `timed-out` and its error names the task, the limit and the limit's value

#### Scenario: A backend does not enforce a limit

- **WHEN** a task declares `maxDuration` or `maxElapsed` and the backend of the profile that runs it does not declare that it enforces the limit
- **THEN** `relkit check` passes and prints a warning that names the task, the option, the backend and the profile
- **AND** the server logs the same warning when it starts

#### Scenario: A backend enforces the limit

- **WHEN** a task declares a limit and its backend declares that it enforces it
- **THEN** nothing is reported for that limit
