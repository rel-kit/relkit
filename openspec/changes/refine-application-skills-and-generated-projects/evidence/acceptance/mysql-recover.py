"""Reuse verified extracted bottles after macOS first-launch validation exceeded ten seconds."""
import json
import os
from pathlib import Path
import subprocess
import hashlib
import urllib.request
import urllib.parse

evidence = Path(__file__).resolve().parent
report = json.loads((evidence / "mysql-portable-failed.json").read_text())
def load(url):
    with urllib.request.urlopen(url, timeout=30) as response:
        return json.load(response)

for item in report["bottles"]:
    if item["name"] != "icu4c@78" or "base" in item:
        continue
    formula = load("https://formulae.brew.sh/api/formula/icu4c@78.json")
    selected = formula["bottle"]["stable"]["files"]["arm64_sequoia"]
    repository = selected["url"].split("/v2/", 1)[1].split("/blobs/", 1)[0]
    token = load("https://ghcr.io/token?" + urllib.parse.urlencode({"service": "ghcr.io", "scope": "repository:" + repository + ":pull"}))["token"]
    request = urllib.request.Request(selected["url"], headers={"Authorization": "Bearer " + token})
    path = Path(report["directory"]) / "icu.tgz"
    digest = hashlib.sha256()
    with urllib.request.urlopen(request, timeout=120) as response, path.open("wb") as output:
        while chunk := response.read(1024 * 1024):
            digest.update(chunk)
            output.write(chunk)
    assert digest.hexdigest() == selected["sha256"]
    subprocess.run(["rtk", "tar", "-xzf", str(path), "-C", report["directory"]], check=True, timeout=60)
    item.update(base=str(next(p for p in (Path(report["directory"]) / item["name"]).iterdir() if p.is_dir())), sha256=digest.hexdigest(), url=selected["url"])
    (evidence / "mysql-portable-failed.json").write_text(json.dumps(report, indent=2) + "\n")
libraries = [str(Path(item.get("base", item.get("installedLibraryOnly"))) / "lib") for item in report["bottles"]]
base = next(item["base"] for item in report["bottles"] if item["name"] == "mysql@8.4")
result = subprocess.run(["rtk", str(Path(base) / "bin/mysqld"), "--version"], env={**os.environ, "DYLD_LIBRARY_PATH": ":".join(libraries)}, capture_output=True, text=True, timeout=90)
print(result.stdout + result.stderr)
result.check_returncode()
report.update(base=base, libraries=libraries, versionOutput=result.stdout)
(evidence / "mysql-portable.json").write_text(json.dumps(report, indent=2) + "\n")
