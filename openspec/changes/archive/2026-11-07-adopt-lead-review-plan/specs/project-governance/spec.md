# Spec Delta

## Purpose

Defines how the RelKit project is run: when specifications are required, where verification evidence
lives, repository hygiene, contributor onboarding, the dependency policy, standing stop-doing rules,
the community launch and the metrics the plan tracks.

## ADDED Requirements

### Requirement: OpenSpec scope

An OpenSpec change SHALL be required for new public APIs or descriptor kinds, breaking changes, new
provider families, graph or protocol format changes and security-sensitive changes. Other changes
SHALL NOT require one.

#### Scenario: Bug fix without a spec change

- **WHEN** a pull request fixes a bug without changing specified behavior
- **THEN** it can merge without an OpenSpec change

#### Scenario: New descriptor kind

- **WHEN** a pull request adds a descriptor kind
- **THEN** review requires a linked, approved OpenSpec change before merge

### Requirement: Evidence storage

Full verification reports SHALL be stored as CI artifacts and release assets. The repository SHALL
keep one short evidence summary per release, and the `docs/` directory SHALL stay under 5 MB.

#### Scenario: Release evidence is produced

- **WHEN** a release is certified
- **THEN** the full reports are attached to the GitHub release and the repository gains one summary
  file under `docs/evidence/`

#### Scenario: Raw report is committed

- **WHEN** a commit adds a raw evidence report or a bug-fix report artifact
- **THEN** the repository size check fails and names the file

### Requirement: Machine-independent repository content

Committed files SHALL NOT contain machine-specific absolute paths, and repository guidance SHALL
reference only files inside the repository or public URLs.

#### Scenario: Personal path is committed

- **WHEN** a commit adds a path under a personal home directory or a temporary directory
- **THEN** a repository check fails and names the file and line, unless the file is on the check's
  documented allowlist

### Requirement: Rules are executable

Every mandatory rule for contributors or coding agents SHALL be enforced by a check in `prepush` or
CI; guidance that is not enforced SHALL be labelled advisory.

#### Scenario: Guidance adds a rule

- **WHEN** AGENTS.md or CONTRIBUTING gains a mandatory rule
- **THEN** the same change adds the check that enforces it, or labels the rule advisory

### Requirement: Contributor quickstart

CONTRIBUTING SHALL start with a quickstart of at most ten lines that takes a new contributor from
clone to a passing local check. Release-certification details SHALL live in a separate maintainer
document.

#### Scenario: New contributor follows the quickstart

- **WHEN** a contributor runs the quickstart commands on a clean machine with supported tools
- **THEN** install, build, unit tests and `prepush` succeed without extra setup

### Requirement: Relevant agent skills only

Agent skills in the repository SHALL apply to code or tools this repository uses; vendored skills for
code that does not exist here SHALL be removed.

#### Scenario: Skill audit

- **WHEN** the skills check runs
- **THEN** every skill under `.agents/skills` refers only to packages, tools or services the
  repository uses

### Requirement: Pre-release dependency policy

A dependency policy document SHALL list every pre-release or locally patched dependency with an owner
and an exit plan. Packages installed into user projects SHALL depend only on stable releases unless
the policy lists an exception.

#### Scenario: Pre-release pin is added

- **WHEN** a change adds a beta, release-candidate or patched dependency
- **THEN** the dependency policy check fails until the policy lists it with an owner and an exit plan

### Requirement: Standing stop-doing rules

Until Core reaches 1.0, the project SHALL NOT add feature areas outside approved changes, refuse
project creation on untested setups, commit raw evidence or bug-report artifacts, add fast paths that
apply to one example application, or present AWS as the lead deploy target.

#### Scenario: Example-specific fast path

- **WHEN** a change adds behavior that applies only to a named example application
- **THEN** review rejects it in favor of a general mechanism

### Requirement: Community channels and launch

Before launch, the project SHALL enable a public discussion channel, publish the roadmap with Core
and Labs status, label good first issues and set the repository description. The launch SHALL happen
only after the P0 items and the Railway newcomer test pass.

#### Scenario: Launch readiness

- **WHEN** the launch checklist is evaluated
- **THEN** it passes only if every P0 item is done and a newcomer deploys to Railway within 15
  minutes

### Requirement: Plan metrics are tracked

Each release SHALL publish the plan's metrics: creation success on the latest Bun, time to a first
route, time to a Railway deploy, runtimes passing the HTTP suite, reload p95, check memory, agent
eval pass rate, outside contributions and the published package count.

#### Scenario: Release metrics

- **WHEN** a release is published
- **THEN** its notes link a metrics page showing each metric's current value and target
