"""Detached local preview owner; retain the child's eventual native exit status."""
import json
import os
import pathlib
import signal
import subprocess
import sys
import time

app = pathlib.Path(sys.argv[1]).resolve()
out = pathlib.Path(sys.argv[2]).resolve()
out.mkdir(parents=True, exist_ok=True)
repo = pathlib.Path(__file__).resolve().parents[2]
receipt = out / "preview-session.json"
state = {"ownerPid": os.getpid(), "startedAt": time.time(), "signalsForwarded": []}
child = None


def save():
    temporary = receipt.with_suffix(".tmp")
    temporary.write_text(json.dumps(state, indent=2) + "\n")
    temporary.replace(receipt)


def forward(number, _frame):
    state["signalsForwarded"].append({"signal": signal.Signals(number).name, "at": time.time()})
    save()
    if child is not None and child.poll() is None:
        child.send_signal(number)


for selected in (signal.SIGINT, signal.SIGTERM, signal.SIGHUP):
    signal.signal(selected, forward)

env = dict(os.environ, RAYON_NUM_THREADS="1", UV_THREADPOOL_SIZE="1", CIRCLE_NODE_TOTAL="2", NEXT_TELEMETRY_DISABLED="1")
command = ["bun", str(repo / "packages/cli/src/bin.ts"), "dev", "--port", "3400", "--inspector-port", "3410", "--local", "off", "--no-color"]
with (out / "dev.log").open("ab", buffering=0) as log:
    child = subprocess.Popen(command, cwd=app, env=env, stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
    state.update(cliPid=child.pid, state="running", shop="http://127.0.0.1:3400", inspector="http://127.0.0.1:3410", log=str(out / "dev.log"))
    save()
    code = child.wait()
    state.update(state="exited", exitCode=code, exitedAt=time.time())
    save()
