"""Remove only this acceptance run's retained disposable files after every owned job has exited."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

evidence=Path(__file__).resolve().parent
rows=subprocess.check_output(["rtk","proxy","ps","-axo","pid=,ppid=,command="],text=True).splitlines()
processes=[]
parents={}
for row in rows:
    parts=row.strip().split(None,2)
    if len(parts)==3:
        processes.append({"pid":int(parts[0]),"ppid":int(parts[1]),"command":parts[2]})
        parents[int(parts[0])]=int(parts[1])
own=set()
current=os.getpid()
while current and current not in own:
    own.add(current)
    current=parents.get(current,0)
markers=["refine-application-skills-and-generated-projects/evidence/acceptance/", "relkit-guidance-live-", "relkit-dialect-auth-", "relkit-packed-acceptance-", "relkit MySQL acceptance ", "relkit PG acceptance "]
remaining=[item for item in processes if item["pid"] not in own and any(marker in item["command"] for marker in markers)]
assert not remaining, remaining
directories=set()
for name in ["artifacts.json","mysql-portable.json","mysql-portable-failed.json","packed-resume.json","guidance-results.json"]:
    path=evidence / name
    if not path.exists(): continue
    record=json.loads(path.read_text())
    for field in ["directory","temporary"]:
        if field in record:
            candidate=Path(record[field]).resolve()
            if candidate.exists(): directories.add(candidate)
temporary=Path(tempfile.gettempdir()).resolve()
for candidate in temporary.glob("relkit-guidance-live-*"):
    manifest=candidate / "case01/before/package.json"
    assert manifest.exists() and json.loads(manifest.read_text())["name"]=="final-guidance-auth-orders", candidate
    directories.add(candidate.resolve())
removed=[]
allowed=["relkit-acceptance-artifacts-", "relkit-mysql-bottles-", "relkit-packed-acceptance-", "relkit-guidance-live-"]
for path in sorted(directories):
    assert path.parent==temporary and any(path.name.startswith(prefix) for prefix in allowed), path
    shutil.rmtree(path)
    removed.append({"path":str(path),"absent":not path.exists()})
for path in [evidence / "__pycache__", evidence / "heavy.lock", evidence / "packed-resume.json"]:
    if path.is_dir(): shutil.rmtree(path)
    elif path.exists(): path.unlink()
report={"ownedProcessesRemaining":remaining,"removed":removed,"allRemoved":all(item["absent"] for item in removed),"unrelatedProcessesStopped":False}
(evidence / "final-cleanup.json").write_text(json.dumps(report,indent=2)+"\n")
print(json.dumps(report,indent=2))
