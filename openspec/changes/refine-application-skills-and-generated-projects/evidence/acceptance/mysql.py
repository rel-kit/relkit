"""Actual isolated MySQL server, consumer Kit delegation, history preservation and failures."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time
import signal
from local_support import repository, evidence, port, run, stop

portable=json.loads((evidence / "mysql-portable.json").read_text())
base=Path(portable["base"])
temporary=Path(tempfile.mkdtemp(prefix="relkit MySQL acceptance "))
data=temporary / "data"
app=temporary / "application with spaces"
app.mkdir()
selected=port()
env={"DYLD_LIBRARY_PATH":":".join(portable["libraries"])}
report={"temporary":str(temporary),"workspaceLinked":True,"commands":[]}
child=None
native_pid=None
handle=None
config_path=app / "nested config/drizzle.config.ts"
config_path.parent.mkdir()

def sql(label,query,database="acceptance"):
    return run(report,"mysql-"+label,[base / "bin/mysql","--no-defaults","--protocol=TCP","--host=127.0.0.1","--port="+str(selected),"--user=root","--batch","--skip-column-names",*([database] if database else []),"--execute",query],app,env).strip()

def config(database="acceptance"):
    url="mysql://root@127.0.0.1:"+str(selected)+"/"+database
    config_path.write_text("export default "+json.dumps({"dialect":"mysql","schema":"./src/services/database/schema/index.ts","out":"./src/services/database/migrations","dbCredentials":{"url":url},"migrations":{"table":"acceptance_log"}})+";\n")
    return url

def migrate(label,expected=0):
    output=run(report,"mysql-"+label,["bun","--smol",repository / "packages/cli/dist/bin.js","--json","db","migrate","--config",config_path],app,env,expected)
    value=json.loads(output)
    assert value["ok"] == (expected==0)
    return value

try:
    common=["--no-defaults","--basedir="+str(base),"--datadir="+str(data),"--innodb-buffer-pool-size=16M","--performance-schema=OFF"]
    run(report,"mysql-initialize",[base / "bin/mysqld",*common,"--initialize-insecure"],app,env,timeout=120)
    handle=(evidence / "mysql-server.log").open("w")
    child=subprocess.Popen(["rtk",str(base / "bin/mysqld"),*common,"--pid-file="+str(temporary / "mysql.pid"),"--bind-address=127.0.0.1","--port="+str(selected),"--socket="+str(temporary / "mysql.sock"),"--max-connections=5","--table-open-cache=32","--thread-cache-size=0","--innodb-read-io-threads=1","--innodb-write-io-threads=1","--mysqlx=OFF","--skip-log-bin"],env={**os.environ,**env},stdout=handle,stderr=subprocess.STDOUT,start_new_session=True)
    report["serverPid"]=child.pid
    for attempt in range(120):
        probe=subprocess.run([str(base / "bin/mysqladmin"),"--no-defaults","--protocol=TCP","--host=127.0.0.1","--port="+str(selected),"--user=root","ping"],env={**os.environ,**env},capture_output=True,timeout=2)
        if probe.returncode==0: break
        if child.poll() is not None: raise RuntimeError("MySQL server exited: "+(evidence / "mysql-server.log").read_text()[-2500:])
        time.sleep(.25)
    else: raise RuntimeError("MySQL did not become ready")
    native_pid=int((temporary / "mysql.pid").read_text())
    report["nativeServerPid"]=native_pid
    sql("create","CREATE DATABASE acceptance; CREATE DATABASE acceptance_fresh;","")
    catalog=json.loads((repository / "packages/cli/package.json").read_text())["relkit"]["buildCatalog"]["dependencies"]
    (app / "package.json").write_text(json.dumps({"type":"module","dependencies":{name:catalog[name] for name in ["drizzle-orm","drizzle-kit"]}}))
    (app / "relkit.config.ts").write_text("export default {};\n")
    modules=app / "node_modules"
    modules.mkdir()
    for name in ["drizzle-orm","drizzle-kit"]:
        target=repository / "node_modules" / name
        if not target.exists(): target=repository / "node_modules/.bun" / (name+"@"+catalog[name]) / "node_modules" / name
        (modules / name).symlink_to(target)
    schema=app / "src/services/database/schema/index.ts"
    schema.parent.mkdir(parents=True)
    schema.write_text('import { mysqlTable, int, varchar } from "drizzle-orm/mysql-core";\nexport const entries=mysqlTable("entries", { id:int().autoincrement().primaryKey(), value:varchar({length:255}).notNull() });\n')
    url=config()
    generate=["bun","--smol",modules / "drizzle-kit/bin.cjs","generate","--config",config_path]
    run(report,"mysql-generate-initial",[*generate,"--name=initial"],app,env)
    report["initialMigrate"]=migrate("migrate-initial")
    sql("insert","INSERT INTO entries(value) VALUES ('business-row-survives');")
    query="SELECT * FROM acceptance_log ORDER BY id;"
    before=sql("log-before",query)
    migrate("repeat-initial")
    assert sql("log-repeat-initial",query)==before
    schema.write_text(schema.read_text().replace("value:varchar({length:255}).notNull()",'value:varchar({length:255}).notNull(), note:varchar({length:255}).default("second")'))
    run(report,"mysql-generate-second",[*generate,"--name=second"],app,env)
    migrate("migrate-second")
    after=sql("log-second",query)
    assert len(after.splitlines())==len(before.splitlines())+1
    rows=sql("business-rows","SELECT value,note FROM entries ORDER BY id;")
    assert rows=="business-row-survives\tsecond",rows
    migrate("repeat-second")
    assert sql("log-repeat-second",query)==after
    config("acceptance_fresh")
    migrate("fresh-history")
    assert len(sql("fresh-log",query,"acceptance_fresh").splitlines())==2
    config()
    invalid=app / "src/services/database/migrations/20300101000000_invalid/migration.sql"
    invalid.parent.mkdir()
    invalid.write_text("THIS IS INVALID SQL;\n")
    report["failedMigration"]=migrate("failed-sql",1)
    assert sql("log-after-failure",query)==after
    assert sql("rows-after-failure","SELECT value,note FROM entries ORDER BY id;")==rows
    invalid.unlink()
    invalid.parent.rmdir()
    report["auth"]=json.loads(run(report,"mysql-auth-runtime",["bun","--smol",evidence / "dialect-auth.ts","mysql",url],repository,env,timeout=240).split("DIALECT_AUTH_RESULT=")[-1])
    report.update(passed=True,businessRows=rows,appliedLog=after)
    report["historyHashes"]={str(p.relative_to(app)):hashlib.sha256(p.read_bytes()).hexdigest() for p in (app / "src/services/database/migrations").rglob("*") if p.is_file()}
except Exception as error:
    report["blocker"]=str(error)
    raise
finally:
    if native_pid is None and (temporary / "mysql.pid").exists():
        native_pid=int((temporary / "mysql.pid").read_text())
    if child is not None:
        shutdown=subprocess.run([str(base / "bin/mysqladmin"),"--no-defaults","--protocol=TCP","--host=127.0.0.1","--port="+str(selected),"--user=root","shutdown"],env={**os.environ,**env},capture_output=True,timeout=15)
        report["shutdownExit"]=shutdown.returncode
        stop(child)
    if native_pid is not None:
        command=subprocess.run(["rtk","proxy","ps","-p",str(native_pid),"-o","command="],capture_output=True,text=True).stdout
        if command.strip():
            assert str(data) in command and str(base / "bin/mysqld") in command
            os.kill(native_pid,signal.SIGTERM)
            for attempt in range(100):
                if not subprocess.run(["rtk","proxy","ps","-p",str(native_pid),"-o","pid="],capture_output=True,text=True).stdout.strip(): break
                time.sleep(.1)
            else:
                os.kill(native_pid,signal.SIGKILL)
                time.sleep(.2)
        assert not subprocess.run(["rtk","proxy","ps","-p",str(native_pid),"-o","pid="],capture_output=True,text=True).stdout.strip()
    if handle: handle.close()
    shutil.rmtree(temporary)
    report["cleanup"]={"wrapperExited":child is None or child.poll() is not None,"nativePidAbsent":native_pid is None or not subprocess.run(["rtk","proxy","ps","-p",str(native_pid),"-o","pid="],capture_output=True,text=True).stdout.strip(),"temporaryRemoved":not temporary.exists()}
    (evidence / "mysql-results.json").write_text(json.dumps(report,indent=2)+"\n")
