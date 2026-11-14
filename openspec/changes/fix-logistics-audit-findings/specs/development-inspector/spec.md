## ADDED Requirements

### Requirement: Lists state their order and their totals

A list SHALL be ordered as its heading says, and a number shown as a count SHALL be the count of matching records; when only a page or a sample is loaded the interface SHALL say so.

#### Scenario: Requests list with more records than one page

- **WHEN** more requests are retained than one page holds
- **THEN** the first page shows the newest requests and the heading says newest first

#### Scenario: Overview with more requests than its sample

- **WHEN** the overview computes a rate from the latest 100 requests while more are retained
- **THEN** the tile is labelled as covering the latest 100

### Requirement: A failed request explains itself

The request detail SHALL show, when retained, the declared error code of an application failure, the issue codes and paths of a validation failure, the redacted cause of an internal failure, and the captured input and result of the invocation. It SHALL NOT promise data that no backend records.

#### Scenario: Declared domain error

- **WHEN** a request ended with a declared application error
- **THEN** the detail shows that error's identifier and links to its contract

#### Scenario: Internal failure in development

- **WHEN** a request ended with an internal failure
- **THEN** the detail shows the redacted cause recorded for it

### Requirement: Actions say why they cannot run

An action that the application refuses, or that the active backend does not provide, SHALL show the reason in plain language next to the control, including that Inspector actions run without a user session when that is why the application refused. An action that changes state SHALL ask for confirmation and SHALL validate its input against the declared schema first.

#### Scenario: Invoking a protected function

- **WHEN** a function with an access rule is invoked from the Inspector and the application answers 401
- **THEN** the result says the application refused the call because no user session is attached

#### Scenario: Event publish with an invalid payload

- **WHEN** the payload does not satisfy the event schema
- **THEN** the action is not sent and the failing fields are shown

### Requirement: The application's state is shown separately from the Inspector's

The interface SHALL distinguish its own stream to the Inspector process from the Inspector's session with the application, SHALL show on every page when the application is unreachable, and SHALL say when no development session has been found and what it is waiting for.

#### Scenario: Development server stops

- **WHEN** the development server stops while the Inspector is open
- **THEN** within the stream's reconnect interval every page shows that the application is unreachable and that retained history is still available

#### Scenario: No development session

- **WHEN** the Inspector starts and no development session exists for the project
- **THEN** the terminal and the interface say that no running session was found and how to start one

### Requirement: Contracts are shown as declared

Channel parameters, replay settings and every other declared field the detail page displays SHALL come from the application graph unchanged.

#### Scenario: Channel with parameters and a replay window

- **WHEN** a channel declares parameters and a replay window
- **THEN** its detail page shows both

### Requirement: Empty pages say why they are empty

A page with nothing to show SHALL say whether the application declares none, no record matches the active filters, or the data could not be loaded.

#### Scenario: Application without jobs

- **WHEN** the application declares no jobs
- **THEN** the jobs pages say that no jobs are declared and do not report an unavailable service
