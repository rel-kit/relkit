## MODIFIED Requirements

### Requirement: Every supported creation combination passes every measured start

Release readiness SHALL enumerate every valid normalized runtime-affecting combination, including fullstack, jobs, cloud/deploy selections, and examples enabled/disabled. Each shipped combination SHALL pass 20 fresh-installed starts and 20 unchanged restarts, including restart preparation, with pinned Bun, exact complete responses, clean shutdown, and the existing 30-second terminal deadline. Reports SHALL retain every attempt, actual host, exact identities, median, nearest-rank 95th percentile, and maximum without discarding warmups, failures, outliers, or cleanup failures. Strict performance certification SHALL separately require every start below 1,000 ms on its recorded host; a performance failure SHALL remain explicit and SHALL NOT alone reject functional release readiness. Post-install preparation for `--no-install` SHALL receive equivalent functional evidence and separately reported performance evidence.

#### Scenario: One combination has a slow run

- **WHEN** one required run is at or above 1,000 ms despite a passing median or p95
- **THEN** strict performance certification fails and the slow attempt remains recorded; release readiness passes only if all functional requirements pass

#### Scenario: Default combination fails

- **WHEN** default minimal creation lacks current passing evidence
- **THEN** the change is not ready to ship and another template cannot replace the default acceptance gate silently

#### Scenario: An offered combination is unmeasured

- **WHEN** the resolver can produce a valid runtime-affecting tuple without current evidence
- **THEN** release validation fails until it is measured or consistently removed from interactive and explicit creation

#### Scenario: Tool or template identity changes

- **WHEN** relevant tool, runtime, package, template, configuration, or protocol identity changes after certification
- **THEN** affected capability evidence is stale and must be recertified before advertising that tuple

### Requirement: Grouped distribution refreshes affected certification

Acceptance SHALL run packed CLI/generator and migrated flat applications outside the monorepo, verify documented install/check/typecheck/test/build/start/dev flows, and refresh readiness evidence invalidated by package, template, or tool changes. All remaining normative obligations below SHALL also hold.

#### Scenario: All normative obligations are evaluated

- **WHEN** implementation or final acceptance evaluates this requirement
- **THEN** all of the following remaining obligations hold:

Maintained minimal/API/agent/fullstack template sources SHALL receive candidate coverage, while public creation SHALL remain limited to currently certified tuples. Every offered tuple SHALL retain 20 fresh and 20 restart measurements from literal `bun dev` to the correct complete public response, including preparation, exact identities, clean shutdown, the 30-second functional deadline, and all attempts. Reports SHALL distinguish functional readiness from strict one-second performance certification on the recorded host; shared-host timing failure alone SHALL NOT block release admission. Unavailable required evidence SHALL be recorded as blocked or not run, never passed; no tuple SHALL be promoted using source inspection or snapshots alone.

#### Scenario: Template digest changes

- **WHEN** grouped template changes invalidate existing creation evidence
- **THEN** affected certification is refreshed for the exact package/tool/template identity before shipment and the default minimal gate remains mandatory

#### Scenario: Fullstack candidate is valid but uncertified

- **WHEN** candidate fullstack tests pass without current functional readiness certification
- **THEN** backend layout correctness is recorded separately and public creation continues rejecting the uncertified tuple
