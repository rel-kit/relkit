## ADDED Requirements

### Requirement: The recorded status is the status sent

A request record SHALL carry the status code the client received. Cancellation after the response headers were sent SHALL be recorded as an outcome without replacing the status.

#### Scenario: Client ends a stream it received with 200

- **WHEN** a client closes a streamed response whose status was 200
- **THEN** the record's status is 200 and its outcome is cancelled

### Requirement: Framework housekeeping is not application telemetry

Polling and inspection work of local providers SHALL NOT be recorded as application logs, and one inspection query SHALL NOT perform one provider operation per stored record.

#### Scenario: Idle development server

- **WHEN** the application receives no requests for one minute
- **THEN** no success log of provider polling or inspection is recorded

### Requirement: Loss and export counters mean what they say

An export failure SHALL be counted only when a configured exporter failed. Records lost before reaching history and missed live updates SHALL be reported as separate, named quantities.

#### Scenario: No exporter configured

- **WHEN** the application configures no exporter
- **THEN** the export failure counter stays at zero

### Requirement: Continuations are linked to their origin

An invocation started by an event delivery SHALL carry the originating request and a link to the publishing span through generated servers.

#### Scenario: Event reaction after a request

- **WHEN** a request publishes an event whose reaction runs afterwards
- **THEN** the request's detail lists the reaction as a continuation

### Requirement: History can be queried by what a developer knows

History queries SHALL filter requests by status, method, path and declared error identifier, SHALL support text search, and SHALL return the number of matching records.

#### Scenario: Finding the failed requests

- **WHEN** a developer filters requests by status 500
- **THEN** only those requests are returned, with their count

### Requirement: Requests outside declared routes are attributed

Requests handled by a mounted handler or by a system endpoint SHALL be recorded with a stable route identifier, and those routes SHALL appear in the route list.

#### Scenario: Authentication request

- **WHEN** a request is handled by the mounted authentication handler
- **THEN** its record names the authentication route instead of an unknown route
