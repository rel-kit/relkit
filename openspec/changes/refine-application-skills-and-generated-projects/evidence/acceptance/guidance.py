"""Execute independently authored disposable guidance fixtures, one operation at a time."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time
import urllib.request
from local_support import repository, evidence, headroom, link, port, run, stop

source = evidence.parent / "final-guidance"
temporary = Path(tempfile.mkdtemp(prefix="relkit-guidance-live-"))
report = {"temporary":str(temporary),"workspaceLinked":True,"commands":[]}
children = []
handles = []

def server(label,args,root,env,path):
    headroom(384)
    handle = (evidence / (label + ".log")).open("w")
    handles.append(handle)
    child = subprocess.Popen(["rtk","nice","-n","10",*map(str,args)],cwd=root,env={**os.environ,"NODE_OPTIONS":"--max-old-space-size=512", "NEXT_TELEMETRY_DISABLED":"1",**env},stdout=handle,stderr=subprocess.STDOUT,start_new_session=True)
    children.append(child)
    report.setdefault("servers",[]).append({"label":label,"pid":child.pid})
    for attempt in range(180):
        try:
            with urllib.request.urlopen(path,timeout=1) as response:
                if response.status == 200: return child
        except Exception: pass
        if child.poll() is not None: break
        time.sleep(.25)
    raise RuntimeError(label + " did not become ready")

try:
    first = temporary / "case01"
    shutil.copytree(source / "case01",first)
    app = first / "before"
    link(app)
    env = {"DATABASE_PATH":str(first / "migration.sqlite"),"BETTER_AUTH_SECRET":"local-guidance-secret-for-isolated-evidence-only-123456", "BETTER_AUTH_URL":"http://127.0.0.1:3000"}
    kit = app / "node_modules/.bin/drizzle-kit"
    cli = app / "node_modules/.bin/relkit"
    run(report,"guidance01-generate-before",["bun","--smol",kit,"generate","--name=before"],app,env)
    run(report,"guidance01-migrate-before",["bun","--smol",cli,"db","migrate"],app,env)
    run(report,"guidance01-seed-business",["bun","--smol","-e",'import {Database} from "bun:sqlite"; const db=new Database(process.env.DATABASE_PATH); db.exec("INSERT INTO notes(id,content) VALUES (0,\'Preserve this existing record\')"); db.close();'],app,env)
    shutil.copytree(first / "app",app,dirs_exist_ok=True)
    run(report,"guidance01-generate-extension",["bun","--smol",kit,"generate","--name=orders"],app,env)
    run(report,"guidance01-migrate-extension",["bun","--smol",cli,"db","migrate"],app,env)
    run(report,"guidance01-repeat",["bun","--smol",cli,"db","migrate"],app,env)
    for operation,args in [("check",["bun","--smol",cli,"check"]),("typecheck",["node","--max-old-space-size=512",app / "node_modules/typescript/bin/tsc","--noEmit"]),("test",["bun","--smol","test","tests/integration/auth-orders.test.ts","--timeout","30000"]),("build",["bun","--smol",cli,"build"])]:
        run(report,"guidance01-"+operation,args,app,env,timeout=120)
    report["case01"] = {"migrationBeforeAndExtension":True,"realHTTPHarness":True,"ownershipValidationPersistence":True}
    report["case01"]["network"] = json.loads(run(report,"guidance01-production-http",["bun","--smol",evidence / "guidance-network.ts",app],app,env,timeout=90))
    second = temporary / "case02"
    shutil.copytree(source / "case02/app",second)
    link(second)
    config = second / "web/next.config.ts"
    config.write_text(config.read_text().replace("withRelkit({}", "withRelkit({ experimental: { cpus: 1, workerThreads: false } }"))
    api_port,web_port = port(),port()
    api,web = "http://127.0.0.1:"+str(api_port),"http://127.0.0.1:"+str(web_port)
    env={"RELKIT_ALLOWED_ORIGINS":web,"FULLSTACK_BASE_URL":web,"RELKIT_API_URL":api,"NEXT_PUBLIC_RELKIT_API_URL":api}
    cli=second / "node_modules/.bin/relkit"
    for label,args in [("check",["bun","--smol",cli,"check"]),("typecheck-backend",["node","--max-old-space-size=512",second / "node_modules/typescript/bin/tsc","--noEmit"]),("typecheck-web",["node","--max-old-space-size=512",second / "node_modules/typescript/bin/tsc","--noEmit","-p","web/tsconfig.json"]),("test",["bun","--smol","test","tests/integration/greeting.test.ts"]),("build-api",["bun","--smol",cli,"build"]),("build-web",["node","--max-old-space-size=512",second / "node_modules/next/dist/bin/next","build","web","--webpack"])]:
        run(report,"guidance02-"+label,args,second,env,timeout=240)
    api_child=server("guidance02-api",["bun","--smol",cli,"start","--port",str(api_port)],second,env,api+"/hello?name=Relkit")
    web_child=server("guidance02-web",["node","--max-old-space-size=512",second / "node_modules/next/dist/bin/next","start","web","--hostname","127.0.0.1","--port",str(web_port)],second,env,web)
    run(report,"guidance02-browser",["bun","--smol",second / "node_modules/.bin/playwright","test","--config","playwright.config.ts","--workers=1"],second,env,timeout=120)
    stop(web_child)
    stop(api_child)
    report["case02"]={"backendHTTP":True,"frontendProductionBuild":True,"realBrowser":True,"workers":1}
    report["passed"]=True
except Exception as error:
    report["blocker"]=str(error)
    raise
finally:
    for child in reversed(children): stop(child)
    for handle in handles: handle.close()
    report["cleanup"]={"childrenExited":all(child.poll() is not None for child in children)}
    if report.get("passed"):
        shutil.rmtree(temporary)
    report["cleanup"]["temporaryRemoved"]=not temporary.exists()
    (evidence / "guidance-results.json").write_text(json.dumps(report,indent=2)+"\n")
