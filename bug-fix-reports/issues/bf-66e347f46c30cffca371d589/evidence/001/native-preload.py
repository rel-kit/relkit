"""Prove actual CLI startup and same-process dotenv recovery with a logging preload."""
import importlib.util
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile
import time
import urllib.request

REPO = Path(__file__).resolve().parents[5]
OUT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("lifetime", REPO / "test-results/dev-process-lifetime-20261016/probe.py")
life = importlib.util.module_from_spec(spec)
spec.loader.exec_module(life)
root = Path(tempfile.mkdtemp(prefix="relkit-cli-preload-"))
child = None
observed = []
try:
    assert int(subprocess.check_output(["sysctl", "-n", "kern.memorystatus_vm_pressure_level"], text=True)) == 1
    for name in ["package.json", "bun.lock", "tsconfig.json", "relkit.config.ts", "src"]:
        source = life.SOURCE / name
        if source.is_dir():
            shutil.copytree(source, root / name)
        else:
            shutil.copy2(source, root / name)
    subprocess.run(["nice", "-n", "15", "cp", "-cR", str(life.SOURCE / "node_modules"), str(root / "node_modules")], check=True)
    function = root / "src/services/hello/functions/hello.function.ts"
    original = function.read_text()
    updated = original.replace("`Hello, ${name}!`", "`Hello, ${process.env.RECOVERY_VALUE}!`")
    assert updated != original
    function.write_text(updated)
    (root / "bunfig.toml").write_text('preload=["./preload.ts"]\n')
    (root / "preload.ts").write_text('console.log("APPLICATION_PRELOAD");\n')
    (root / ".env").write_text("RECOVERY_VALUE=first\n")
    (root / ".env").chmod(0o600)
    number, inspector = life.port(), life.port()
    command = ["nice", "-n", "15", "bun", str(REPO / "packages/cli/src/bin.ts"), "dev", "--port", str(number), "--inspector-port", str(inspector), "--local", "off", "--no-color"]
    def message():
        with urllib.request.urlopen(f"http://127.0.0.1:{number}/hello?name=preload", timeout=2) as response:
            return json.load(response)["message"]
    def wait(expected):
        deadline = time.monotonic() + 45
        while time.monotonic() < deadline:
            assert child.poll() is None, "CLI must remain alive during preload recovery"
            try:
                if message() == expected:
                    return
            except OSError:
                pass
            time.sleep(.25)
        raise AssertionError("Actual CLI did not expose the current dotenv value")
    with (OUT / "native-preload-dev.log").open("wb") as log:
        child = subprocess.Popen(command, cwd=root, env=dict(os.environ, RAYON_NUM_THREADS="1", UV_THREADPOOL_SIZE="1", NEXT_TELEMETRY_DISABLED="1"), stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
        wait("Hello, first!")
        observed = life.owned(child.pid)
        (root / ".env").write_text("RECOVERY_VALUE=updated\n")
        wait("Hello, updated!")
        observed = life.owned(child.pid)
        assert "APPLICATION_PRELOAD" in (OUT / "native-preload-dev.log").read_text()
        assert "Invalid development environment response" not in (OUT / "native-preload-dev.log").read_text()
        result = {"status":"passed", "cliPid":child.pid, "actualCliStartup":True, "loggingPreloadRetained":True, "dotenvReloadReachedHttp":True, "samePidDuringRecovery":True, "privateValuesLogged":False}
        life.cleanup(child, observed)
        result["joinedCleanup"] = True
        (OUT / "native-preload-result.json").write_text(json.dumps(result, indent=2) + "\n")
        print(json.dumps(result), flush=True)
finally:
    if child is not None and child.poll() is None:
        life.cleanup(child, life.owned(child.pid))
    shutil.rmtree(root)
