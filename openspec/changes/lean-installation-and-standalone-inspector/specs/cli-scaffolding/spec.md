## MODIFIED Requirements

### Requirement: Atomic destination creation

The generator SHALL validate package name/path, refuse a non-empty destination unless explicitly permitted, stage generation in a temporary sibling, perform requested install/Git and, after authorized installation, invoke the installed project CLI for doctor/check before final rename, and leave the destination unchanged on any pre-rename failure. Installed creation SHALL prepare a validated development snapshot from the successful check before rename. The snapshot SHALL remain usable after rename without rechecking unchanged source or retaining staging-directory paths. Installation-skipped creation SHALL report that preparation is pending and provide the documented post-install workflow.

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

#### Scenario: Creation skips installation
- **WHEN** --no-install is selected
- **THEN** the creator performs only supported rendering and filesystem transaction work, fetches no compiler, executes no generated application code and reports preparation pending

### Requirement: First-run workflow works as printed

After default generation, printed cd and bun dev commands SHALL serve the example GET /hello route and support documented test/check/build commands without starting an inspector UI or storage. OpenAPI SHALL remain available independently; API reference requires explicit selection. Backend Ready SHALL mean activated serving behavior. Explicit fullstack SHALL preserve its independent Next web workflow without repeating the validated backend check.

#### Scenario: New developer follows output

- **WHEN** the printed next commands are executed on a supported clean environment
- **THEN** the route returns the complete expected greeting within the functional deadline, is inspectable only after explicitly enabling and separately running inspection, and generated test/check/build scripts pass; the one-second performance target is evaluated separately on the recorded measurement host

#### Scenario: Inspector starts late

- **WHEN** an independently invoked inspector is still initializing after backend activation
- **THEN** the backend route is already callable and the standalone tool identifies its own startup without claiming its URL is ready

#### Scenario: Fullstack is created

- **WHEN** the developer runs the printed fullstack `bun dev` command
- **THEN** API `/hello` satisfies backend readiness independently of web-page compilation and the output distinguishes API and web readiness

### Requirement: Packed-artifact generator acceptance

Generator acceptance SHALL execute the packed package rather than workspace-linked source and SHALL prove generated projects install frozen, check, typecheck, test, build, start, serve the example route, verify core graph-serving readiness and expose rich graph inspection only when explicitly enabled, shut down, and contain deterministic files.

#### Scenario: Release candidate generator is packed

- **WHEN** the smoke suite invokes its tarball from a temporary parent directory
- **THEN** all selected option combinations pass the documented project commands without workspace resolution

### Requirement: Fixed project conventions and port precedence

CLI operations SHALL use fixed application/source/generated conventions and preserve application port precedence. Inspector bridge connection configuration SHALL be separate from standalone UI port selection; obsolete inspector.port SHALL be rejected. UI port defaults to 3210, while bridge defaults are 127.0.0.1 and port 0.

#### Scenario: Every application port source is present

- **WHEN** `--port`, `PORT`, `server.port`, and the default are available
- **THEN** the CLI uses `--port`

#### Scenario: Inspector environment override is present

- **WHEN** legacy `RELKIT_INSPECTOR_PORT` is set during ordinary backend development
- **THEN** it does not start a UI or reinterpret bridge configuration; documented standalone UI options control the tool address

### Requirement: Self-contained packaged development

Packed CLI development SHALL run the backend without a checkout, inspector distribution, Next/React, local history store or Node UI prerequisite. Optional enabled inspection SHALL acquire only a lightweight session bridge. The separately installed/run tool SHALL own UI/store processes; its absence, initialization or failure SHALL not affect healthy backend availability.

#### Scenario: Packed development starts outside the monorepo

- **WHEN** a generated project installs the packed CLI in a temporary directory and runs development
- **THEN** the backend and OpenAPI start and shut down without `RELKIT_INSPECTOR_ROOT`; separately selected reference and standalone inspector work only with their explicit requirements

#### Scenario: Port is occupied

- **WHEN** a requested backend or enabled bridge port cannot be bound
- **THEN** startup identifies the port and its applicable override without leaving failed owned child processes running
- **AND** a backend conflict fails startup without reporting backend Ready, while a bridge conflict reports its independent unavailability

#### Scenario: Inspector port is occupied

- **WHEN** the independently invoked tool's UI port cannot be bound
- **THEN** the standalone tool reports its port and override, the backend remains available, and the tool finalizes its own failed children

### Requirement: Doctor reports prerequisites safely

`relkit doctor` SHALL check supported Bun/TypeScript/package versions, Pulumi availability when enabled, AWS credential visibility without printing credentials, writable state directories, selected ports, config/app validity, and frozen-lock consistency.

#### Scenario: AWS credentials are missing

- **WHEN** deployment is enabled but credentials are not visible
- **THEN** doctor reports the missing prerequisite without printing any credential-like environment value

#### Scenario: Inspector tool is not requested
- **WHEN** doctor checks an ordinary backend workflow
- **THEN** unused inspector runtime prerequisites and UI ports are not checked

### Requirement: Agent template derives a tool from a function

The agent template SHALL expose one useful function through `asTool`, configure both `defaultProvider` and `defaultModel` with named model providers, explicitly install its selected native agent engine and use deterministic native test models outside production, and avoid a duplicate tool handler or wrapper module.

#### Scenario: Agent project is generated

- **WHEN** the generated agent handles a request that needs its tool
- **THEN** the selected native agent tool loop invokes the original function once through the common engine and the generated tests assert its validated result and trace

### Requirement: Packed task projects work without repository source

Generated projects SHALL contain published dependencies, config, task/job/domain source, submission route, generated-client use, tests, safe env examples, README and dev/check/test/typecheck/build/start scripts. Examples SHALL retain run IDs and idempotency keys for recovery and use simulated business services. Fresh account-free Docker restart SHALL preserve accepted work; existing minimal/api/agent templates SHALL remain valid.

#### Scenario: Fresh packed installation

- **WHEN** a new directory installs the packed release and follows its README
- **THEN** generation, checks, native local execution, watch and restart succeed, and explicitly enabled/separately run Inspector succeeds without unpublished exports or paid APIs

## ADDED Requirements

### Requirement: Creator and wrapper bootstrap remain lightweight
The creator SHALL own prompts, template rendering, filesystem transactions, package-manager choice and explicit install/Git choices without compiler-backed existing-project editing. The wrapper SHALL delegate creation without installing the full CLI and resolve other commands from the compatible project CLI without recursion or duplicate binaries.

#### Scenario: Direct and wrapped creation run through package runners
- **WHEN** supported bunx/npx versions invoke create-relkit and relkit create with equivalent options
- **THEN** both generate equivalent projects, preserve package-manager choice and diagnose missing Bun accurately without expanding backend runtime support

### Requirement: Existing-project edits retain compiler-backed transactions
Add/discovery/edit tooling SHALL remain CLI-owned and use existing AST analysis, transactional writes and checks. Creator exports SHALL NOT re-export heavy tooling or create a creator/tooling/CLI dependency cycle.

#### Scenario: A selected capability is added
- **WHEN** add plans an existing-project edit
- **THEN** the preview identifies selected package requirements and AST edits; unsupported source shapes and collisions fail before mutation, and existing rollback/lockfile protections remain effective

### Requirement: Starters install only selected requirements
Minimal/API starters SHALL include only actual core, development compiler/CLI, general testing and typechecking requirements. Agent and optional database/auth/cloud/jobs selections SHALL add their actual requirements. Inspector dependency/configuration SHALL be omitted unless selected; explicitly chosen frontend functionality SHALL be preserved.

#### Scenario: Database repair is relevant
- **WHEN** a scaffold selects the SDK requiring the current Drizzle patch
- **THEN** existing patch bytes, pins and portable transactional registration are preserved; an unselected SDK does not add that repair or its stack

### Requirement: Production start is independent of development CLI
Generated production scripts SHALL run NODE_ENV=production bun run --no-env-file .relkit/build/server/index.js using the emitted JavaScript entrypoint. The complete selected runtime artifact SHALL run after production-only installation and relocation without CLI/compiler/inspector or deployment-only packages; relkit start SHALL remain only convenience delegation.

#### Scenario: Production artifact is relocated
- **WHEN** the artifact and declared runtime closure move outside the workspace and development dependencies are absent
- **THEN** startup, selected native/worker assets, readiness and shutdown work using the documented path/environment contract without fallback to tooling

### Requirement: Historical inspection commands use the optional tool
Ordinary jobs/provider commands SHALL retain their application/provider paths and authorization without the UI/store. Historical inspection commands SHALL resolve the optional tool locally without implicit download. Initial standalone delivery SHALL not add a new relkit inspector alias.

#### Scenario: Historical tool is absent
- **WHEN** a user requests tool-owned history with no installed tool
- **THEN** guidance identifies the explicit installation/run action and no DuckDB or UI dependency is loaded by the core CLI
