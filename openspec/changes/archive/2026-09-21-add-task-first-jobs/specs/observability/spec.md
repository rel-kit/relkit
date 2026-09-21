## ADDED Requirements

### Requirement: Task traces preserve detached causation and bounded metrics

Task trigger SHALL emit an acceptance producer span and each task entry/attempt a fresh consumer trace linked to accepted causation. Task/job/version/build/service/run/attempt/correlation metadata SHALL be present in traces/logs; replay/resume SHALL not be mislabeled as retries. All sinks SHALL receive redacted data. Observation/native-store outages SHALL not rewrite task outcome or block accepted work. Metrics SHALL cover acceptance, queue age, state counts, durations, controls, throttling and watch resources without unbounded run/tenant labels.

#### Scenario: Request ends before task execution

- **WHEN** the producing HTTP invocation finishes days before the task resumes
- **THEN** task spans remain linked without keeping the request span or request signal alive

#### Scenario: High-cardinality workload

- **WHEN** many unique run IDs and scopes are processed
- **THEN** per-run identifiers remain in traces/logs and metric label cardinality stays bounded
