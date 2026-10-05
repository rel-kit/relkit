## ADDED Requirements

### Requirement: Specialized package migration has complete source and reviewer coverage

Acceptance of the specialized package migration SHALL account for every authored TypeScript file beneath `packages/drizzle`, `packages/better-auth`, and `packages/providers-standard`, including root tests, configuration, and hidden or ignored authored files. Generated output, dependencies, binaries, and vendor code SHALL be explicitly excluded. Every implementation phase SHALL end with independent review of every changed TypeScript file, including added, moved, and supporting files outside the primary package roots, against the use-effect contract and public compatibility requirements. Findings SHALL be resolved and affected checks rerun before phase acceptance.

#### Scenario: A file needs no runtime migration

- **WHEN** an inventoried file is a pure helper, React integration, type-only companion, or empty compatibility entrypoint
- **THEN** acceptance records its reviewed disposition and does not manufacture unrelated services or runtime features solely to change that file

#### Scenario: Review covers the actual final diff

- **WHEN** a phase is ready for acceptance
- **THEN** an independent reviewer reads each changed TypeScript file through EOF, checks applicable lifecycle/concurrency/error/observability/schema/documentation behavior, and rechecks files changed to address findings

### Requirement: Specialized migration is accepted against the linked regression demo

Final acceptance SHALL replay the existing credential-free regression demo and retained generated-host fixture suites against the changed framework build and correctly resolved workspace links, including origin security, invalid agent input, invalid channel parameters, stream cancellation/presence cleanup, and browser behavior. Focused database/auth tests SHALL supplement those broader checks when the demo does not exercise the specialized packages. Evidence SHALL identify the tested checkout/build, commands, outcomes, runtime endpoints, link resolution, and known baseline failures without overwriting historical results.

#### Scenario: Demo links resolve another checkout

- **WHEN** demo dependencies or running server artifacts resolve to the original checkout instead of the candidate implementation
- **THEN** the replay does not qualify as candidate acceptance until the correct links and build are used

#### Scenario: Historical diagnostic checks fail

- **WHEN** a retained diagnostic reproduces a previously documented unrelated finding
- **THEN** acceptance records the baseline and candidate outcomes separately and does not describe the failing command as passed or silently clear the finding

#### Scenario: Optional paid or environment-dependent evidence is unavailable

- **WHEN** a paid model probe is not authorized, or a required local prerequisite is unavailable
- **THEN** its outcome is recorded as not run or blocked, historical provider evidence remains historical, and missing required offline evidence prevents a complete offline acceptance claim

### Requirement: Empty standard provider package has an explicit compatibility decision

Acceptance SHALL document the current purpose, runtime consumers, release/build references, and retention or retirement decision for `providers-standard`. This migration SHALL preserve its empty public compatibility surface; a future retirement SHALL require coordinated consumer and release-tooling migration rather than introducing artificial runtime functionality.

#### Scenario: Package has no authored runtime implementation

- **WHEN** the package audit finds only an empty export and infrastructure references
- **THEN** the migration records why the compatibility package is retained and verifies that obsolete runtime exports remain absent
