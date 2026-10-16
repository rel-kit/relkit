"""Run native lifetime cases strictly sequentially and retain every exit result."""
import json
import os
import pathlib
import subprocess
import time

repo = pathlib.Path(__file__).resolve().parents[2]
out = repo / "bug-fix-reports/issues/bf-1672405f026d30b6cc3728eb/evidence/001"
suffix = os.environ.get("RELKIT_LIFETIME_MATRIX_SUFFIX", "")
cases = [
    ("runtime-after-final", ["hup", "--prepared", "--expect-graceful"]),
    ("ordinary-hup-after", ["hup", "--expect-graceful"]),
    ("ordinary-int-after", ["int", "--expect-graceful"]),
    ("prepared-term-after", ["term", "--prepared", "--expect-graceful"]),
    ("prepared-int-after", ["int", "--prepared", "--expect-graceful"]),
    ("prepared-idle-after", ["idle", "--prepared"]),
]
results = []
for label, args in cases:
    label += suffix
    started = time.monotonic()
    command = ["python3", "test-results/dev-process-lifetime-20261016/probe.py", *args]
    env = dict(os.environ, RELKIT_LIFETIME_EVIDENCE=str(out), RELKIT_LIFETIME_LABEL=label)
    with (out / f"{label}.log").open("wb") as log:
        child = subprocess.run(command, cwd=repo, env=env, stdout=log, stderr=subprocess.STDOUT, timeout=120)
    result = {"label": label, "command": command, "exitCode": child.returncode, "seconds": round(time.monotonic() - started, 2)}
    results.append(result)
    (out / f"matrix-results{suffix}.json").write_text(json.dumps(results, indent=2) + "\n")
    print(json.dumps(result), flush=True)
    if child.returncode:
        raise SystemExit(child.returncode)
