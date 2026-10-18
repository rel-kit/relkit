"""Serial evidence runner: bounded owned children and a pre-start resource gate."""

import argparse
import datetime
import fcntl
import json
import os
import re
from pathlib import Path
import signal
import subprocess
import sys
import time

parser = argparse.ArgumentParser()
parser.add_argument("name")
parser.add_argument("--heavy", action="store_true")
parser.add_argument("--wait-for-headroom", action="store_true")
parser.add_argument("--minimum-free-mib", type=int, default=512)
parser.add_argument("--timeout", type=int, default=60)
parser.add_argument("--cwd", default=str(Path.cwd()))
separator = sys.argv.index("--") if "--" in sys.argv else len(sys.argv)
args = parser.parse_args(sys.argv[1:separator])
command = sys.argv[separator + 1:]
if not command:
    parser.error("a command is required")
destination = Path(__file__).resolve().parent
serial_lock = None
if args.heavy:
    serial_lock = (destination / "heavy.lock").open("w")
    while True:
        try:
            fcntl.flock(serial_lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            break
        except BlockingIOError:
            print("Waiting for the single heavy-work slot", flush=True)
            time.sleep(5)


def resources():
    result = {
        "at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "cpu": os.cpu_count(),
        "load": os.getloadavg(),
        "pressure": int(subprocess.check_output(
            ["rtk", "sysctl", "-n", "kern.memorystatus_vm_pressure_level"], text=True
        ).strip()),
        "vmStat": subprocess.check_output(["rtk", "vm_stat"], text=True),
    }
    page_size = int(re.search(r"page size of (\d+) bytes", result["vmStat"]).group(1))
    pages = sum(int(re.search(name + r":\s+(\d+)", result["vmStat"]).group(1)) for name in ["Pages free", "Pages speculative", "Pages purgeable"])
    result["availableMiB"] = pages * page_size / 1024 / 1024
    return result


record = {"args": command, "cwd": args.cwd, "before": resources()}
def sufficient(value):
    return value["load"][0] < value["cpu"] and (value["pressure"] == 1 or (value["pressure"] == 2 and value["availableMiB"] >= args.minimum_free_mib))

while args.heavy and not sufficient(record["before"]) and args.wait_for_headroom:
    print("Waiting for bounded workload headroom before " + args.name, flush=True)
    time.sleep(15)
    record["before"] = resources()
if args.heavy and not sufficient(record["before"]):
    record["blocked"] = "Insufficient CPU/memory headroom for the bounded workload; command was not started."
    (destination / (args.name + ".json")).write_text(json.dumps(record, indent=2) + "\n")
    print(record["blocked"])
    raise SystemExit(3)
started = time.monotonic()
with (destination / (args.name + ".log")).open("w") as output:
    child = subprocess.Popen(
        ["rtk", "nice", "-n", "10", *command], cwd=args.cwd,
        stdout=output, stderr=subprocess.STDOUT, start_new_session=True,
    )
    record["pid"] = child.pid
    try:
        record["exit"] = child.wait(timeout=args.timeout)
    except subprocess.TimeoutExpired:
        record["timedOut"] = True
        os.killpg(child.pid, signal.SIGTERM)
        try:
            child.wait(timeout=5)
        except subprocess.TimeoutExpired:
            os.killpg(child.pid, signal.SIGKILL)
            child.wait()
        record["exit"] = child.returncode
record["seconds"] = time.monotonic() - started
record["after"] = resources()
(destination / (args.name + ".json")).write_text(json.dumps(record, indent=2) + "\n")
print((destination / (args.name + ".log")).read_text()[-5000:])
raise SystemExit(record["exit"])
