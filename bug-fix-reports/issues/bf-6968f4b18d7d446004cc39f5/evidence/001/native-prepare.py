"""Assert the native preparation command rejects eager ambient construction."""
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

REPO = Path(__file__).resolve().parents[5]
SOURCE = Path("/var/folders/54/3l8wd4hj6c36slgt3rl572sr0000gp/T/relkit-dev-recovery-7uwlmdbu/app")
root = Path(tempfile.mkdtemp(prefix="relkit-astool-integrity-"))
try:
    for name in ["package.json", "bun.lock", "tsconfig.json", "src"]:
        source = SOURCE / name
        if source.is_dir():
            shutil.copytree(source, root / name)
        else:
            shutil.copy2(source, root / name)
    subprocess.run(["cp", "-cR", str(SOURCE / "node_modules"), str(root / "node_modules")], check=True)
    valid = "--valid-tool" in sys.argv
    if valid:
        shutil.copy2(SOURCE / "relkit.config.ts", root / "relkit.config.ts")
        (root / "src/services/hello/functions/lookup.tool.ts").write_text('''import hello from "./hello.function.js";
export default hello.asTool({id:"hello.lookup", description:"Lookup", sideEffect:"read", approval:"never", timeoutMs:2000});
''')
    elif "--computed-binding" in sys.argv:
        (root / "relkit.config.ts").write_text('''import {defineApp, defineEnv} from "@relkit/app/config";
function readAmbient(_options: {}) { process.env.REVIEW_VALUE; return "id" as const; }
const {[readAmbient({})]: id} = {id: "captured"};
export default defineApp({id, env: defineEnv({})});
''')
    else:
        (root / "relkit.config.ts").write_text('''import {defineApp, defineEnv} from "@relkit/app/config";
function readAmbient(_options: {}) { return process.env.REVIEW_VALUE ?? "fallback"; }
const builder = {asTool: readAmbient};
export default defineApp({id: builder.asTool({}), env: defineEnv({})});
''')
    child = subprocess.run(["nice", "-n", "15", "bun", str(REPO / "packages/cli/src/bin.ts"), "dev", "--prepare", "--local", "off", "--no-color"], cwd=root, env=dict(os.environ, REVIEW_VALUE="untracked-topology", RAYON_NUM_THREADS="1", UV_THREADPOOL_SIZE="1"), stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=45)
    print(child.stdout.decode(errors="replace"))
    print("native preparation exit:", child.returncode)
    assert b"Module not found" not in child.stdout, "Native CLI must load before the assertion"
    if valid:
        assert child.returncode == 0, "A proven imported descriptor must remain eligible"
        assert (root / ".relkit/dev/current.json").exists()
        print("PASS native CLI prepares an imported function descriptor tool")
    else:
        assert child.returncode != 0, "Eager ambient code must be rejected before snapshot publication"
        assert b"compilation.dynamic" in child.stdout or b"ineligible" in child.stdout, "Rejection must come from eligibility"
        assert not (root / ".relkit/dev/current.json").exists(), "Rejected source must not publish a pointer"
        print("PASS native CLI rejects ambient asTool construction and publishes no snapshot")
finally:
    shutil.rmtree(root)
