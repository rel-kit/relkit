## ADDED Requirements

### Requirement: TJ-039 Docs and scaffold parity

Documentation, generated reference and scaffold examples MUST match the implemented API and feature matrix.

#### Scenario: Docs and scaffold parity

- **WHEN** a fresh packed application follows the documented quickstart and copied examples
- **THEN** all commands, exports, names and schemas match generated declarations and execute without unpublished dependencies

### Requirement: Task and jobs documentation is complete and generated from executable sources

Documentation SHALL cover the full page set and example matrix in this change's design section 17: vocabulary, quickstart, tasks, bindings/names, duration/sleep, execution policy, retry/idempotency, client/controllers/React/SSR, progress/streams, security, schedules, Inspector, Docker, deployment, testing, migration, troubleshooting and three provider guides/comparison. Existing function/service/event/agent/graph/realtime/client/config/CLI/deploy pages SHALL cross-link accurate semantics. API and CLI reference SHALL regenerate from exports and examples, with navigation/search/links and legacy redirects validated.

#### Scenario: Old jobs URL is visited

- **WHEN** a reader follows a previous define/enqueue/first-job/retries/idempotency/schedules link
- **THEN** the destination identifies legacy migration or the new task contract instead of silently teaching function-target jobs

#### Scenario: Copied example needs a helper

- **WHEN** documentation demonstrates an idempotent mail/export helper
- **THEN** the complete simulated helper exists in its authoritative executable fixture rather than as a nonexistent framework export

#### Scenario: React example triggers and recovers work

- **WHEN** a user runs the documented React export example
- **THEN** it retains the accepted runId and original request/key, observes the selected run, handles unknown outcomes without fresh-key resubmission, and creates no IDs or live connections during server rendering
