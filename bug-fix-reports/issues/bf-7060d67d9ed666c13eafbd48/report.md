# bf-7060d67d9ed666c13eafbd48: Annotated ServiceRouteOptions falsely reject a valid explicit path mapping.

Status: **verified**
Attempt: 1 · Updated: 2026-10-01T11:17:45+00:00

## What

Annotated ServiceRouteOptions falsely reject a valid explicit path mapping.

## Expected

An explicit mapping from the filename id to the function value input passes both route contracts and compiler checks.

## Observed before

The actual relkit check subprocess exits 1 with TS2344 and RELKIT_ROUTE_MODULE_TYPE; the corresponding type regression also fails.

## Root cause

packages/routes/src/define-service-routes.types.ts:45-49 requires a request property while ServiceRouteOptions declares it optional, dropping its request mapping type to undefined.

## Fixed by

Infer EntryRequest from the public optional request property and include undefined in the constraint, preserving explicitly undefined requests. Focused type, installed declaration, editor, CLI graph/activation and failure-preservation regressions pass.

## Changed files

- packages/routes/src/define-service-routes.types.ts
- tests/types/route-path-input.ts
- tests/compiler/route-path-types.test.ts
- packages/cli/route-review-regressions.test.ts

## Reproduction

- Generate a minimal project, define users.example with value input, and use ServiceRouteOptions with http.input({ value: http.path("id") }) at src/routes/users/[id]/route.ts.
- Run the assertion-bearing CLI regression against the original implementation; retain its failing output before editing application code.

## Evidence

- before: [unit](evidence/001/unit-before.txt) — The path-input type fixture accepts explicitly mapped ServiceRouteOptions and continues rejecting absent and explicit undefined requests for undeclared id inputs.
- before: [integration](evidence/001/runtime-before.txt) — A generated project's actual CLI accepts annotated mapping from id to value, writes that mapping into the graph, rejects missing inferred id input, and preserves the prior runtime manifest after rejection.
- after: [unit](evidence/001/unit-after.txt) — The path-input type fixture accepts explicitly mapped ServiceRouteOptions and continues rejecting absent and explicit undefined requests for undeclared id inputs.
- after: [integration](evidence/001/runtime-after.txt) — A generated project's actual CLI accepts annotated mapping from id to value, writes that mapping into the graph, rejects missing inferred id input, and preserves the prior runtime manifest after rejection.
- after: [integration](evidence/001/adjacent-tests.txt) — Installed public route declarations, actual packaged editor diagnostics/code fixes and Node/TypeScript plugin loading remain correct; 16 tests pass.
- after: [integration](evidence/001/compiler-regressions.txt) — Existing discovery, inference, prefilter and required/catch-all input behavior remains correct; 22 tests pass.

## Scope

```json
{
  "modules": [
    "ServiceRoutesResult",
    "RouteModuleContract",
    "compiler path diagnostics",
    "relkit check",
    "TypeScript editor"
  ],
  "entrypoints": [
    "relkit check",
    "TypeScript language service"
  ],
  "invariants": [
    "An explicit mapping from the filename id to the function value input passes both route contracts and compiler checks.",
    "Invalid actual route exports and undeclared inferred path inputs still prevent activation."
  ]
}
```

## Environment

```json
{
  "package": "packages/routes, packages/compiler, packages/cli",
  "revision": "9870d832cbb75e70a81f88f0f119058db6fcbde7 (user's uncommitted review changes plus these three scoped implementation fixes and five regression test files)",
  "target": "Local Bun 1.3.10 generated-project CLI with workspace packages and packaged CommonJS editor; TypeScript 5.9.3 and the existing TypeScript 6 compatibility harness",
  "api_exposed": false,
  "e2e_available": true,
  "monitoring": "Compiler owns Effect trace/metric instrumentation; the CLI authoring checks do not expose an HTTP API or configure an external error-tracker sink. Actual relkit check JSON diagnostics, graph, activation state and runtime-manifest read-back were inspected for the replayed fixtures."
}
```

## Verification

```json
{
  "unit": {
    "before": {
      "status": "failed",
      "command": "rtk proxy bun x tsc -p tests/types/tsconfig.json --noEmit --pretty false",
      "cwd": ".",
      "exit_code": 2,
      "assertion": "The path-input type fixture accepts explicitly mapped ServiceRouteOptions and continues rejecting absent and explicit undefined requests for undeclared id inputs.",
      "output": "evidence/001/unit-before.txt"
    },
    "after": {
      "status": "passed",
      "command": "rtk proxy bun x tsc -p tests/types/tsconfig.json --noEmit --pretty false",
      "cwd": ".",
      "exit_code": 0,
      "assertion": "The path-input type fixture accepts explicitly mapped ServiceRouteOptions and continues rejecting absent and explicit undefined requests for undeclared id inputs.",
      "output": "evidence/001/unit-after.txt"
    }
  },
  "runtime": {
    "kind": "integration",
    "reason": "These defects concern route authoring and compiler/editor validation, whose real boundary is the CLI and language service; there is no HTTP API for this workflow.",
    "boundary": "Fresh generated project -> built CLI subprocess -> public TypeScript contracts -> actual discovery/compiler -> graph and runtime-manifest activation",
    "dependencies": [
      "Actual generated project, Bun CLI process, built compiler/routes/app packages and TypeScript",
      "Real local filesystem and root node_modules symlink; no compiler or authoring stubs",
      "No cloud, database, Docker or network service is involved in these authoring failures"
    ],
    "steps": [
      "Generate a fresh minimal project with no install and no Git initialization; attach real workspace node_modules.",
      "Create the semantic route fixture and run the built CLI check --json subprocess.",
      "Assert diagnostic and activation outcomes; read the persisted graph and/or generated route contracts.",
      "Replace with a genuinely invalid application route; assert rejection and preservation of the last valid runtime manifest."
    ],
    "before": {
      "status": "failed",
      "command": "rtk proxy bun test packages/cli/route-review-regressions.test.ts -t 'annotated explicit path mappings'",
      "cwd": ".",
      "exit_code": 1,
      "assertion": "A generated project's actual CLI accepts annotated mapping from id to value, writes that mapping into the graph, rejects missing inferred id input, and preserves the prior runtime manifest after rejection.",
      "output": "evidence/001/runtime-before.txt"
    },
    "after": {
      "status": "passed",
      "command": "rtk proxy bun test packages/cli/route-review-regressions.test.ts -t 'annotated explicit path mappings'",
      "cwd": ".",
      "exit_code": 0,
      "assertion": "A generated project's actual CLI accepts annotated mapping from id to value, writes that mapping into the graph, rejects missing inferred id input, and preserves the prior runtime manifest after rejection.",
      "output": "evidence/001/runtime-after.txt"
    }
  },
  "e2e": {
    "status": "passed",
    "command": "rtk proxy bun test packages/cli/route-review-regressions.test.ts -t 'annotated explicit path mappings'",
    "cwd": ".",
    "exit_code": 0,
    "assertion": "A generated project's actual CLI accepts annotated mapping from id to value, writes that mapping into the graph, rejects missing inferred id input, and preserves the prior runtime manifest after rejection.",
    "output": "evidence/001/runtime-after.txt"
  },
  "regressions": [
    {
      "kind": "integration",
      "boundary": "Generated project CLI -> accepted graph -> rejected changed route -> retained runtime manifest",
      "status": "passed",
      "command": "rtk proxy bun test packages/cli/route-review-regressions.test.ts -t 'annotated explicit path mappings'",
      "cwd": ".",
      "exit_code": 0,
      "assertion": "A generated project's actual CLI accepts annotated mapping from id to value, writes that mapping into the graph, rejects missing inferred id input, and preserves the prior runtime manifest after rejection.",
      "output": "evidence/001/runtime-after.txt"
    },
    {
      "kind": "integration",
      "boundary": "Installed declarations -> TypeScript route contracts -> packaged editor/plugin resolver",
      "status": "passed",
      "command": "rtk proxy bun test tests/compiler/route-path-types.test.ts tests/compiler/route-module-types.test.ts tests/compiler/route-module-exclusions.test.ts packages/cli/editor.test.ts packages/cli/editor-compatibility.test.ts",
      "cwd": ".",
      "exit_code": 0,
      "assertion": "Valid literal/annotated mappings have no diagnostics; absent/undefined path mappings and invalid real exports fail; excluded fixtures have no plugin errors; unsaved code fixes and alternate TypeScript plugin loading recover correctly.",
      "output": "evidence/001/adjacent-tests.txt"
    },
    {
      "kind": "integration",
      "boundary": "Discovery and route normalization -> input schema -> request inference",
      "status": "passed",
      "command": "rtk proxy bun test tests/compiler/route-path-input.test.ts tests/compiler/route-file-discovery.test.ts tests/compiler/route-file.test.ts tests/compiler/route-inference.test.ts tests/compiler/ast-prefilter.test.ts",
      "cwd": ".",
      "exit_code": 0,
      "assertion": "Actual named methods, dynamic/catch-all path inputs, explicit overrides, reserved paths, collision handling and default source exclusions preserve their existing outcomes.",
      "output": "evidence/001/compiler-regressions.txt"
    }
  ],
  "checks": [
    {
      "name": "affected package build",
      "status": "passed",
      "command": "rtk proxy bun x tsc -b packages/routes packages/compiler packages/cli --pretty false",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/package-build.txt"
    },
    {
      "name": "packaged editor build",
      "status": "passed",
      "command": "rtk proxy bun run scripts/package-editor.ts",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/editor-build.txt"
    },
    {
      "name": "root typecheck and canonical commerce compilation",
      "status": "passed",
      "command": "rtk proxy bun run typecheck",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/typecheck.txt"
    },
    {
      "name": "lint",
      "status": "passed",
      "command": "rtk proxy bun run lint",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/lint.txt"
    },
    {
      "name": "routes unit suite",
      "status": "passed",
      "command": "rtk proxy bun x vitest run --config packages/routes/vitest.config.ts",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/routes-tests.txt"
    },
    {
      "name": "changed-file formatting",
      "status": "passed",
      "command": "rtk proxy bun x prettier --check packages/routes/src/define-service-routes.types.ts packages/compiler/src/route-source-checks.ts packages/compiler/src/route-module-checks.ts tests/types/route-path-input.ts tests/compiler/route-path-types.test.ts tests/compiler/route-module-exclusions.test.ts packages/cli/route-review-regressions.test.ts packages/cli/editor.test.ts",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/format.txt"
    },
    {
      "name": "diff whitespace",
      "status": "passed",
      "command": "rtk proxy git diff --check",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/diff-check.txt"
    },
    {
      "name": "repository boundary check",
      "status": "pre-existing",
      "command": "rtk proxy bun run check",
      "cwd": ".",
      "exit_code": 1,
      "baseline_exit_code": 1,
      "baseline": "evidence/001/root-check-before.txt",
      "output": "evidence/001/root-check-after.txt",
      "reason": "Both original and fixed implementations fail on the same packages/compiler/coverage/coverage-final.json:20:3029 out-of-scope-navigation-name finding; this existing coverage output was not modified."
    },
    {
      "name": "phase 0 guardrails",
      "status": "pre-existing",
      "command": "rtk proxy bun test tests/phase0.test.ts",
      "cwd": ".",
      "exit_code": 1,
      "baseline_exit_code": 1,
      "baseline": "evidence/001/guardrails-before.txt",
      "output": "evidence/001/guardrails.txt",
      "reason": "Original implementation restored for baseline: 26 tests pass and package-export smoke fails. The fixed implementation has the identical 26-pass/1-fail outcome. The nested smoke command fails before building on the existing unsupported export map in packages/events."
    },
    {
      "name": "export smoke failure diagnosis",
      "status": "pre-existing",
      "command": "rtk proxy bun run scripts/pack-and-smoke-exports.ts",
      "cwd": ".",
      "exit_code": 1,
      "baseline_exit_code": 1,
      "baseline": "evidence/001/exports-before.txt",
      "output": "evidence/001/exports-check.txt",
      "reason": "Both original and fixed implementations fail in assertPackageManifest with Unsupported export map in packages/events. The events manifest and the export-map checker were not changed by these fixes."
    }
  ],
  "limitations": [
    "Full test:all/prepush and unrelated app/browser/cloud/Docker acceptance were not run; focused package builds and the real compiler-authoring CLI/editor boundary were verified.",
    "Two broader repository checks retain independently reproduced existing failures: compiler coverage scope scanning and the events export map.",
    "No external monitoring sink is configured for this local CLI replay; actual JSON diagnostics and graph/manifest state provide behavioral evidence."
  ]
}
```

## Related reports

```json
[
  "bf-cf7dd657070a0c1bc95c3060"
]
```

## Notes

```json
[
  "Both defects were reproduced through the actual CLI and focused failing regressions before application edits; original before artifacts are retained.",
  "Before/after use fresh equivalent generated projects with actual modules. Rejection cases leave the previous runtime manifest unchanged.",
  "A parallel CLI replay initially collided in workspace template packaging; that output is retained separately and final CLI replays were completed successfully.",
  "The original three implementation edits were temporarily restored only to capture the pre-existing phase0/export-check baseline, then reapplied and rebuilt. Final unit, CLI, editor and type checks ran against the final source.",
  "Changed-file formatting and whitespace checks pass; no staging, commits, pushes, resets or cloud operations were performed.",
  "75 focused tests pass: 35 routes, 16 compiler/editor, 22 compiler discovery/inference and 2 real CLI scenarios. Phase0 additionally passes 26 cases with its pre-existing export-smoke failure."
]
```
