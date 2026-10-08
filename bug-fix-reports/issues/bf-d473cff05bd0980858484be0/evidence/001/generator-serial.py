from pathlib import Path
import re
import subprocess

repository = Path(__file__).resolve().parents[5]
acceptance = "./tests/generator/add-acceptance.test.ts"
others = sorted(
    str(path.relative_to(repository))
    for path in (repository / "tests/generator").rglob("*.test.ts")
    if str(path.relative_to(repository)) != acceptance.removeprefix("./")
)
cases = [
    "the full bundle compiles in every starter and preserves its graph relationships",
    "reused Docker profiles retain the post-scaffold startup reminder",
    "API starter integration tests run after adding a full service without Docker",
    "route platform and singleton additions compile in every starter",
    "database and auth-chained schemas compile for all Bun-native dialects",
    "every standalone add kind compiles in every starter",
    "tool function creation rejects collisions without changing existing files",
    "snapshots simple, custom, and full service plans",
    "rejects ambiguous services and existing route methods before mutation",
]
suites = [
    (case, ["--test-name-pattern", "^" + re.escape(case) + "$", acceptance])
    for case in cases
]
suites.append(("other generator", others))
for name, arguments in suites:
    print("Running " + name, flush=True)
    result = subprocess.run(["rtk", "proxy", "bun", "test", *arguments], cwd=repository)
    print(f"{name}: exit {result.returncode}", flush=True)
    if result.returncode:
        raise SystemExit(result.returncode)
