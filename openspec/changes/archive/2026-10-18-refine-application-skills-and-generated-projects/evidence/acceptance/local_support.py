"""Finite local-linked fixture tools; these are not standalone package-install evidence."""
import json
import os
from pathlib import Path
import re
import signal
import socket
import subprocess
import time

repository = Path.cwd()
evidence = Path(__file__).resolve().parent

def headroom(needed=192):
    while True:
        pressure = int(subprocess.check_output(["rtk", "sysctl", "-n", "kern.memorystatus_vm_pressure_level"], text=True))
        vm = subprocess.check_output(["rtk", "vm_stat"], text=True)
        size = int(re.search(r"page size of (\d+) bytes", vm).group(1))
        free = sum(int(re.search(name + r":\s+(\d+)", vm).group(1)) for name in ["Pages free", "Pages speculative", "Pages purgeable"]) * size / 1024**2
        if pressure == 1 or pressure == 2 and free >= needed:
            return
        print("Waiting for bounded local acceptance headroom", flush=True)
        time.sleep(10)

def run(report, label, args, cwd, env=None, expected=0, timeout=90):
    headroom(512 if any(part in label for part in ["typecheck", "build-web", "browser"]) else 192)
    print(label, flush=True)
    started = time.monotonic()
    # The outer serial runner already applies nice(10). macOS /usr/bin/nice strips DYLD_*.
    child = subprocess.Popen(["rtk", *map(str,args)], cwd=cwd, env={**os.environ, "NODE_OPTIONS":"--max-old-space-size=512", "UV_THREADPOOL_SIZE":"1", "RAYON_NUM_THREADS":"1", "NEXT_TELEMETRY_DISABLED":"1", **(env or {})}, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, start_new_session=True)
    try:
        output = child.communicate(timeout=timeout)[0].decode(errors="replace")
    except subprocess.TimeoutExpired:
        os.killpg(child.pid, signal.SIGTERM)
        try: output = child.communicate(timeout=5)[0].decode(errors="replace")
        except subprocess.TimeoutExpired:
            os.killpg(child.pid, signal.SIGKILL)
            output = child.communicate()[0].decode(errors="replace")
    (evidence / (label + ".log")).write_text(output)
    report.setdefault("commands", []).append({"label":label,"args":list(map(str,args)),"cwd":str(cwd),"exit":child.returncode,"expected":expected,"seconds":time.monotonic()-started,"pid":child.pid})
    if child.returncode != expected:
        raise RuntimeError(label + " failed: " + output[-3000:])
    return output

def port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1",0))
        return sock.getsockname()[1]

def link(root):
    manifest = json.loads((root / "package.json").read_text())
    modules = root / "node_modules"
    modules.mkdir(exist_ok=True)
    bins = modules / ".bin"
    bins.mkdir(exist_ok=True)
    # Bun's type package requires Node types transitively; explicit linking avoids Next's installer.
    node_types=modules / "@types/node"
    node_types.parent.mkdir(exist_ok=True)
    if not node_types.exists(): node_types.symlink_to(repository / "node_modules/@types/node")
    packages = {}
    for pattern in ["packages/*/package.json", "integrations/packages/*/package.json"]:
        for path in repository.glob(pattern):
            value = json.loads(path.read_text())
            packages[value["name"]] = path.parent
    for name, version in {**manifest.get("dependencies",{}), **manifest.get("devDependencies",{})}.items():
        target = packages.get(name, repository / "node_modules" / name)
        if not target.exists():
            target = repository / "node_modules/.bun" / (name.replace("/", "+") + "@" + version) / "node_modules" / name
        if not target.exists():
            matches=list((repository / "node_modules/.bun").glob(name.replace("/", "+") + "@" + version + "*/node_modules/" + name))
            if matches: target=matches[0]
        assert target.exists(), str(target)
        destination = modules / name
        destination.parent.mkdir(exist_ok=True, parents=True)
        if not destination.exists(): destination.symlink_to(target)
        value = json.loads((target / "package.json").read_text())
        entries = value.get("bin",{})
        if isinstance(entries,str): entries = {name.rsplit("/",1)[-1]:entries}
        for command, relative in entries.items():
            destination = bins / command
            if not destination.exists(): destination.symlink_to(target / relative)

def stop(child):
    if child.poll() is None:
        os.killpg(child.pid, signal.SIGTERM)
        try: child.wait(timeout=5)
        except subprocess.TimeoutExpired:
            os.killpg(child.pid,signal.SIGKILL)
            child.wait()
