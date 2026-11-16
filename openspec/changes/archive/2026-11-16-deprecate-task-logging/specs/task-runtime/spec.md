## ADDED Requirements

### Requirement: The logging option of a task is deprecated and has no effect

`defineTask` SHALL accept `logging` and SHALL mark it as deprecated in its type. `relkit check` SHALL report each task that sets it as a warning that names the task, and SHALL still pass. The option SHALL NOT be sent to a jobs backend, and no backend SHALL refuse a run because a task sets it. The graph SHALL keep what the task declares.

#### Scenario: A task sets logging

- **WHEN** a task sets `logging` and the application is checked
- **THEN** the check passes and prints a warning with `RELKIT_DEPRECATED_TASK_LOGGING` that names the task

#### Scenario: A run of that task is submitted

- **WHEN** a run of a task that sets `logging` is submitted to any jobs backend
- **THEN** the policy sent with the run has no `logging` and the backend accepts the run

#### Scenario: The editor lists the option

- **WHEN** an editor lists the options of `defineTask`
- **THEN** `logging` is marked as deprecated and its description says it has no effect and will be removed
