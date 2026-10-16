"""Compare native RELKIT process lifetimes without touching the running shop."""
import argparse
import json
import os
import pathlib
import shutil
import signal
import socket
import subprocess
import tempfile
import time
import urllib.request

REPO = pathlib.Path(__file__).resolve().parents[2]
SOURCE = pathlib.Path("/var/folders/54/3l8wd4hj6c36slgt3rl572sr0000gp/T/relkit-dev-recovery-7uwlmdbu/app")
EVIDENCE = pathlib.Path(os.environ.get("RELKIT_LIFETIME_EVIDENCE", str(REPO / "bug-fix-reports/issues/bf-625fd985faaf71cd148396fc/evidence/001")))
ENV = dict(os.environ, RAYON_NUM_THREADS="1", UV_THREADPOOL_SIZE="1", CIRCLE_NODE_TOTAL="2", NEXT_TELEMETRY_DISABLED="1")


def port():
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        return listener.getsockname()[1]


def rows():
    text = subprocess.check_output(["ps", "-axo", "pid=,ppid=,args="], text=True)
    result = []
    for line in text.splitlines():
        fields = line.strip().split(None, 2)
        if len(fields) == 3:
            result.append((int(fields[0]), int(fields[1]), fields[2]))
    return result


def owned(pid):
    table = rows()
    ids = {pid}
    while True:
        updated = ids | {p for p, parent, _ in table if parent in ids}
        if updated == ids:
            return [(p, parent, cmd) for p, parent, cmd in table if p in ids]
        ids = updated


def get(number):
    with urllib.request.urlopen(f"http://127.0.0.1:{number}/hello?name=lifetime", timeout=2) as response:
        value = json.load(response)
        assert value["message"] == "Hello, lifetime!", value
        return value["message"]


def ready(number, child):
    for _ in range(120):
        if child.poll() is not None:
            raise AssertionError(f"CLI exited before ready: {child.returncode}")
        try:
            return get(number)
        except (OSError, ValueError):
            time.sleep(0.25)
    raise AssertionError("Actual native CLI did not serve the expected handler")


def cleanup(child, snapshot):
    if child.poll() is None:
        child.terminate()
        try:
            child.wait(timeout=10)
        except subprocess.TimeoutExpired:
            child.kill()
            child.wait(timeout=5)
    # Only exact, still-matching commands from this fixture's recorded descendants.
    current = {p: cmd for p, _, cmd in rows()}
    for p, _, cmd in snapshot:
        if p != child.pid and current.get(p) == cmd:
            try:
                os.kill(p, signal.SIGTERM)
            except ProcessLookupError:
                pass
    for _ in range(40):
        current = {p: cmd for p, _, cmd in rows()}
        remaining = [p for p, _, cmd in snapshot if current.get(p) == cmd]
        if not remaining:
            return
        time.sleep(0.1)
    raise AssertionError(f"Owned fixture processes remain after cleanup: {remaining}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("scenario", choices=["idle", "int", "term", "hup", "kill"])
    parser.add_argument("--prepared", action="store_true")
    parser.add_argument("--expect-graceful", action="store_true")
    args = parser.parse_args()
    label = os.environ.get("RELKIT_LIFETIME_LABEL", ("prepared-" if args.prepared else "") + args.scenario)
    root = pathlib.Path(tempfile.mkdtemp(prefix="relkit-process-lifetime-"))
    number, inspector = port(), port()
    child = None
    snapshot = []
    result = {"scenario": label, "fixture": str(root), "appPort": number, "inspectorPort": inspector}
    try:
        for name in ["package.json", "bun.lock", "relkit.config.ts", "tsconfig.json", "src"]:
            source, target = SOURCE / name, root / name
            if source.is_dir():
                shutil.copytree(source, target)
            else:
                shutil.copy2(source, target)
        subprocess.run(["cp", "-cR", str(SOURCE / "node_modules"), str(root / "node_modules")], check=True)
        command = ["nice", "-n", "15", "bun", str(REPO / "packages/cli/src/bin.ts"), "dev", "--port", str(number), "--inspector-port", str(inspector), "--local", "off", "--no-color", "--verbose"]
        if args.prepared:
            with (EVIDENCE / f"{label}-prepare.log").open("wb") as output:
                prepared = subprocess.run(command + ["--prepare"], cwd=root, env=ENV, stdin=subprocess.DEVNULL, stdout=output, stderr=subprocess.STDOUT, timeout=45)
                assert prepared.returncode == 0, "Preparation must succeed before native prepared-path test"
        with (EVIDENCE / f"{label}-dev.log").open("wb") as output:
            child = subprocess.Popen(command, cwd=root, env=ENV, stdin=subprocess.DEVNULL, stdout=output, stderr=subprocess.STDOUT, start_new_session=True)
            result["cliPid"] = child.pid
            result["initialHandler"] = ready(number, child)
            for attempt in range(80):
                try:
                    with urllib.request.urlopen(f"http://127.0.0.1:{inspector}/", timeout=1) as response:
                        assert response.status == 200
                    result["inspectorReady"] = True
                    break
                except OSError:
                    time.sleep(0.25)
            assert result.get("inspectorReady"), "Owned inspector must be ready before the signal"
            snapshot = owned(child.pid)
            result["preparedFastPath"] = any("/.relkit/dev/sessions/dev-session-" in cmd for _, _, cmd in snapshot)
            if args.prepared:
                assert result["preparedFastPath"], "Prepared scenario must actually acquire the capsule"
            result["ownedProcesses"] = [{"pid": p, "parent": parent, "command": cmd.split(" (v ", 1)[0]} for p, parent, cmd in snapshot]
            if args.scenario in ("int", "term", "hup", "kill"):
                selected = {"int": signal.SIGINT, "term": signal.SIGTERM, "hup": signal.SIGHUP, "kill": signal.SIGKILL}[args.scenario]
                child.send_signal(selected)
                result["exitCode"] = child.wait(timeout=12)
                result["signalSent"] = selected.name
            else:
                for _ in range(12):
                    time.sleep(1)
                    assert child.poll() is None, "CLI must remain live while no shutdown is requested"
                    get(number)
                result["samePidAndHandlerAfterIdle"] = True
            text = (EVIDENCE / f"{label}-dev.log").read_text()
            result["shutdownDiagnostic"] = "dev.shutdown" in text or "Received SIG" in text or "Stopping development server" in text
            result["survivingDescendantsAtExit"] = [p for p, _, _ in rows() if p in {p for p, _, _ in snapshot} and p != child.pid]
            print(json.dumps(result, indent=2), flush=True)
            if args.expect_graceful:
                expected = {"hup": 129, "int": 130, "term": 143}[args.scenario]
                assert result["exitCode"] == expected, f"Expected joined signal exit {expected}, observed {result['exitCode']}"
                assert result["shutdownDiagnostic"], "Signal shutdown must retain diagnostics"
                assert not result["survivingDescendantsAtExit"], "Signal shutdown must join all owned children"
    finally:
        if child is not None:
            if not snapshot:
                snapshot = owned(child.pid)
            cleanup(child, snapshot)
        shutil.rmtree(root)
        result["cleanupVerified"] = True
        (EVIDENCE / f"{label}-result.json").write_text(json.dumps(result, indent=2) + "\n")


if __name__ == "__main__":
    main()
