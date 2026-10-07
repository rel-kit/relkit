# bf-a3804b9e015833aff74a7f40: Inspector discovery accepts a package manifest symlinked outside the selected source directory.

Status: **verified**
Attempt: 1 · Updated: 2026-10-07T00:32:47+00:00

## What

Inspector discovery accepts a package manifest symlinked outside the selected source directory.

## Expected

A source override uses a canonical directory and its own manifest; escaped manifests are rejected before compiler admission.

## Observed before

The discovery function accepts the escaped manifest and the real CLI reaches the initial compiler.

## Root cause

packages/cli/src/commands/dev-inspector.ts:131 sourceInstallation previously tested only manifest existence. A symlink could select an external manifest and admit initial compilation.

## Fixed by

Canonicalize the source directory and package manifest, require the manifest to stay inside that directory, and return the canonical installation root. Real CLI replay rejects escaped manifests before initial compiler admission; valid alternate checkouts, relative paths, directory symlinks, reload/persistence and cancellation coverage pass.

## Changed files

- packages/cli/src/commands/dev-inspector.ts
- packages/cli/tests/services/dev-inspector-installation.test.ts
- packages/cli/dev.test.ts

## Reproduction

- Create an owned inspector directory whose package.json points to an external fixture manifest
- Call real installation discovery and run the actual CLI with the override
- Assert rejection and no compiler-started receipt

## Evidence

- before: [unit](evidence/001/unit-before.txt) — Discovery returns installation instead of rejecting an escaped manifest.
- before: [integration](evidence/001/runtime-before-compiler.txt) — Real CLI crosses the inspector validation boundary before rejecting invalid project compilation.
- after: [unit](evidence/001/unit-after.txt) — Escaping manifest is rejected.
- after: [integration](evidence/001/runtime-after.txt) — Real CLI rejects before compiler or graph output.
- after: [integration](evidence/001/boundaries.txt) — Alternate roots, relative paths, aliases, and missing-manifest errors retain their contract.
- after: [e2e](evidence/001/cli-development.txt) — 20 native CLI development, persistence, and cancellation tests pass.

## Scope

```json
{
  "modules": [
    "CliDevInspector",
    "CliCompiler",
    "CliModules"
  ],
  "entrypoints": [
    "relkit dev",
    "resolveInspectorInstallation"
  ],
  "invariants": [
    "Package manifests stay inside the explicitly selected source directory",
    "Different source checkouts and ordinary directory symlinks remain supported",
    "Invalid installations fail before the initial compiler starts"
  ]
}
```

## Environment

```json
{
  "package": "@relkit/cli",
  "revision": "2aaebb53bc3d5a8705aa6a41cf93bcfe810306b1",
  "target": "Local Bun 1.3.10 CLI and owned filesystem fixtures",
  "api_exposed": false,
  "e2e_available": true,
  "monitoring": "GitHub CodeQL alert 15 and local structured CLI diagnostics; no remote runtime telemetry is required for installation discovery."
}
```

## Verification

```json
{
  "unit": {
    "before": {
      "status": "failed",
      "command": "rtk proxy bun test --test-name-pattern \"^inspector overrides reject\" packages/cli/tests/services/dev-inspector-installation.test.ts",
      "cwd": ".",
      "exit_code": 1,
      "assertion": "Manifest symlinks cannot escape the explicitly selected inspector root",
      "output": "evidence/001/unit-before.txt"
    },
    "after": {
      "status": "passed",
      "command": "rtk proxy bun test --test-name-pattern \"^inspector overrides reject\" packages/cli/tests/services/dev-inspector-installation.test.ts",
      "cwd": ".",
      "exit_code": 0,
      "assertion": "Manifest symlinks cannot escape the explicitly selected inspector root",
      "output": "evidence/001/unit-after.txt"
    }
  },
  "runtime": {
    "kind": "integration",
    "reason": "Inspector installation is a CLI admission boundary before HTTP listener or compiler startup.",
    "boundary": "CLI bin -> runCli -> developmentPorts -> live CliModules/CliCompiler -> inspector discovery -> native filesystem",
    "dependencies": [
      "Actual source CLI bin, compiler, modules and filesystem adapters",
      "Owned configuration/manifest fixtures and real filesystem symlinks; no adapters mocked"
    ],
    "steps": [
      "Create an owned inspector directory whose package.json points to an external fixture manifest",
      "Call real installation discovery and run the actual CLI with the override",
      "Assert rejection and no compiler-started receipt"
    ],
    "before": {
      "status": "failed",
      "command": "rtk proxy bun test --test-name-pattern \"^the executable rejects\" packages/cli/tests/services/dev-inspector-installation.test.ts",
      "cwd": ".",
      "exit_code": 1,
      "assertion": "The real executable rejects an escaped manifest before the initial compiler starts",
      "output": "evidence/001/runtime-before-compiler.txt"
    },
    "after": {
      "status": "passed",
      "command": "rtk proxy bun test --test-name-pattern \"^the executable rejects\" packages/cli/tests/services/dev-inspector-installation.test.ts",
      "cwd": ".",
      "exit_code": 0,
      "assertion": "The real executable rejects an escaped manifest before the initial compiler starts",
      "output": "evidence/001/runtime-after.txt"
    }
  },
  "e2e": {
    "status": "passed",
    "command": "rtk proxy bun test ./packages/cli/dev.test.ts ./packages/cli/dev-persistence.test.ts ./packages/cli/tests/services/dev-inspector-installation.test.ts ./packages/cli/tests/services/dev-initial-native.test.ts",
    "cwd": ".",
    "exit_code": 0,
    "assertion": "Development source selection, reload/persistence, escaped-manifest admission and native compiler cancellation pass",
    "output": "evidence/001/cli-development.txt"
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
      "name": "Node CLI services",
      "status": "passed",
      "command": "rtk proxy bun x vitest run --maxWorkers=1 packages/cli/tests/services/dev-initial-check.test.ts packages/cli/tests/contributor/cancellation.test.ts packages/cli/tests/contributor/concurrency.test.ts packages/cli/tests/contributor/domain.test.ts",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/cli-services.txt"
    },
    {
      "name": "isolated contributor type probes",
      "status": "passed",
      "command": "rtk proxy bun x vitest run --maxWorkers=1 packages/cli/tests/contributor/type-probes.test.ts",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/contributor-types.txt"
    }
  ],
  "regressions": [
    {
      "kind": "integration",
      "boundary": "Source discovery -> canonical filesystem installation",
      "status": "passed",
      "command": "rtk proxy bun test --test-name-pattern \"^source overrides retain\" packages/cli/tests/services/dev-inspector-installation.test.ts",
      "cwd": ".",
      "exit_code": 0,
      "assertion": "Valid alternate roots and missing manifests retain their intended behavior",
      "output": "evidence/001/boundaries.txt"
    },
    {
      "kind": "e2e",
      "boundary": "Live development -> backend reload -> persisted telemetry -> shutdown",
      "status": "passed",
      "command": "rtk proxy bun test ./packages/cli/dev.test.ts ./packages/cli/dev-persistence.test.ts ./packages/cli/tests/services/dev-inspector-installation.test.ts ./packages/cli/tests/services/dev-initial-native.test.ts",
      "cwd": ".",
      "exit_code": 0,
      "assertion": "Reload, persistence, process ownership and source preference pass",
      "output": "evidence/001/cli-development.txt"
    }
  ],
  "limitations": [
    "Hosted CodeQL/CI will evaluate the published branch; these records establish local behavioral proof."
  ]
}
```

## Related reports

```json
[
  "bf-d473cff05bd0980858484be0"
]
```

## Notes

```json
[
  "CodeQL alert 15 already exists on main; its PR instance is addressed by this change.",
  "Canonical paths intentionally resolve the macOS /var alias to /private/var.",
  "An unchanged contributor type probe initially exceeded five seconds and passed in isolation without a deadline change."
]
```
