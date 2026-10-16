"""Affected validation only, one worker and one command at a time."""
import json
import os
import pathlib
import subprocess
import time

repo = pathlib.Path(__file__).resolve().parents[2]
out = repo / "bug-fix-reports/issues/bf-1672405f026d30b6cc3728eb/evidence/001"
files = ["packages/cli/src/invocation-signals.ts", "packages/cli/src/cli-errors.ts", "packages/cli/src/main-support.ts", "packages/cli/src/main-support-types.ts", "packages/cli/tests/invocation/signals.test.ts", "packages/cli/tests/services/dev-initial-native.test.ts", ".changeset/prepared-dev-hangup-cleanup.md"]
env = dict(os.environ, RAYON_NUM_THREADS="1", UV_THREADPOOL_SIZE="1", CIRCLE_NODE_TOTAL="2", NEXT_TELEMETRY_DISABLED="1")
checks = [
    ("format", ["bun", "x", "prettier", "--write", *files]),
    ("native-regressions", ["bun", "test", "--max-concurrency", "1", "packages/cli/tests/invocation/signals.test.ts", "packages/cli/tests/services/dev-initial-native.test.ts", "packages/cli/commands-protocol.test.ts", "scripts/tests/dev-readiness/bootstrap-imports.test.ts"]),
    ("main-regressions", ["bun", "x", "vitest", "run", "--maxWorkers=1", "--no-file-parallelism", "packages/cli/main.test.ts", "packages/cli/tests/invocation/logging.test.ts", "packages/cli/tests/services/process.test.ts"]),
    ("typecheck", ["bun", "x", "tsc", "-b", "packages/cli", "--pretty", "false"]),
    ("bootstrap-build", ["bun", "run", "scripts/package-dev-bootstrap.ts"]),
    ("lint", ["bun", "run", "lint"]),
    ("boundaries", ["bun", "run", "check"]),
    ("konsistent", ["bun", "run", "konsistent", "--", "validate"]),
    ("diff-check", ["git", "diff", "--check"]),
]
results = []
for name, command in checks:
    started = time.monotonic()
    with (out / f"check-{name}.log").open("wb") as output:
        result = subprocess.run(["nice", "-n", "15", *command], cwd=repo, env=env, stdout=output, stderr=subprocess.STDOUT, timeout=240)
    record = {"name": name, "command": command, "exitCode": result.returncode, "seconds": round(time.monotonic() - started, 2)}
    results.append(record)
    (out / "checks-results.json").write_text(json.dumps(results, indent=2) + "\n")
    print(json.dumps(record), flush=True)
    if result.returncode:
        raise SystemExit(result.returncode)
