## ADDED Requirements

### Requirement: Compile failures are reported as compile failures

When a changed file fails to parse or load, the development server SHALL report the failure with its file and line as soon as the candidate fails, SHALL NOT wait for a health timeout, and SHALL start the next rebuild as soon as a later change arrives.

#### Scenario: Syntax error then a fix

- **WHEN** a file is saved with a syntax error and corrected two seconds later
- **THEN** the syntax error is reported within the reload budget with file and line, and the corrected version is serving within the reload budget of the second save

### Requirement: The development worker listens where the developer asked

The development worker SHALL bind to the same host as the development server's public listener.

#### Scenario: Default development start

- **WHEN** `relkit dev` runs with the default host
- **THEN** no listener of the development server is bound to a non-loopback address

### Requirement: Stopping is not an error

Stopping a command with an interrupt or termination signal SHALL exit with the conventional status and SHALL NOT print an error diagnostic in human output.

#### Scenario: Ctrl+C on the development server

- **WHEN** the developer presses Ctrl+C
- **THEN** the output ends with a neutral stop line and the exit status is 130

### Requirement: The development server judges origins against the address the client used

Behind the development proxy, the worker SHALL see the authority the client connected to on every supported runtime, for HTTP requests and for WebSocket connections, so same-origin checks compare a request's `Origin` with the public address. The worker SHALL NOT take that authority from a forwarding header a client can send.

#### Scenario: Same-origin POST on Node

- **WHEN** `relkit dev` runs on Node and a `POST` arrives whose `Origin` equals the server's public origin
- **THEN** the request is served, and a `POST` from another origin answers 403 `origin-denied`

#### Scenario: Same-origin WebSocket on Node

- **WHEN** `relkit dev` runs on Node and a WebSocket opens with an `Origin` equal to the server's public origin
- **THEN** the connection is accepted, and one from another origin is refused

#### Scenario: Forged forwarding headers

- **WHEN** a request carries `X-Forwarded-Host` or `Forwarded` naming another host
- **THEN** the origin verdict is the same as without them
