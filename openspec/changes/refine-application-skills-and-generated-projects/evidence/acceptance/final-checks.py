"""Scoped serial final source gates; no full-repository build, push or cloud operations."""
import json
from pathlib import Path
import subprocess
from local_support import repository, evidence, run as invoke, headroom

state=evidence / "final-checks-results.json"
report=json.loads(state.read_text()) if state.exists() else {"commands":[]}
report.pop("blocker",None)
def run(report,label,args,cwd,**options):
    previous=next((item for item in report["commands"] if item["label"]==label and item["exit"]==0 and item["args"]==list(map(str,args))),None)
    if previous:
        print("Retaining completed source gate: "+label,flush=True)
        return (evidence / (label+".log")).read_text()
    return invoke(report,label,args,cwd,**options)
try:
    changed=subprocess.check_output(["rtk","proxy","git","diff","--name-only","--diff-filter=ACMRT"],text=True).splitlines()
    untracked=subprocess.check_output(["rtk","proxy","git","ls-files","--others","--exclude-standard"],text=True).splitlines()
    files=[path for path in sorted(set(changed+untracked)) if not path.startswith("openspec/") and Path(path).suffix in [".ts",".tsx",".json",".md",".mdx",".mjs"]]
    run(report,"final-format",["bun","--smol","node_modules/prettier/bin/prettier.cjs","--write",*files],repository,timeout=120)
    run(report,"final-native",["bun","--smol","test","packages/cli/tests/database","tests/generator/database-ownership.test.ts","tests/unit/packed-registry.test.ts","tests/unit/release-check-listing.test.ts","tests/unit/sync-release.test.ts","tests/unit/build-catalog.test.ts","tests/unit/catalog-manifest.test.ts","tests/unit/catalog-bootstrap.test.ts","--timeout","30000"],repository,timeout=180)
    run(report,"final-generator",["bun","--smol","test","tests/generator/sqlite-app-tooling.test.ts","tests/generator/add-transaction.test.ts","tests/generator/add-platform-acceptance.test.ts","--timeout","30000"],repository,timeout=180)
    run(report,"final-sync-first",["bun","--smol","scripts/sync-release.ts"],repository)
    run(report,"final-sync-second",["bun","--smol","scripts/sync-release.ts"],repository)
    run(report,"final-release-notes-write",["bun","--smol","scripts/release-check.ts","--notes-only","--write-notes","--allow-dirty"],repository)
    run(report,"final-release-notes-check",["bun","--smol","scripts/release-check.ts","--notes-only","--allow-dirty"],repository)
    run(report,"final-typecheck-product",["node","--max-old-space-size=512","node_modules/typescript/bin/tsc","-b","packages/cli","packages/create-relkit","--pretty","false"],repository,timeout=180)
    headroom(768)
    run(report,"final-typecheck-docs",["node","--max-old-space-size=768","../../node_modules/typescript/bin/tsc","--noEmit","--pretty","false"],repository / "apps/docs",timeout=180)
    run(report,"final-docs",["bun","--smol","test","apps/docs/tests/auth-learning.test.ts","apps/docs/tests/database-learning.test.ts","apps/docs/tests/start-learning.test.ts","apps/docs/tests/service-learning.test.ts","apps/docs/tests/cli-scaffolding.test.ts"],repository,timeout=120)
    run(report,"final-cli-reference",["bun","--smol","apps/docs/scripts/generate.ts","--cli-only","--check"],repository,timeout=120)
    mdx='import {createRequire} from "node:module"; import {resolve} from "node:path"; import {realpathSync} from "node:fs"; const require=createRequire(realpathSync(resolve("apps/docs/node_modules/fumadocs-mdx/package.json"))); const {compile}=await import(require.resolve("@mdx-js/mdx")); for (const path of process.argv.slice(1)) { await compile(await Bun.file(path).text(),{jsx:true}); console.log("Compiled MDX: "+path); }'
    run(report,"final-mdx",["bun","--smol","-e",mdx,*[path for path in files if path.endswith(".mdx")]],repository,timeout=120)
    run(report,"final-boundaries",["bun","--smol","scripts/check-boundaries.ts"],repository,timeout=180)
    run(report,"final-authoring-lint",["bun","--smol","scripts/lint.ts"],repository,timeout=120)
    run(report,"final-konsistent",["bun","--smol","run","konsistent","--","validate"],repository,timeout=120)
    run(report,"final-openspec",["openspec","validate","refine-application-skills-and-generated-projects","--strict"],repository)
    report["passed"]=True
except Exception as error:
    report["blocker"]=str(error)
    raise
finally:
    (evidence / "final-checks-results.json").write_text(json.dumps(report,indent=2)+"\n")
