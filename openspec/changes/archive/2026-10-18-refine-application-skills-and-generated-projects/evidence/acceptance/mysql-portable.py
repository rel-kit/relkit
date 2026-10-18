"""Extract verified Homebrew bottles into an owned directory; never install system services."""

import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
import urllib.parse
import urllib.request

evidence = Path(__file__).resolve().parent
destination = Path(tempfile.mkdtemp(prefix="relkit-mysql-bottles-")).resolve()
records = []
libraries = []
seen = set()


def headroom():
    while subprocess.check_output(["rtk", "sysctl", "-n", "kern.memorystatus_vm_pressure_level"], text=True).strip() != "1":
        print("Waiting for headroom before portable MySQL provisioning", flush=True)
        time.sleep(10)


def load(url):
    with urllib.request.urlopen(url, timeout=30) as response:
        return json.load(response)


def bottle(name):
    if name in seen:
        return
    seen.add(name)
    installed = Path("/opt/homebrew/opt") / name
    if installed.exists() and name != "mysql@8.4":
        libraries.append(str(installed / "lib"))
        records.append({"name": name, "installedLibraryOnly": str(installed)})
        return
    headroom()
    formula = load("https://formulae.brew.sh/api/formula/" + urllib.parse.quote(name) + ".json")
    for dependency in formula["dependencies"]:
        bottle(dependency)
    files = formula["bottle"]["stable"]["files"]
    selected = files.get("arm64_sequoia") or files.get("arm64_sonoma")
    if not selected:
        raise RuntimeError("No compatible ARM64 bottle for " + name)
    headroom()
    path = destination / (name.replace("@", "-") + ".tgz")
    repository = selected["url"].split("/v2/", 1)[1].split("/blobs/", 1)[0]
    token_url = "https://ghcr.io/token?" + urllib.parse.urlencode({"service": "ghcr.io", "scope": "repository:" + repository + ":pull"})
    token = load(token_url)["token"]
    request = urllib.request.Request(selected["url"], headers={"Authorization": "Bearer " + token})
    digest = hashlib.sha256()
    print("Downloading verified bottle " + name, flush=True)
    with urllib.request.urlopen(request, timeout=120) as response, path.open("wb") as output:
        while chunk := response.read(1024 * 1024):
            digest.update(chunk)
            output.write(chunk)
    if digest.hexdigest() != selected["sha256"]:
        raise RuntimeError("Bottle integrity mismatch: " + name)
    subprocess.run(["rtk", "nice", "-n", "10", "tar", "-xzf", str(path), "-C", str(destination)], check=True, timeout=60)
    bases = list((destination / name).glob("*"))
    base = next(p for p in bases if p.is_dir())
    libraries.append(str(base / "lib"))
    records.append({"name": name, "version": formula["versions"]["stable"], "sha256": digest.hexdigest(), "url": selected["url"], "base": str(base)})


try:
    bottle("mysql@8.4")
    mysql = next(item for item in records if item["name"] == "mysql@8.4")
    environment = {**os.environ, "DYLD_LIBRARY_PATH": ":".join(libraries)}
    result = subprocess.run([str(Path(mysql["base"]) / "bin/mysqld"), "--version"], env=environment, capture_output=True, text=True, timeout=10)
    print(result.stdout + result.stderr)
    if result.returncode:
        raise RuntimeError("Portable MySQL cannot load its verified libraries")
    report = {"directory": str(destination), "base": mysql["base"], "libraries": libraries, "bottles": records, "versionOutput": result.stdout}
    (evidence / "mysql-portable.json").write_text(json.dumps(report, indent=2) + "\n")
except Exception:
    (evidence / "mysql-portable-failed.json").write_text(json.dumps({"directory": str(destination), "bottles": records}, indent=2) + "\n")
    raise
