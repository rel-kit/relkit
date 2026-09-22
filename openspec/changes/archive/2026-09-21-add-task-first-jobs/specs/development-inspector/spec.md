## ADDED Requirements

### Requirement: TJ-036 Inspector definitions and run filters

Inspector MUST separate definitions from runs and support required server-side filters.

#### Scenario: Inspector definitions and run filters

- **WHEN** Inspector filters a history containing queued, sleeping and running work by running
- **THEN** only evidenced executing work matches; uncertain native phases are explicitly marked and definitions remain separate

### Requirement: TJ-037 Bounded and partial Inspector results

Inspector MUST paginate bounded native queries and disclose unavailable services/approximate counts.

#### Scenario: Bounded and partial Inspector results

- **WHEN** one service in an aggregate run query is unavailable
- **THEN** healthy services still return bounded results and the response names the unavailable service instead of showing zero

### Requirement: Inspector jobs navigation and detail keep resources distinct

The existing Jobs area SHALL provide Definitions, Runs, Schedules and Services, with linked task details. Definitions SHALL show API name, durable ID, explicit/implicit and retired status, task version/build, service, execution mode, policy/capabilities, schedules and health even with no runs. Run details SHALL separate native/normalized state, attempts/waits, I/O availability, progress/content, logs/traces, related runs/agents, resources and controls. Missing native evidence SHALL be visible and never synthesized.

#### Scenario: No history exists

- **WHEN** a job is defined but never triggered
- **THEN** its definition is shown independently of the empty run list

#### Scenario: Expired or redacted output

- **WHEN** a selected historical run lacks viewable output
- **THEN** detail reports why instead of showing fabricated empty success

### Requirement: Native filters, aggregate pages and live refresh remain bounded

Required native run filters SHALL include service/job/task/status/accepted-time and exact run ID. Optional version/build/started/completed/timezone/scope/tags/correlation/parent/failure/attempt filters SHALL be supported explicitly or disabled/rejected. Running SHALL mean evidenced executing work; active SHALL distinguish uncertainty. Pages SHALL be stable newest-first, default 25/max 100, with filter/identity-bound cursors and bounded per-service merge. Live insertions SHALL not reshuffle selected historical rows; filters SHALL persist in URL and live refresh SHALL pause/resume.

Aggregate continuation SHALL advance each service only through rows actually returned, preserve unread native rows across API restarts and obey the cursor byte bound without embedding payloads. Unsafe native continuation SHALL fail explicitly rather than skip/duplicate results. Unavailable services SHALL not become exhausted or silently rejoin a later page if recovery invalidates global ordering; refreshed queries SHALL include them with honest availability/counts.

#### Scenario: One service times out

- **WHEN** an aggregate page spans a healthy and an unavailable service
- **THEN** the page contains bounded healthy results, per-service cursors and explicit partial/count uncertainty

#### Scenario: Filter changes

- **WHEN** a user changes status or identity with an old cursor
- **THEN** the old cursor is rejected and a fresh page is requested

#### Scenario: New run arrives during selection

- **WHEN** a historical page is selected while refresh receives new runs
- **THEN** the UI shows new runs available without replacing the selected row

#### Scenario: Uneven native pages are merged

- **WHEN** two services each return 25 candidate rows but only 25 total rows are emitted
- **THEN** subsequent pages after an API restart include the unconsumed rows exactly once, rather than advancing both cursors past their entire fetched pages

#### Scenario: Missing service recovers

- **WHEN** a previously unavailable service recovers with runs newer than an already paginated partial result
- **THEN** the UI requires a refreshed query to include those runs without presenting silently reordered or globally complete history

### Requirement: Inspector controls share authorization and accessible behavior

Trigger/cancel/retry/schedule controls SHALL use the common operation layer plus Inspector privileges, bounded forms/batches and explicit impact confirmation for destructive/bulk operations. Request receipts SHALL remain pending until native evidence confirms finality. Unsupported actions SHALL explain their capability restriction. Closing/disconnecting Inspector SHALL never cancel work. Existing production exposure defaults and keyboard/status/reduced-motion/accessibility behavior SHALL remain enforced.

#### Scenario: Cancel clicked

- **WHEN** an operator submits cancellation for active work
- **THEN** the UI displays the request receipt and waits for native finality

#### Scenario: Narrow screen or keyboard user

- **WHEN** a user navigates long IDs, filters and run details without a pointer
- **THEN** controls have accessible names, visible focus, non-color status and usable responsive layout
