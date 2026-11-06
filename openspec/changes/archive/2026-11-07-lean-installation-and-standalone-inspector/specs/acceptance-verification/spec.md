## MODIFIED Requirements

### Requirement: Packed and production-path acceptance

Release verification SHALL test packed packages and generator artifacts, the separately installed standalone inspector, production builds/containers, real supervisor/browser flows, OpenAPI/Scalar protection, Pulumi preview, and an isolated AWS stack rather than relying solely on workspace links, mocks, or manual checks.

#### Scenario: Workspace tests pass but package is broken

- **WHEN** a packed package cannot generate, install, build, start development without a repository inspector path, serve the documented route and explicitly selected API reference, or shut down cleanly
- **THEN** release acceptance fails even if workspace unit tests passed

### Requirement: Every changed authored file receives use-effect review

Each implementation phase and final acceptance SHALL account for every added, edited, or moved authored file and review it through EOF against the complete `use-effect` skill, its binding references and prerequisites, and applicable repository instructions. All remaining normative obligations below SHALL also hold.

#### Scenario: All normative obligations are evaluated

- **WHEN** implementation or final acceptance evaluates this requirement
- **THEN** all of the following remaining obligations hold:

Coverage SHALL include supporting files outside the primary implementation roots, hidden/ignored authored files, tests, type/schema companions, template source, documentation snippets, and skill guidance. Generated output, dependencies, binaries, and vendor code SHALL be explicitly excluded from authored-source review and validated through their relevant generation/behavior checks. Selected Effect patterns SHALL have implementation/test/example evidence from the read-only reference checkout and installed-version compatibility checks, with unavailable evidence disclosed.

Applicable runtime acceptance SHALL verify real service composition, live/test substitutability, E/R contracts, typed recovery, defects/interruption, lifetime ownership, concurrency bounds, and standalone instrumentation. Applicable source review SHALL enforce the skill's formatted 200-physical-line file limit, function bodies below 50 code lines, precise types, headers, TSDoc, checked examples, and companion placement. Review SHALL record responsibility-based treatment of pure helpers, public descriptors, UI, and non-runtime files without manufacturing Effect imports or changing public authoring APIs. Findings SHALL be resolved and invalidated checks rerun before phase or final completion.

#### Scenario: A supporting file changes late

- **WHEN** a fix adds, edits, or moves an authored file after its phase review
- **THEN** final acceptance includes the new file state in review and reruns affected checks instead of relying on earlier approval of different content

#### Scenario: Effect imports exist but behavior is unverified

- **WHEN** a changed workflow imports Effect or declares a Service but lacks applicable E/R, cleanup, recovery, or instrumentation evidence
- **THEN** its review remains incomplete and import presence or a completed planning checkbox cannot establish compliance

#### Scenario: A file requires no runtime Effect implementation

- **WHEN** a reviewed file is a pure leaf, public RELKIT descriptor, type/schema companion, React presentation module, or Markdown/skill guidance
- **THEN** review records the applicable checks and preserved boundary without inventing unrelated runtime abstractions or exempting its actual source/type/documentation obligations

#### Scenario: Lean-install or standalone-inspector stage is reviewed
- **WHEN** either stage reaches its gate
- **THEN** every changed authored file, including moved and supporting code, receives the existing use-effect review with version/source evidence and applicable behavior checks before stage acceptance

## ADDED Requirements

### Requirement: Consumer footprint evidence is reproducible and separate
Baseline and final measurements SHALL use actual packed external consumers, separately reporting creator-before-install, minimal/API development, production-only server, generic server client, agent/integrations and optional inspector. Installation, evaluated JavaScript, declarations and production artifacts SHALL have independent evidence.

#### Scenario: Measurement is recorded
- **WHEN** baseline or candidate footprint is measured
- **THEN** evidence includes package versions, physical instances, compressed bytes, logical/physical unpacked size where measurable, native artifacts, cold/warm observations, OS/architecture, package-manager versions and cache conditions, retaining failed/noisy attempts without double-counting shared dependencies

### Requirement: Packed isolation covers supported resolution layouts
Acceptance SHALL use controlled candidate artifacts outside the workspace across pinned Bun normal/isolated, npm and pnpm installations and supported bunx/npx creation. Hidden hoisting, workspace links/specifiers, checkout paths and unrelated registry or published-version fallback SHALL fail the gate.

#### Scenario: Workspace passes but consumer fails
- **WHEN** strict declarations or selected feature startup require an undeclared workspace dependency
- **THEN** acceptance fails despite source tests passing

### Requirement: Stage one closes before standalone implementation
Stage 1 SHALL pass functional/isolation checks, record measurements, reconcile release metadata/changesets/docs/examples/skills and enumerate its only remaining CLI legacy-inspector paths before Stage 2 begins. Final forbidden assertions SHALL remain visible rather than weakened.

#### Scenario: Mixed selected capabilities run
- **WHEN** cache+realtime, jobs+auth and agents+tools packed fixtures execute
- **THEN** selected semantics pass without duplicate registration or unrelated SDK requirements

#### Scenario: Stage one retains a non-inspector violation
- **WHEN** any final-policy violation is outside an exact allowed CLI legacy-inspector path
- **THEN** the Stage 1 gate stays incomplete

### Requirement: Review-focus failure classes have executable evidence
Acceptance SHALL exercise stale selected dependencies versus unused peers; disabled/production inspection versus core endpoints; committed replay versus legitimate revisions; restart/multiple-session Docker discovery; and relocated production-only native artifacts. Planning prose or unit-only claims SHALL NOT substitute for their owning boundary tests.

#### Scenario: Dependency disappears after preparation
- **WHEN** a selected SDK is removed but an unused capability also has a missing peer
- **THEN** stale selected startup fails before readiness and the unused capability is not falsely required

#### Scenario: Inspection is absent or forcibly enabled in production
- **WHEN** core readiness, client identity, jobs, realtime and RPC run with inspection disabled or production override attempts
- **THEN** required core behavior passes and rich inspection remains absent in production

#### Scenario: Replay and revision failures are injected
- **WHEN** storage commits but loses its acknowledgement and the same span later receives another revision
- **THEN** replay creates no duplicate committed envelope and the later update is retained

#### Scenario: Docker discovery rotates with multiple sessions
- **WHEN** the backend restarts and two compatible sessions are discoverable
- **THEN** directory-mounted credentials refresh, stale sessions fail, explicit selection is required and no foreign descriptor is removed

#### Scenario: Production closure moves outside the checkout
- **WHEN** the artifact is relocated with only production dependencies
- **THEN** JavaScript startup, selected native modules/workers, readiness and shutdown pass without CLI/compiler/tool fallback

### Requirement: Final isolation is a hard dependency gate
Stage 2 SHALL remove all temporary exceptions and reject unselected frontend, deployment, agent, auth/database, DuckDB, MCP, AG-UI and Scalar stacks in minimal/API consumers and runtime output. Numeric size/count budgets SHALL derive from measured results; noisy timing SHALL remain explained evidence without invented reduction promises.

#### Scenario: Final footprint is compared
- **WHEN** candidate and baseline use matching fixtures and measurement conditions
- **THEN** creator/development/production/inspector costs are reported separately and forbidden families hard-fail even if total size decreased

### Requirement: Final acceptance requires actual required environments
Required browser, Docker, native, scaffold, focused consumer and lifecycle checks SHALL execute with recorded commands/results before final acceptance. Skipped or blocked required checks SHALL remain incomplete. Local checks, hosted CI, publication and registry-consumer proof SHALL be distinguished; cloud spend and publication require separate authorization.

#### Scenario: Resource or prerequisite is unavailable
- **WHEN** a required environment cannot run safely
- **THEN** evidence records the exact limit, preserves prior failures and does not mark acceptance passed or start unapproved paid work

### Requirement: Existing readiness and state guarantees survive isolation
The active release-readiness functional/performance distinction, existing creation certification, durable semantics, state/history, Drizzle repair and explicitly selected frontend behavior SHALL remain intact. Dependency reduction SHALL NOT waive affected functional tests or rewrite historical evidence.

#### Scenario: Functional readiness passes but performance misses
- **WHEN** a measured start satisfies functional requirements but fails existing strict one-second performance certification
- **THEN** reports preserve both outcomes independently without inventing new timing thresholds or hiding the failed sample
