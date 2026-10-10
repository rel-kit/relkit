## MODIFIED Requirements

### Requirement: Supported non-interactive options

The generator SHALL resolve template `minimal|api|agent|fullstack`, cloud `aws|none`, deploy `pulumi|none`, certified jobs selections, install, Git, examples, directory, explicit empty-directory override, and JSON flags, and SHALL expose no persistence or identity flags. Every offered runtime-affecting combination SHALL have current passing generated-development readiness evidence. Unsupported, failing, or uncertified combinations SHALL be hidden from interactive creation and rejected by both creation entrypoints when explicitly requested, before destination mutation or installation. Failure of the default minimal combination SHALL block shipment.

#### Scenario: Agent template without install is selected

- **WHEN** a caller uses a certified `--template agent --no-install --json` combination
- **THEN** deterministic files are generated, installation is skipped, and the machine-readable result reports installation, checking, snapshot preparation, and development next steps

#### Scenario: A combination misses the readiness gate

- **WHEN** a valid candidate combination has any required start at or above 500 ms, missing evidence, or stale evidence
- **THEN** interactive choices omit that combination and explicit flags produce a usage diagnostic identifying it before any generation work

#### Scenario: Interactive partial choices would permit a rejected tuple

- **WHEN** the developer has selected some runtime-affecting choices
- **THEN** later choices only permit tuples in the same certified capability set used by headless resolution

### Requirement: Atomic destination creation

The generator SHALL validate package name/path, refuse a non-empty destination unless explicitly permitted, stage generation in a temporary sibling, perform requested install/Git plus project doctor/check before final rename, and leave the destination unchanged on any pre-rename failure. Installed creation SHALL prepare a validated development snapshot from the successful check before rename. The snapshot SHALL remain usable after rename without rechecking unchanged source or retaining staging-directory paths. Installation-skipped creation SHALL report that preparation is pending and provide the documented post-install workflow.

#### Scenario: Project check fails during generation

- **WHEN** a staged template cannot pass its required validation
- **THEN** generation exits non-zero, removes or reports the temporary directory safely, and leaves no partial destination

#### Scenario: Non-empty destination is supplied

- **WHEN** the destination contains files and no explicit empty-directory override is valid
- **THEN** the generator refuses before modifying either existing files or package state

#### Scenario: Preparation fails or is cancelled

- **WHEN** installed creation cannot publish its valid portable snapshot before rename
- **THEN** the operation fails or reports cancellation after owned cleanup and leaves the destination unchanged

#### Scenario: Staged project becomes its final destination

- **WHEN** installed creation atomically renames the successfully prepared project
- **THEN** the first `bun dev` serves the correct backend response using the relocated snapshot without another full check or startup bundle

### Requirement: First-run workflow works as printed

After successful default generation, the printed `cd` and `bun dev` commands SHALL serve the example `GET /hello` route, start the inspector independently, expose OpenAPI and API reference, and allow documented test/check/build commands to succeed. Backend Ready SHALL only describe an activated serving backend. Inspector readiness SHALL be reported separately after its own successful probe. The generated fullstack workflow SHALL serve API `/hello` within the backend target while its Next web page starts independently; its `dev` script SHALL not repeat the already validated project check before API launch.

#### Scenario: New developer follows output

- **WHEN** the printed next commands are executed on a supported clean environment
- **THEN** the route returns the expected greeting in less than 500 ms on the reference host, appears in the eventually ready inspector and API reference, and generated test/check/build scripts pass

#### Scenario: Inspector starts late

- **WHEN** the inspector is still initializing after backend activation
- **THEN** the backend route is already callable and output identifies inspector startup without claiming its URL is ready

#### Scenario: Fullstack is created

- **WHEN** the developer runs the printed fullstack `bun dev` command
- **THEN** API `/hello` satisfies backend readiness independently of web-page compilation and the output distinguishes API and web readiness

### Requirement: Self-contained packaged development

The packed CLI SHALL include or resolve a compatible prebuilt inspector without requiring a repository checkout, while allowing an explicit contributor-only inspector-root override. Backend availability SHALL be independent of inspector initialization or failure, with each component's availability reported accurately.

#### Scenario: Packed development starts outside the monorepo

- **WHEN** a generated project installs the packed CLI in a temporary directory and runs development
- **THEN** the backend, inspector, OpenAPI, and API reference start and shut down without `RELKIT_INSPECTOR_ROOT`

#### Scenario: Port is occupied

- **WHEN** a requested backend or inspector port cannot be bound
- **THEN** startup identifies the port and its applicable override without leaving failed owned child processes running
- **AND** a backend conflict fails startup without reporting backend Ready, while an inspector conflict reports its independent unavailability

#### Scenario: Inspector port is occupied

- **WHEN** the requested inspector port cannot be bound
- **THEN** a safe inspector-unavailable diagnostic identifies the port and override, the serving backend remains available, and no failed inspector child is orphaned

## ADDED Requirements

### Requirement: Post-install development preparation

`relkit dev --prepare` SHALL perform finite snapshot preparation without opening a development listener or inspector. It SHALL reuse a current successful development-check receipt or perform full validation before publication. `--no-install` next steps SHALL provide `bun install`, `bun run check`, `bunx --no-install relkit dev --prepare`, and `bun dev` in order, with local executable resolution and no implicit package download.

#### Scenario: Installation was skipped

- **WHEN** the developer follows the printed post-install workflow in a generated project
- **THEN** preparation exits successfully without a running server and the subsequent unchanged `bun dev` qualifies for the same readiness target

#### Scenario: Source becomes invalid before preparation

- **WHEN** a previously checked project changes before preparation
- **THEN** the stale check receipt is rejected, full checking reports the error, and no new activatable snapshot is published
