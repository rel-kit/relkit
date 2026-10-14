## MODIFIED Requirements

### Requirement: Generated templates teach service composition

Every generated template SHALL use grouped service-first source layout and public service APIs within the actual RELKIT backend application root. The API and agent templates SHALL demonstrate public service functions, direct invocation, and applicable events/tools; the minimal template SHALL contain one small `hello` service without speculative integrations. Fullstack SHALL preserve its existing frontend/backend wrapper and apply the layout only within its RELKIT backend. Template maintenance SHALL NOT bypass existing public creation certification gates.

#### Scenario: API template is generated

- **WHEN** a developer creates a certified API template
- **THEN** its route maps to a public service function, nested calls use service members, and all source descriptors live beneath `src/services/<service>` or the routes/platform layers

#### Scenario: Minimal template is generated

- **WHEN** a developer creates the minimal template
- **THEN** it contains one service and one function under `src/services/hello` and does not scaffold empty categories, agents, events, database, or auth

#### Scenario: Fullstack template is exercised

- **WHEN** a fullstack candidate is validated or a certified fullstack tuple is created
- **THEN** grouped paths are relative to its existing backend application root and neither frontend organization nor wrapper launch behavior is changed by the service layout

## ADDED Requirements

### Requirement: Add commands preserve the selected application layout

All service-owned add operations SHALL use the same authored-evidence layout selection as compilation, keep valid flat applications flat, use grouped layout for empty applications, and reject mixed or ambiguous layouts before mutation. All remaining normative obligations below SHALL also hold.

#### Scenario: All normative obligations are evaluated

- **WHEN** implementation or final acceptance evaluates this requirement
- **THEN** all of the following remaining obligations hold:

Generic service selection SHALL exclude database/auth singletons; specialized scaffolds SHALL use their own service contracts in the selected layout. Existing public/internal defaults, route paths, and transactional add behavior SHALL remain unchanged. HTTP middleware SHALL remain under Routes without requiring service selection.

#### Scenario: Artifact is added to an existing application

- **WHEN** the same function add request targets valid flat and grouped orders applications
- **THEN** it creates the function beneath each application's selected orders root and updates the corresponding public boundary without changing the logical function identity

#### Scenario: Database or auth is added

- **WHEN** specialized scaffolding selects a supported dialect and creates or reuses its singleton services
- **THEN** schema, model, config, and auth route references use the selected layout without wrapping those services in generic `defineService` or running migrations

#### Scenario: Middleware is added or layout is mixed

- **WHEN** middleware is added to a valid application or any add command encounters mixed service evidence
- **THEN** middleware uses Routes without a service prompt, while mixed-layout additions fail before writing files

### Requirement: Layout migration starts with a read-only preview

The CLI SHALL provide `relkit migrate layout` as a read-only preview and require `--write` to apply the migration. All remaining normative obligations below SHALL also hold.

#### Scenario: All normative obligations are evaluated

- **WHEN** implementation or final acceptance evaluates this requirement
- **THEN** all of the following remaining obligations hold:

Preview SHALL report complete service-directory moves, resolvable import/re-export and alias rewrites, affected tooling/documentation paths, conflicts, unresolved references, and expected logical-identity preservation. Preview SHALL NOT modify project files, lockfiles, generated artifacts, runtime state, or resources. Mixed/invalid input SHALL produce actionable diagnostics. Already grouped valid applications SHALL return a no-op result.

#### Scenario: Flat application is previewed

- **WHEN** `relkit migrate layout` or its `--json` form examines a valid flat application
- **THEN** the deterministic plan identifies moves and rewrites while project contents and state remain unchanged

#### Scenario: Computed tooling path is found

- **WHEN** a reference affecting a proposed move cannot be rewritten reliably
- **THEN** preview identifies the source and manual action, and write mode refuses that unresolved plan without guessing a replacement

#### Scenario: Migration is repeated

- **WHEN** migration runs against an already grouped valid application
- **THEN** it reports no changes without generating new edits or rewriting unrelated files

### Requirement: Applied layout migration is coordinated and recoverable

Migration SHALL move complete service directories, keep Routes and Platform in place, apply syntax-aware source rewrites, and validate the staged application and logical compatibility before finalizing. All remaining normative obligations below SHALL also hold.

#### Scenario: All normative obligations are evaluated

- **WHEN** implementation or final acceptance evaluates this requirement
- **THEN** all of the following remaining obligations hold:

Write mode SHALL refuse destination conflicts, dirty tracked files in the touched set, changes since preview validation, and an identified active development session. Unrelated dirty files SHALL be preserved. Non-Git applications SHALL receive the same conflict, snapshot, and validation protections without requiring a repository. Migration SHALL record its exact edit set and support `relkit migrate layout --rollback <receipt>` with conflict checks. Failed validation or application SHALL restore touched bytes and modes, remove only newly created owned files, and preserve recoverable records if restoration itself fails.

Migration SHALL NOT move migration history, run migrations or seeds, modify credentials, rename provider profiles, change deployed resources, discard lockfiles, or delete `.relkit/` wholesale. Backups and recovery records SHALL remain local with restricted permissions; stdout and JSON SHALL expose paths/status rather than file contents or secrets. If a concurrent edit prevents safe restoration, migration SHALL preserve that edit, retain the recovery record, and report incomplete recovery rather than overwrite the edit or claim successful rollback.

#### Scenario: Staged application changes identity

- **WHEN** staged validation detects altered logical IDs, public contracts, authorization declarations, provider ownership, or deployment resource identities
- **THEN** migration fails without publishing the staged source to the application

#### Scenario: Write conflicts with user edits

- **WHEN** a touched tracked source is dirty, a destination already exists, or a planned input changes before publication
- **THEN** migration refuses without overwriting the conflict and reports the affected paths

#### Scenario: Publication fails partway through

- **WHEN** an injected failure occurs after some source edits have been applied and no concurrent edit conflicts with restoration
- **THEN** restoration returns touched sources to their original bytes and modes while preserving unrelated changes, lockfiles, state, journals, and observability records

#### Scenario: Rollback encounters a later edit

- **WHEN** rollback finds that a migration-owned output differs from the receipt's post-migration fingerprint
- **THEN** rollback refuses the conflicting restoration and reports manual recovery rather than overwriting the later edit

### Requirement: Migration results follow the CLI contract

Migration help, examples, completions, and generated reference SHALL share the existing command metadata. All remaining normative obligations below SHALL also hold.

#### Scenario: All normative obligations are evaluated

- **WHEN** implementation or final acceptance evaluates this requirement
- **THEN** all of the following remaining obligations hold:

JSON mode SHALL emit one structured result or failure with selected layout, moves/edits, warnings/conflicts, verification status, receipt location when applicable, and exact next steps. Usage failures SHALL exit 2, operational failures SHALL exit 1, and interruption SHALL exit 130 after owned cleanup. Migration SHALL recommend stopping development before coordinated changes and explain preparation of fresh generated artifacts after a successful move.

#### Scenario: Headless migration fails

- **WHEN** `relkit migrate layout --write --json` encounters a conflict or validation error
- **THEN** stdout contains one parseable failure object, no prompt or progress corrupts it, and the exit status follows the documented failure category
