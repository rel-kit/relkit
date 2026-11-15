## ADDED Requirements

### Requirement: Environment files on Node

Commands that run once and read application environment values (`db migrate`, `env check`, `env list`, `start`, `jobs`, `local`, `doctor`) SHALL read the same environment files on Node as on Bun, with values already present in the process environment taking precedence. `check` evaluates application code with an allow-listed environment on both runtimes and is not affected.

#### Scenario: Migration on Node with a dotenv file

- **WHEN** `relkit db migrate` runs on Node and `DATABASE_URL` is defined only in `.env`
- **THEN** the migration runs against that database

### Requirement: The Inspector starts from either runtime

The Inspector launcher SHALL start its interface on a real Node executable whether the launcher itself runs on Node, on Bun, or on Bun with `node` aliased to Bun, and SHALL fail with a coded message naming the missing Node executable when none is found.

#### Scenario: Launch through npm

- **WHEN** `npm run inspector` runs with no Bun installed
- **THEN** the Inspector reports that it is listening

#### Scenario: Launch with node aliased to Bun

- **WHEN** the launcher runs under Bun with `node` on `PATH` resolving to Bun
- **THEN** the interface process runs on a real Node, or the launcher fails with the coded message

### Requirement: Grandfathered runtime calls cannot hide in packages that declare Node

A package whose engines declare Node SHALL NOT have Bun call sites on the portability allow-list unless each entry names a reason and a runtime guard.

#### Scenario: A Node-declaring package keeps a Bun call on the allow-list

- **WHEN** the engines check runs
- **THEN** it fails and names the package and the call site

### Requirement: Runtime-only modules are diagnosed at the import

When application code imports a module that exists only on another runtime, `relkit check` SHALL report a coded diagnostic at the import statement that names the runtime needed and the alternatives.

#### Scenario: Bun-only driver evaluated on Node

- **WHEN** a service file imports a Bun-only database driver and `relkit check` runs on Node
- **THEN** one diagnostic points at that import line and says the module needs Bun
