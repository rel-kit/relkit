## MODIFIED Requirements

### Requirement: Supported non-interactive options

The generator SHALL resolve template `minimal|api|agent|fullstack`, cloud `aws|none`, deploy `pulumi|none`, certified jobs selections, install, Git, examples, directory, explicit empty-directory override, and JSON flags, and SHALL expose no persistence or identity flags. Every offered runtime-affecting combination SHALL have current passing generated-development functional readiness evidence with separately reported one-second performance results. Unsupported, failing, or uncertified combinations SHALL be hidden from interactive creation and rejected by both creation entrypoints when explicitly requested, before destination mutation or installation. Failure of the default minimal combination SHALL block shipment.

#### Scenario: Agent template without install is selected

- **WHEN** a caller uses a certified `--template agent --no-install --json` combination
- **THEN** deterministic files are generated, installation is skipped, and the machine-readable result reports installation, checking, snapshot preparation, and development next steps

#### Scenario: A combination misses the readiness gate

- **WHEN** a valid candidate combination has a failed required functional start, missing evidence, or stale evidence
- **THEN** interactive choices omit that combination and explicit flags produce a usage diagnostic identifying it before any generation work

#### Scenario: Interactive partial choices would permit a rejected tuple

- **WHEN** the developer has selected some runtime-affecting choices
- **THEN** later choices only permit tuples in the same certified capability set used by headless resolution

### Requirement: First-run workflow works as printed

After successful default generation, the printed `cd` and `bun dev` commands SHALL serve the example `GET /hello` route, start the inspector independently, expose OpenAPI and API reference, and allow documented test/check/build commands to succeed. Backend Ready SHALL only describe an activated serving backend. Inspector readiness SHALL be reported separately after its own successful probe. The generated fullstack workflow SHALL serve API `/hello` within the backend target while its Next web page starts independently; its `dev` script SHALL not repeat the already validated project check before API launch.

#### Scenario: New developer follows output

- **WHEN** the printed next commands are executed on a supported clean environment
- **THEN** the route returns the complete expected greeting within the functional deadline, appears in the eventually ready inspector and API reference, and generated test/check/build scripts pass; the one-second performance target is evaluated separately on the recorded measurement host

#### Scenario: Inspector starts late

- **WHEN** the inspector is still initializing after backend activation
- **THEN** the backend route is already callable and output identifies inspector startup without claiming its URL is ready

#### Scenario: Fullstack is created

- **WHEN** the developer runs the printed fullstack `bun dev` command
- **THEN** API `/hello` satisfies backend readiness independently of web-page compilation and the output distinguishes API and web readiness
