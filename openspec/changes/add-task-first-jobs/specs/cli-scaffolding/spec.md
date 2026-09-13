## ADDED Requirements

### Requirement: Jobs CLI and artifact scaffolding use the shared contract

The CLI SHALL provide jobs list, runs list/get/watch, trigger, cancel, retry, capabilities and native schedule administration with JSON output, bounded filters and nonzero rejection/unknown outcomes. Command names, inputs and flags SHALL follow design section 0.10. Existing local up/status/stop/reset SHALL select jobs services and retain ownership guards; reset SHALL provide --dry-run impact preview and retain --yes as its explicit confirmation override. Create/add flows SHALL support task artifacts, task-target jobs and --jobs inngest-docker/effect-mq-docker/trigger-docker only when certified, without changing existing no-cloud defaults.

#### Scenario: Unknown native write acknowledgement

- **WHEN** a CLI trigger or retry loses its acceptance response
- **THEN** JSON contains the stable operation/key and the exit status is nonzero

#### Scenario: Queue-only scaffold

- **WHEN** effect-mq-docker is selected
- **THEN** the generated task is explicitly retryable and never uses a local sleep fallback

### Requirement: Packed task projects work without repository source

Generated projects SHALL contain published dependencies, config, task/job/domain source, submission route, generated-client use, tests, safe env examples, README and dev/check/test/typecheck/build/start scripts. Examples SHALL retain run IDs and idempotency keys for recovery and use simulated business services. Fresh account-free Docker restart SHALL preserve accepted work; existing minimal/api/agent templates SHALL remain valid.

#### Scenario: Fresh packed installation

- **WHEN** a new directory installs the packed release and follows its README
- **THEN** generation, checks, native local execution, watch, restart and Inspector succeed without unpublished exports or paid APIs
