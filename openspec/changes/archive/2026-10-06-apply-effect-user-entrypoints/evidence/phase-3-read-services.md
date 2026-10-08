# Read service implementation evidence

Author: coordinator. Independent reviewer: native-gate author (separate read-service review). This slice is integrated in the candidate; combined CLI invocation, package-wide acceptance and synchronization remain open.

## Complete coverage

Eighteen source files: commands/env.ts, env-support.ts, env-format.ts, env.types.ts, env-project.service.ts, env-project.types.ts, env.schemas.ts, graph.ts, graph-support.ts, graph-file.service.ts, graph.types.ts, graph-error.ts, graph.schemas.ts, ports.ts, ports.types.ts, port-availability.ts, port-availability.service.ts, port-availability.types.ts.

Three complete deterministic test/type-probe files: tests/read-services/domain.test.ts, test-files.ts, type-probes.test.ts.

Total **21 TypeScript files**. Pure render/parsers and public error constructors are retained. Filesystem/module/project/port authority is explicit through CliEnvironmentProject, CliGraphFiles and CliPortProbe; public Promise edges compose shared runners. No standalone helper starts a nested runtime in its native Effect core.

## Behavior and lifetime

Graph root validation uses Schema and the existing full validator before the single documented ApplicationGraph assertion. Diff reads remain ordered to preserve primary error precedence. Original graph error constructors, codes, text and output remain intact.

Environment opaque module identity is preserved; owner validation rejects invalid declarations before command use. Safe projections exclude secret values. Preview does not write; explicit example writing respects path containment. Generic status projections retain concrete EnvDef<Shape> contracts.

Port probes own Bun listeners with acquireRelease and stop before reporting availability. Native occupied-port diagnostics use bounded subprocess output. Original stop failures remain defects/public causes; ephemeral zero and port precedence are retained.

Each independently callable service operation uses shared CLI observation with fixed labels, never secret values or paths as labels. Cache/RcMap/long-lived fibers are unsuitable for these finite read/probe operations.

## Actual verification

- `rtk bunx vitest run packages/cli/tests/read-services --maxWorkers=1`: **8/8 passed**, including six deterministic service/telemetry scenarios and two strict compiler-probe suites.
- Strict test-body compilation with skipLibCheck:false, exactOptionalPropertyTypes and noUncheckedIndexedAccess: passed after preserving generic concrete EnvShape status contracts.
- Existing environment/ports/probe tests: **5/5 passed**.
- Existing CLI command-protocol tests: **4/4 passed**, including graph hash/output failures and environment safe projection.
- Strict negative probes retain missing-service and layer-authority failures and reject mutated erased requirements. Three documented service examples compile.
- Independent reviewer read all 21 files to EOF and reran 8/8. Minor missing @typeParam Shape documentation corrected. FileSystem test double was later extended with unexpected writeExclusive/chmod defaults for the local-service adapter expansion; this supporting delta requires final rereview.

Vendor core references are missing as recorded in runtime evidence; installed 4.0.1 Schema.declare, acquireRelease, Scope/Layer/Ref implementations and examples were inspected. No vendor source changed.
