import os
from pathlib import Path
import subprocess

evidence = Path(__file__).resolve().parent
repository = evidence.parents[4]
marker = evidence / "override-executed"
marker.unlink(missing_ok=True)
environment = dict(os.environ, BUN=str(evidence / "override-bun.cjs"))
command = [
    "rtk", "proxy", "bun", "x", "--bun", "vitest", "run",
    "--config", "packages/create-relkit/vitest.config.ts",
    "packages/create-relkit/tests/executable.effect.test.ts",
    "--testNamePattern", "keeps source barrel imports passive",
]
result = subprocess.run(command, cwd=repository, env=environment, text=True, capture_output=True)
print(result.stdout, end="")
print(result.stderr, end="")
selected = marker.exists()
marker.unlink(missing_ok=True)
print(f"Existing executable acceptance exit: {result.returncode}; arbitrary BUN override executed: {selected}")
assert result.returncode == 0, "Existing executable acceptance must pass."
assert not selected, "The native runner must ignore the BUN executable override."
