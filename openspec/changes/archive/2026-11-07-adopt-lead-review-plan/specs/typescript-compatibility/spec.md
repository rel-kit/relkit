# Spec Delta

## Purpose

Defines which TypeScript versions RelKit supports for applications and for its own codebase, and how
type guarantees reach developers without editor-specific tooling.

## ADDED Requirements

### Requirement: Type guarantees through plain tsc

Every type-level guarantee RelKit gives applications SHALL be enforced by running the project's own
`tsc` with generated declaration files, without an editor plugin.

#### Scenario: Plugin disabled

- **WHEN** the editor plugin is removed from a project's tsconfig
- **THEN** `tsc` still reports the same route and context type errors

### Requirement: TypeScript 7 applications

Applications SHALL be able to type-check with TypeScript 7 or 5.9, and `relkit check`, `relkit add`
and `relkit migrate` SHALL work with either.

#### Scenario: App on TypeScript 7

- **WHEN** a generated app's TypeScript dependency is TypeScript 7
- **THEN** `tsc`, `relkit check` and `relkit add function` succeed

### Requirement: Check uses the project's compiler

`relkit check` SHALL type-check by running the project's installed TypeScript compiler as a separate
process, and SHALL report its errors as RelKit diagnostics.

#### Scenario: Type error is reported

- **WHEN** a handler has a type error
- **THEN** `relkit check` reports it with file, line and the compiler's message

### Requirement: Optional editor plugin

The editor plugin SHALL be optional and SHALL only add conveniences such as quick fixes; removing it
SHALL NOT change any check result.

#### Scenario: Editor without plugin support

- **WHEN** an editor that cannot load TypeScript plugins opens a RelKit project
- **THEN** every RelKit type error still appears through the normal TypeScript language service

### Requirement: RelKit builds with TypeScript 7

The RelKit repository SHALL type-check and build with TypeScript 7. Features that parse source with
the TypeScript 5 JavaScript API SHALL use a private dependency that does not constrain the
application's TypeScript version.

#### Scenario: Repository CI on TypeScript 7

- **WHEN** CI type-checks the workspace
- **THEN** it runs TypeScript 7 and passes

### Requirement: TypeScript matrix

CI SHALL type-check generated applications with TypeScript 5.9 and with TypeScript 7.

#### Scenario: Regression on one version

- **WHEN** generated declarations fail only on TypeScript 7
- **THEN** the TypeScript 7 job fails before merge
