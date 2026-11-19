## ADDED Requirements

### Requirement: An event function without a profile uses the application's default

An event function that names no `profile` SHALL be bound to the application's default event profile, or to its only event profile, by the same selection that binds an event without a profile. A profile that is named SHALL be kept and checked against the application's profiles.

#### Scenario: Only named profiles

- **WHEN** an application has one event profile named `local` and an event function without `profile`
- **THEN** the application compiles without a diagnostic and the function's trigger is bound to `local`

#### Scenario: A default beside a profile named default

- **WHEN** an application has event profiles `default` and `audit`, `defaults.event` is `audit`, and an event function has no `profile`
- **THEN** the function's trigger is bound to `audit`

### Requirement: Sensitive event fields are redacted where the payload is recorded

The fields an event lists in `sensitiveFields` SHALL be replaced by the redaction marker wherever RelKit records the event's payload or shows it to someone other than the handler: logs, telemetry and exported telemetry, the Inspector's records and payload views, and error reports. Handlers, event functions and replay SHALL receive the payload unchanged.

#### Scenario: A delivery is recorded

- **WHEN** an event with a sensitive field is published and delivered to an event function
- **THEN** the recorded payload of the publication and of the delivery carries the marker in place of the field, and the function receives the field's value
