# bf-d473cff05bd0980858484be0: Generator executable acceptance permits the BUN environment variable to select an arbitrary command.

Status: **verified**
Attempt: 1 · Updated: 2026-10-07T00:32:47+00:00

## What

Generator executable acceptance permits the BUN environment variable to select an arbitrary command.

## Expected

Acceptance always runs Bun and ignores an unrelated executable override while preserving import and JSON-output assertions.

## Observed before

BUN=echo substitutes another executable; a harmless wrapper executes and records a marker while the existing acceptance test still passes.

## Root cause

packages/create-relkit/tests/executable.effect.test.ts runBun previously selected its executable from process.env.BUN. Contributor native acceptance also assembled JavaScript using JSON.stringify; static fixtures remove that unnecessary code-construction pattern.

## Fixed by

Use the literal Bun executable and static passive-import/process-group fixtures. The BUN=echo regression and harmless override replay pass, preserving passive imports, singular JSON usage output, version output, native stdout/stderr/nonzero status and cancellation of a parent plus descendants in a quoted directory.

## Changed files

- packages/create-relkit/tests/executable.effect.test.ts
- packages/create-relkit/tests/passive-import.fixture.ts
- packages/cli/tests/contributor/native.acceptance.ts
- packages/cli/tests/contributor/passive-import.fixture.ts
- packages/cli/tests/contributor/process-group.fixture.ts

## Reproduction

- Set BUN to a harmless alternate executable and assert the result still belongs to Bun
- Replay real executable acceptance with an owned wrapper that writes a selection receipt and delegates to Bun
- Assert existing acceptance passes without invoking the wrapper

## Evidence

- before: [unit](evidence/001/unit-before-echo.txt) — Echo runs and produces --version instead of Bun version output.
- before: [integration](evidence/001/runtime-before.txt) — Harmless arbitrary wrapper executes even while existing executable acceptance passes.
- after: [unit](evidence/001/unit-after.txt) — BUN override, passive imports and JSON usage output pass.
- after: [integration](evidence/001/runtime-after.txt) — Real acceptance passes without invoking the harmless override wrapper.
- after: [e2e](evidence/001/contributor-native.txt) — 3 native capture/cancellation/executable cases pass.
- after: [e2e](evidence/001/generator-isolated-all.txt) — The 9 acceptance cases and 92 other generator cases pass in serial fresh processes.

## Scope

```json
{
  "modules": [
    "GeneratorExecutableTests",
    "ContributorTerminal",
    "CliProcess",
    "Bun child_process adapter"
  ],
  "entrypoints": [
    "generator executable acceptance",
    "native contributor acceptance"
  ],
  "invariants": [
    "The native runner uses the fixed Bun command",
    "Barrel imports remain passive",
    "Executable JSON stdout remains singular and usage errors retain code 2",
    "Process-group cancellation joins the parent and descendant without string-generated JavaScript",
    "Native output and version forwarding stay unchanged in quoted paths"
  ]
}
```

## Environment

```json
{
  "package": "create-relkit",
  "revision": "2aaebb53bc3d5a8705aa6a41cf93bcfe810306b1",
  "target": "Local Bun 1.3.10 Vitest native executable acceptance",
  "api_exposed": false,
  "e2e_available": true,
  "monitoring": "GitHub CodeQL alert 72 and captured native process outputs; no remote telemetry is emitted by this test-only adapter."
}
```

## Verification

```json
{
  "unit": {
    "before": {
      "status": "failed",
      "command": "rtk proxy bun x --bun vitest run --config packages/create-relkit/vitest.config.ts packages/create-relkit/tests/executable.effect.test.ts --testNamePattern \"uses Bun regardless\"",
      "cwd": ".",
      "exit_code": 1,
      "assertion": "Native executable selection ignores BUN and returns Bun version output",
      "output": "evidence/001/unit-before-echo.txt"
    },
    "after": {
      "status": "passed",
      "command": "rtk proxy bun x --bun vitest run --config packages/create-relkit/vitest.config.ts packages/create-relkit/tests/executable.effect.test.ts",
      "cwd": ".",
      "exit_code": 0,
      "assertion": "Native executable selection ignores BUN and returns Bun version output",
      "output": "evidence/001/unit-after.txt"
    }
  },
  "runtime": {
    "kind": "integration",
    "reason": "The affected adapter is a test runner for real CLI subprocesses; it has no HTTP API.",
    "boundary": "Owned replay -> Vitest live acceptance -> runBun -> native child_process -> real Bun -> generator barrel/bin",
    "dependencies": [
      "Actual Bun 1.3.10, Node child_process and generator source barrel/bin",
      "A harmless executable wrapper records invocation and delegates to real Bun; no application adapters mocked"
    ],
    "steps": [
      "Set BUN to a harmless alternate executable and assert the result still belongs to Bun",
      "Replay real executable acceptance with an owned wrapper that writes a selection receipt and delegates to Bun",
      "Assert existing acceptance passes without invoking the wrapper"
    ],
    "before": {
      "status": "failed",
      "command": "rtk proxy python3 bug-fix-reports/issues/bf-d473cff05bd0980858484be0/evidence/001/replay.py",
      "cwd": ".",
      "exit_code": 1,
      "assertion": "Executable acceptance passes without invoking the BUN-selected program",
      "output": "evidence/001/runtime-before.txt"
    },
    "after": {
      "status": "passed",
      "command": "rtk proxy python3 bug-fix-reports/issues/bf-d473cff05bd0980858484be0/evidence/001/replay.py",
      "cwd": ".",
      "exit_code": 0,
      "assertion": "Executable acceptance passes without invoking the BUN-selected program",
      "output": "evidence/001/runtime-after.txt"
    }
  },
  "e2e": {
    "status": "passed",
    "command": "rtk proxy bun x --bun vitest run --config packages/create-relkit/vitest.config.ts packages/create-relkit/tests/executable.effect.test.ts",
    "cwd": ".",
    "exit_code": 0,
    "assertion": "Real source barrel import remains passive and executable usage returns one JSON record with exit 2",
    "output": "evidence/001/unit-after.txt"
  },
  "checks": [
    {
      "name": "prepush",
      "status": "passed",
      "command": "rtk proxy bun run prepush",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/prepush.txt"
    },
    {
      "name": "generator Effect services",
      "status": "passed",
      "command": "rtk proxy bun x --bun vitest run --config packages/create-relkit/vitest.config.ts",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/generator-effects.txt"
    },
    {
      "name": "generator acceptance with fresh processes",
      "status": "passed",
      "command": "rtk proxy python3 /var/folders/54/3l8wd4hj6c36slgt3rl572sr0000gp/T/relkit-pr98-security-liw1phag/generator-serial.py",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/generator-isolated-all.txt"
    }
  ],
  "regressions": [
    {
      "kind": "integration",
      "boundary": "ContributorTerminal -> ignoring parent -> descendant group -> physical process reaping",
      "status": "passed",
      "command": "rtk proxy bun test ./packages/cli/tests/contributor/native.acceptance.ts",
      "cwd": ".",
      "exit_code": 0,
      "assertion": "Capture, quoted-path cancellation, passive import and version forwarding pass",
      "output": "evidence/001/contributor-native.txt"
    },
    {
      "kind": "e2e",
      "boundary": "Create/add -> generated starters -> actual compiler and native workspace CLI",
      "status": "passed",
      "command": "rtk proxy python3 /var/folders/54/3l8wd4hj6c36slgt3rl572sr0000gp/T/relkit-pr98-security-liw1phag/generator-serial.py",
      "cwd": ".",
      "exit_code": 0,
      "assertion": "Every generator acceptance case and the other generator suites pass",
      "output": "evidence/001/generator-isolated-all.txt"
    }
  ],
  "limitations": [
    "Default concurrent and suite-level generator runs hit existing acceptance deadlines. Equivalent cases pass in fresh serial processes with unchanged assertions and deadlines.",
    "Hosted CodeQL/CI will evaluate the published branch."
  ]
}
```

## Related reports

```json
[
  "bf-a3804b9e015833aff74a7f40"
]
```

## Notes

```json
[
  "Alerts 70 and 71 concern JSON stringification into generated program text. Static fixtures remove that construction; original lifecycle assertions remain intact.",
  "Original aggregate and suite-level generator failures are retained in the temporary audit directory and are not recorded as passing commands. The retained replay driver runs the same assertions with fresh processes."
]
```
