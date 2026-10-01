# bf-d0338e2c65acaba818e3a3e7: The live demo editor does not report a users/[id] route whose target input omits id, although check and typecheck reject it.

Status: **unverified**
Attempt: 1 · Updated: 2026-10-01T09:56:39+00:00

## What

The live demo editor does not report a users/[id] route whose target input omits id, although check and typecheck reject it.

## Expected

The configured editor loads the RELKIT plugin and reports missing path input on GET in the route file; restoring id or using an explicit mapping clears the error.

## Observed before

The actual demo's CLI emitted TS2344, RELKIT_MAPPING_INCOMPATIBLE and RELKIT_ROUTE_MODULE_TYPE. The live editor still used bundled TypeScript 6.0.3 and showed no route error. A fresh bundled server without project plugin probes also returned no diagnostics. When loaded under TypeScript 6, the old plugin additionally misinterpreted numeric type flags and missed the specific id diagnostic.

## Root cause

VS Code's TypeScript plugin resolver searches its own installation/plugin probe roots, and typescript.tsdk only offers a workspace SDK rather than activating it. Separately, packages/compiler/src/route-path-input-checks.ts used its imported TypeScript 5.9 TypeFlags.Never against editor TypeScript 6 types; Never changed from 131072 to 262144, so an undefined request was mistaken for an explicit mapping. Other source/module checks also used imported flags/guards rather than the host API.

## Fixed by

The CLI plugin now passes modules.typescript into shared source/module/path-input checks, including flags and AST guards. Rebuilt compiler and editor bundles; verified the packaged plugin under workspace 5.9 and editor 6.0.3, including unsaved missing/valid input, explicit mapping and malformed export recovery. A fresh real tsserver emits the expected error against the actual demo. Live editor activation remains unverified: the window still showed the bundled SDK and the user reported no error. Selected SDK confirmation is pending.

## Changed files

- packages/cli/src/editor.ts
- packages/compiler/src/route-source-checks.ts
- packages/compiler/src/route-module-diagnostics.ts
- packages/compiler/src/route-path-input-checks.ts
- packages/cli/editor-compatibility.test.ts
- docs/records/route-module-type-safety.md

## Reproduction

- Remove id from the demo function's input, retaining a correctly destructured users/[id] route.
- Run bun run check and typecheck: both reject the missing id.
- Launch bundled editor tsserver with the same app and no project plugin search path: semanticDiagnosticsSync returns no route errors.
- Run packaged plugin regression with actual installed TypeScript 6: the pre-fix plugin fails the missing-id assertion.
- Replay with the rebuilt plugin and workspace SDK or an explicit project probe in a fresh server: the actual route returns RELKIT diagnostic 99001 at line 4 column 16.

## Evidence

- before: [unit](evidence/001/compatibility-unit-before.txt) — Packaged plugin failed missing-id assertion under actual installed TypeScript 6.
- before: [integration](evidence/001/runtime-before.txt) — Actual bundled tsserver returned no diagnostics because the app plugin was not found.
- after: [unit](evidence/001/compatibility-unit-after.txt) — TypeScript 6 missing-id, recovery, explicit mapping and malformed-export assertions pass.
- after: [integration](evidence/001/runtime-workspace-after.txt) — Fresh actual workspace server loads project plugin and flags the demo route.
- after: [integration](evidence/001/runtime-typescript6-after.txt) — Fresh actual bundled TypeScript 6 server with a project probe flags the same route.

## Scope

```json
{
  "modules": [
    "Packaged CLI editor plugin",
    "Compiler shared route checks",
    "TypeScript server plugin resolver"
  ],
  "entrypoints": [
    "Route semantic diagnostics in TypeScript language service",
    "VS Code TypeScript version selection"
  ],
  "invariants": [
    "Use the editor's own type flags and syntax guards",
    "Missing inferred path id produces a precise route diagnostic",
    "Valid input and explicit mapping produce no RELKIT error",
    "Malformed table exports remain rejected"
  ]
}
```

## Environment

```json
{
  "package": "@relkit/cli and @relkit/compiler",
  "revision": "9870d832cbb75e70a81f88f0f119058db6fcbde7 plus preserved staged work and current local patch",
  "target": "Actual relkit-demo-4 route, workspace TypeScript 5.9.3 and installed VS Code Insiders TypeScript 6.0.3",
  "api_exposed": false,
  "e2e_available": true,
  "monitoring": "Observed VS Code SDK status and tsserver process arguments. Existing tsserver logging was off for these processes. No external tracker relevant to the compiler/editor boundary."
}
```

## Verification

```json
{
  "unit": {
    "before": {
      "status": "failed",
      "command": "rtk env RELKIT_EDITOR_TYPESCRIPT_PATH='/Applications/Visual Studio Code - Insiders.app/Contents/Resources/app/extensions/node_modules/typescript/lib/typescript.js' bun test packages/cli/editor-compatibility.test.ts",
      "cwd": ".",
      "exit_code": 1,
      "assertion": "Packaged plugin reports missing inferred id and recovers after input correction",
      "output": "evidence/001/compatibility-unit-before.txt"
    },
    "after": {
      "status": "passed",
      "command": "rtk env RELKIT_EDITOR_TYPESCRIPT_PATH='/Applications/Visual Studio Code - Insiders.app/Contents/Resources/app/extensions/node_modules/typescript/lib/typescript.js' bun test packages/cli/editor-compatibility.test.ts",
      "cwd": ".",
      "exit_code": 0,
      "assertion": "Packaged plugin reports missing inferred id and recovers after input correction",
      "output": "evidence/001/compatibility-unit-after.txt"
    }
  },
  "runtime": {
    "kind": "integration",
    "reason": "The owning workflow is an editor semantic diagnostic; no HTTP API exposes it.",
    "boundary": "Real tsserver protocol -> app tsconfig/declarations -> project plugin -> route input diagnostics",
    "dependencies": [
      "Actual installed workspace/bundled TypeScript servers and actual demo source/declarations",
      "Fresh server processes; not the user's existing UI session",
      "Explicit project probe used only in the TypeScript 6 compatibility replay"
    ],
    "steps": [
      "Open the actual dynamic route through tsserver protocol",
      "Request semanticDiagnosticsSync",
      "Assert missing-id diagnostic 99001"
    ],
    "before": {
      "status": "failed",
      "command": "rtk bun /tmp/relkit-editor-diagnostic-repro.ts",
      "cwd": ".",
      "exit_code": 1,
      "assertion": "Actual demo route produces missing-id semantic diagnostic",
      "output": "evidence/001/runtime-before.txt"
    },
    "after": {
      "status": "passed",
      "command": "rtk bun /tmp/relkit-editor-diagnostic-repro.ts --workspace",
      "cwd": ".",
      "exit_code": 0,
      "assertion": "Actual demo route produces missing-id semantic diagnostic",
      "output": "evidence/001/runtime-workspace-after.txt"
    }
  },
  "e2e": {
    "status": "passed",
    "command": "rtk bun /tmp/relkit-editor-diagnostic-repro.ts --workspace",
    "cwd": ".",
    "exit_code": 0,
    "assertion": "Fresh real workspace tsserver loads the packaged plugin and diagnoses the actual app route",
    "output": "evidence/001/runtime-workspace-after.txt"
  },
  "regressions": [
    {
      "kind": "integration",
      "boundary": "Actual bundled TypeScript 6 tsserver -> packaged plugin -> actual demo",
      "status": "passed",
      "command": "rtk bun /tmp/relkit-editor-diagnostic-repro.ts --probe",
      "cwd": ".",
      "exit_code": 0,
      "assertion": "Specific missing-id diagnostic is emitted using editor TypeScript 6 flags",
      "output": "evidence/001/runtime-typescript6-after.txt"
    },
    {
      "kind": "integration",
      "boundary": "Host language service -> unsaved function and route edits -> packaged plugin",
      "status": "passed",
      "command": "rtk env RELKIT_EDITOR_TYPESCRIPT_PATH='/Applications/Visual Studio Code - Insiders.app/Contents/Resources/app/extensions/node_modules/typescript/lib/typescript.js' bun test packages/cli/editor-compatibility.test.ts",
      "cwd": ".",
      "exit_code": 0,
      "assertion": "Valid input and explicit renamed mapping clear errors; malformed method-table export is still rejected",
      "output": "evidence/001/compatibility-unit-after.txt"
    },
    {
      "kind": "integration",
      "boundary": "Packaged Node plugin loader, workspace language service, generated route contracts",
      "status": "passed",
      "command": "rtk bun test packages/cli/editor.test.ts packages/cli/editor-compatibility.test.ts tests/compiler/route-path-types.test.ts tests/compiler/route-module-types.test.ts",
      "cwd": ".",
      "exit_code": 0,
      "assertion": "Existing route module contracts, plugin resolver and code fixes remain correct",
      "output": "evidence/001/focused-tests.txt"
    }
  ],
  "checks": [
    {
      "name": "Root typecheck and commerce check",
      "status": "passed",
      "command": "rtk bun run typecheck",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/typecheck.txt"
    },
    {
      "name": "Lint",
      "status": "passed",
      "command": "rtk bun run lint",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/lint.txt"
    },
    {
      "name": "Formatting",
      "status": "passed",
      "command": "rtk bun x prettier --check packages/compiler/src/route-source-checks.ts packages/compiler/src/route-module-diagnostics.ts packages/compiler/src/route-path-input-checks.ts packages/cli/src/editor.ts packages/cli/editor-compatibility.test.ts docs/records/route-module-type-safety.md",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/format.txt"
    },
    {
      "name": "Root boundary check",
      "status": "failed",
      "command": "rtk bun run check",
      "cwd": ".",
      "exit_code": 1,
      "output": "evidence/001/boundary-check.txt",
      "reason": "Existing compiler coverage JSON triggers out-of-scope-navigation-name."
    }
  ],
  "limitations": [
    "The live UI session remains unverified and the user still reports no error; fresh-server proof is not a claim that their existing editor session is fixed.",
    "UI automation could not reliably complete SDK selection while the user was switching windows. No further UI input will be sent without coordinating with the user.",
    "typescript.tsserver.pluginPaths has machine scope and is ignored in workspace settings. An exploratory workspace setting and its template assertion were removed; no global editor setting was changed.",
    "Installed TypeScript 6 regression uses RELKIT_EDITOR_TYPESCRIPT_PATH to choose the host API; ordinary test runs use the pinned workspace TypeScript.",
    "Root boundary check remains failing on the known coverage artifact; no independent baseline artifact exemption is asserted.",
    "No cloud, Docker or unrelated browser checks were run."
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
  "The user's deliberate removal of input id and literal output id were preserved; no function or route edits were made during this follow-up.",
  "The in-progress selected SDK question is needed to distinguish activation problems from semantic checking; all inspected servers still used bundled installation when last observed.",
  "Copilot accidentally received only the literal command name through a picker UI action; it proposed a command behind approval, which was not approved. Cancellation was attempted; no commands or code edits by it were observed."
]
```
