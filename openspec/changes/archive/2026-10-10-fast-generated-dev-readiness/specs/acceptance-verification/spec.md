## ADDED Requirements

### Requirement: Generated backend startup has a reproducible packed baseline

Before optimization, acceptance SHALL record a repeatable packed-package baseline using the same external command-to-correct-response boundary used for final readiness certification. The earlier roughly seven-second observation SHALL remain historical context, not per-stage attribution. Baseline and candidate records SHALL identify package/tool versions, host, commands, artifacts, expected response, prerequisite state, individual samples, and optional stage timing without replacing total elapsed time.

#### Scenario: Baseline is captured

- **WHEN** current packed packages generate and install a fresh project outside the repository
- **THEN** the benchmark records `bun dev` invocation through first correct public backend response, raw durations and environment before runtime optimization

### Requirement: Packed readiness uses the complete command-to-response clock

The benchmark SHALL start a monotonic clock immediately before spawning the generated project's `bun dev` command and stop only after receiving and validating the complete first correct HTTP response through its public development address. Bun dispatch, CLI startup, cache verification, service adoption, child execution, route loading, supervisor activation, proxying, and probe overhead SHALL remain inside that interval. Packed packages SHALL resolve outside the workspace without contributor overrides or a previously running backend. Polling interval SHALL be bounded at no more than 5 ms and no interval or command overhead SHALL be subtracted.

#### Scenario: Ready banner precedes serving

- **WHEN** a process prints Ready or binds its port before the expected backend response works
- **THEN** the timer continues and the banner/bind cannot qualify as a passing sample

#### Scenario: Response body is incorrect

- **WHEN** HTTP succeeds but returns a placeholder, wrong greeting, wrong status, or stale generation/cohort
- **THEN** the attempt does not qualify and remains recorded as failed if the correct response is not obtained within the bound

#### Scenario: Poll observes a response after the threshold

- **WHEN** correct complete response observation occurs at or above 500 ms
- **THEN** the sample fails without subtracting polling delay or rounding it below the threshold

### Requirement: Every supported creation combination passes every measured start

Readiness certification SHALL enumerate every valid normalized runtime-affecting combination, including fullstack, jobs, cloud/deploy selections, and examples enabled/disabled. Each shipped combination SHALL pass a controlled 20-start fresh-installed set and a separate controlled 20-start unchanged-restart set on the current Apple M1 Pro/macOS arm64 reference host with pinned Bun. Every run SHALL be strictly below 500 ms. The record SHALL include every attempt plus median, nearest-rank 95th percentile, and maximum, without discarding warmups, failures, outliers, or cleanup failures. Post-install preparation for `--no-install` SHALL receive equivalent functional and readiness evidence.

#### Scenario: One combination has a slow run

- **WHEN** one required run is at or above 500 ms despite a passing median or p95
- **THEN** that combination fails certification, is hidden interactively, and its explicit flags are rejected

#### Scenario: Default combination fails

- **WHEN** default minimal creation lacks current passing evidence
- **THEN** the change is not ready to ship and another template cannot replace the default acceptance gate silently

#### Scenario: An offered combination is unmeasured

- **WHEN** the resolver can produce a valid runtime-affecting tuple without current evidence
- **THEN** release validation fails until it is measured or consistently removed from interactive and explicit creation

#### Scenario: Tool or template identity changes

- **WHEN** relevant tool, runtime, package, template, configuration, or protocol identity changes after certification
- **THEN** affected capability evidence is stale and must be recertified before advertising that tuple

### Requirement: Readiness probes use actual generated behavior

Example-bearing projects SHALL be timed against an actual safe generated backend route with its expected status/body; fullstack SHALL use API `/hello`, independently of web-page readiness. Jobs projects SHALL use their actual generated safe example route and SHALL retain required native certification. Without examples, acceptance SHALL prove live active graph, generation, route-table, and activation identity through the backend's protected graph-serving readiness endpoint. A static health stub SHALL not pass.

#### Scenario: Fullstack web compilation is slow

- **WHEN** the API answers `/hello` correctly while the web page is still compiling
- **THEN** API command-to-response timing qualifies independently, and the record separately identifies web readiness

#### Scenario: Examples are disabled

- **WHEN** `--no-examples` produces no example route
- **THEN** the benchmark validates live graph-serving readiness and rejects liveness or static snapshot JSON as proof

### Requirement: Docker provisioning and fallback have separate correctness evidence

Required Docker services SHALL be healthy and safely adoptable before t0 in gated starts. Cold provisioning, installation, and edited-source fallback SHALL be recorded separately without the 500 ms gate. Every cold setup SHALL retain visible prerequisite progress and fail safely if required services cannot become healthy. Missing/stale/corrupt snapshots SHALL exercise full validation, and invalid edits SHALL never activate or displace the last-known-good generation.

#### Scenario: Cold Docker setup is required

- **WHEN** a generated jobs project needs images or services provisioned
- **THEN** setup time is reported separately and only a subsequent launch with verified healthy services is subject to the 500 ms gate

#### Scenario: Required service is unhealthy or its lease mismatches

- **WHEN** a prestarted service has wrong ownership/plan identity or fails health
- **THEN** development does not bypass reconciliation to claim readiness and the controlled sample is invalid or failed with explicit evidence

#### Scenario: Valid and invalid edits follow a passing restart

- **WHEN** source is edited first validly and then invalidly
- **THEN** full fallback activates only the valid current graph, the invalid candidate leaves it serving, and both fallback results are recorded separately from unchanged-start timing

### Requirement: Startup edge cases and implementation gates are executable

Implementation acceptance SHALL cover relocation after atomic creation, added/deleted files, helper/asset changes, config/dependency/tool changes, cache tampering, rapid edits, concurrent preparation, deferred loading, backend/inspector port conflicts, failed children, cancellation, streaming drain, shutdown, and delayed/failed inspector or telemetry including overflow/redaction/handoff. Every created or edited source file SHALL be reviewed against `$use-effect`, including version-matched Effect implementation/test/example checks, scoped lifetimes, injectable dependencies/test Layers, preserved typed failures/defects/interruption, and behavioral evidence. Focused tests, packed generator acceptance, `bun run prepush`, and strict OpenSpec validation SHALL have recorded passing outcomes before implementation completion.

#### Scenario: Support startup is deliberately delayed

- **WHEN** real packed lifecycle fixtures delay inspector and persistence beyond backend readiness
- **THEN** correct backend responses still pass independently, early records remain bounded/redacted, loss is explicit, and shutdown leaves no owned processes or readers

#### Scenario: Cache or source races are injected

- **WHEN** fixtures inject corruption, additions/deletions, dependency changes, or edits during validation/activation
- **THEN** stale or invalid source cannot activate and cleanup preserves the prior complete artifacts and generation

#### Scenario: Required reference evidence is unavailable

- **WHEN** hardware, prerequisites, native certification, or any required implementation gate cannot be exercised
- **THEN** the record identifies it as blocked or not run rather than passed, and the applicable capability is not promoted
