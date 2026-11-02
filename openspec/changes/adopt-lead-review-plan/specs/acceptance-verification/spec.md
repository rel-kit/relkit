# Spec Delta

## MODIFIED Requirements

### Requirement: Every supported creation combination passes every measured start

Release readiness SHALL measure every valid runtime-affecting combination on every Tier 1 runtime with
20 fresh-installed starts and 20 unchanged restarts, requiring exact complete responses, clean
shutdown and the 30-second terminal deadline. Reports SHALL keep every attempt, the host, identities,
median, p95 and maximum. One-second performance results SHALL be reported separately and SHALL NOT
alone block readiness. Results SHALL set which combinations creation reports as tested.

#### Scenario: One combination has a slow run

- **WHEN** one required run is at or above 1,000 ms despite a passing median or p95
- **THEN** strict performance certification fails and the slow attempt remains recorded; release
  readiness passes only if all functional requirements pass

#### Scenario: Default combination fails

- **WHEN** default minimal creation lacks current passing evidence on any Tier 1 runtime
- **THEN** the release is blocked and another template cannot replace the default acceptance gate

#### Scenario: An offered combination is unmeasured

- **WHEN** a valid combination has no current evidence
- **THEN** creation offers it with an untested warning and release readiness lists it as unmeasured

#### Scenario: Tool or template identity changes

- **WHEN** relevant tool, runtime, package, template, configuration, or protocol identity changes
  after measurement
- **THEN** affected evidence is stale and creation reports the combination as untested until it is
  measured again

### Requirement: Grouped distribution refreshes affected certification

Acceptance SHALL run packed CLI/generator and migrated flat applications outside the monorepo, verify
documented install/check/typecheck/test/build/start/dev flows, and refresh readiness evidence
invalidated by package, template, or tool changes. All remaining normative obligations below SHALL
also hold.

#### Scenario: All normative obligations are evaluated

- **WHEN** implementation or final acceptance evaluates this requirement
- **THEN** all of the following remaining obligations hold:

Maintained minimal, API, agent, fullstack and tasks templates SHALL receive candidate coverage, and
public creation SHALL offer all of them. Every measured combination SHALL retain 20 fresh and 20
restart measurements from literal `dev` to the correct complete public response, with exact
identities, clean shutdown, the 30-second functional deadline, and all attempts. Reports SHALL
distinguish functional readiness from strict one-second performance on the recorded host; shared-host
timing failure alone SHALL NOT block release admission. Unavailable required evidence SHALL be
recorded as blocked or not run, never passed; no combination SHALL be reported as tested using source
inspection or snapshots alone.

#### Scenario: Template digest changes

- **WHEN** grouped template changes invalidate existing creation evidence
- **THEN** affected evidence is refreshed in CI for the exact package, tool and template identity
  before release, and the default minimal gate remains mandatory

#### Scenario: Fullstack candidate is valid but uncertified

- **WHEN** candidate fullstack tests pass without current functional readiness evidence
- **THEN** backend layout correctness is recorded separately, creation offers fullstack with an
  untested warning, and `--strict` rejects it

## ADDED Requirements

### Requirement: Nightly creation canary

A nightly CI job SHALL create every template with the published creator on the latest Bun and Node
releases, run its dev and test commands, and open or update an issue when any of them fails. The canary
SHALL also run on pull requests that change creation, templates or the canary itself, using the
creator packed from the pull request, and SHALL NOT open issues from those runs.

#### Scenario: New Bun release breaks creation

- **WHEN** a new Bun release breaks creation of any template
- **THEN** the next nightly run fails and opens or updates an issue that names the template and the
  Bun version

#### Scenario: A pull request changes creation

- **WHEN** a pull request changes the creator, a template or the canary workflow
- **THEN** the canary runs every template with the creator packed from that pull request, and a
  failure blocks the pull request

### Requirement: Plan verification matrices join release readiness

Release readiness SHALL include the Tier 1 runtime matrix, the TypeScript 5.9 and 7 matrix, the
development-loop benchmarks, the Railway newcomer deploy test once Railway ships, and the agent
evaluations.

#### Scenario: A matrix job fails

- **WHEN** any of those jobs fails for a release candidate
- **THEN** release readiness fails and names the job
