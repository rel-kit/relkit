"""Serial independent registry fixtures for the Drizzle compatibility gate.

Run with rtk python3 openspec/changes/refine-application-skills-and-generated-projects/evidence/compatibility/run.py.
Writes raw logs/results beside this script; always removes its disposable installs.
No repository dependencies, database, or dependency files are rewritten.
"""
import hashlib
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import tempfile
import urllib.request

HERE = Path(__file__).resolve().parent
OUTPUT = HERE / "runs" / datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
OUTPUT.mkdir(parents=True)
ROOT = HERE.parents[4]
CATALOG = json.loads((ROOT / "package.json").read_text())["catalog"]
RESULTS = {"commands": [], "fixtures": {}, "cleanup": False}
ENV = {k: v for k, v in os.environ.items() if not k.startswith(("DATABASE_", "BUN_"))}
ENV.update({"BUN_CONFIG_MAX_HTTP_REQUESTS": "1", "NODE_OPTIONS": "--max-old-space-size=512"})


def write(path, value):
    path.write_text(json.dumps(value, indent=2) + "\n")


def run(label, cwd, args):
    """Bound and join each uniquely owned process group before the next probe."""
    pressure = subprocess.check_output(["sysctl", "-n", "kern.memorystatus_vm_pressure_level"], text=True).strip()
    if pressure != "1":
        raise RuntimeError(f"Deferred {label}: memory pressure level {pressure}; no child launched")
    process = subprocess.Popen(["nice", "-n", "10", *args], cwd=cwd, env=ENV,
                               stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                               start_new_session=True)
    entry = {"label": label, "cwd": str(cwd), "args": args, "pid": process.pid}
    RESULTS["commands"].append(entry)
    try:
        output, _ = process.communicate(timeout=120)
    finally:
        if process.poll() is None:
            os.killpg(process.pid, signal.SIGTERM)
            try:
                process.communicate(timeout=5)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.communicate()
    entry["exit"] = process.returncode
    entry["log"] = label + ".log"
    (OUTPUT / entry["log"]).write_bytes(output)
    print(label, process.returncode, flush=True)
    return process.returncode, output.decode(errors="replace")


def require(label, cwd, args):
    code, output = run(label, cwd, args)
    if code != 0:
        raise RuntimeError(label + " failed; inspect its raw log")
    return output


def metadata(name, version):
    with urllib.request.urlopen(f"https://registry.npmjs.org/{name}/{version}", timeout=20) as response:
        package = json.load(response)
    return {"version": version, "dist": package["dist"]}


def hashes(directory):
    return {str(p.relative_to(directory)): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in sorted(directory.rglob("*")) if p.is_file()}


def fixture(parent, label, orm, kit, patched=False):
    directory = parent / label
    directory.mkdir()
    dependencies = {name: CATALOG[name] for name in ["effect", "@effect/sql-pg", "typescript", "@types/bun"]}
    dependencies.update({"drizzle-orm": orm, "drizzle-kit": kit})
    manifest = {"name": label, "private": True, "type": "module", "dependencies": dependencies}
    if patched:
        shutil.copyfile(ROOT / "patches/drizzle-orm.patch", directory / "repair.patch")
        manifest["patchedDependencies"] = {f"drizzle-orm@{orm}": "repair.patch"}
    write(directory / "package.json", manifest)
    write(directory / "tsconfig.json", {"compilerOptions": {
        "target": "ES2022", "module": "ESNext", "moduleResolution": "Bundler",
        "types": ["bun"], "strict": True, "noUncheckedIndexedAccess": True,
        "exactOptionalPropertyTypes": True, "verbatimModuleSyntax": True,
        "isolatedModules": True, "noEmit": True, "skipLibCheck": False,
    }, "files": ["probe.ts"]})
    for name in ["probe.ts", "migrate.ts", "declarations.mjs"]:
        shutil.copyfile(HERE / name, directory / name)
    (directory / "schema.ts").write_text('import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";\n'
        'export const items = sqliteTable("items", { id: integer().primaryKey({ autoIncrement: true }), name: text().notNull() });\n')
    (directory / "drizzle.config.ts").write_text('import { defineConfig } from "drizzle-kit";\n'
        'export default defineConfig({ dialect: "sqlite", schema: "./schema.ts", out: "./history", dbCredentials: { url: "./app.sqlite" } });\n')
    RESULTS["fixtures"][label] = {"manifest": manifest, "packages": {name: metadata(name, v) for name, v in dependencies.items()}}
    require(label + "-install", directory, ["bun", "install", "--ignore-scripts", "--network-concurrency", "1"])
    require(label + "-frozen", directory, ["bun", "install", "--frozen-lockfile", "--ignore-scripts", "--network-concurrency", "1"])
    run(label + "-types", directory, ["node", "--max-old-space-size=512", "declarations.mjs"])
    return directory


def migration(label, directory, filename="app.sqlite", seed=False):
    output = require(label, directory, ["bun", "migrate.ts", filename, *(["--seed"] if seed else [])])
    return json.loads(output)


def main():
    with tempfile.TemporaryDirectory(prefix="relkit-drizzle-compat-") as temporary:
        parent = Path(temporary)
        RESULTS["temporaryRoot"] = temporary
        baseline = fixture(parent, "baseline", CATALOG["drizzle-orm"], CATALOG["drizzle-kit"], True)
        require("baseline-generate", baseline, ["bun", "--bun", "node_modules/drizzle-kit/bin.cjs", "generate", "--name", "initial"])
        state = migration("baseline-apply", baseline, seed=True)
        assert migration("baseline-noop", baseline) == state
        history = hashes(baseline / "history")
        RESULTS["baseline"] = {"historyHashes": history, "state": state}
        for label, orm, kit in [
            ("current-unpatched", CATALOG["drizzle-orm"], CATALOG["drizzle-kit"]),
            ("rc5", "1.0.0-rc.5-5935859", "1.0.0-rc.5-5935859"),
            ("stable", "0.45.4", "0.31.11"),
        ]:
            directory = fixture(parent, label, orm, kit)
            shutil.copytree(baseline / "history", directory / "history")
            shutil.copyfile(baseline / "app.sqlite", directory / "app.sqlite")
            code, output = run(label + "-baseline-history", directory, ["bun", "migrate.ts", "app.sqlite"])
            RESULTS["fixtures"][label]["historyUnchanged"] = hashes(directory / "history") == history
            if code != 0:
                RESULTS["fixtures"][label]["migrationAcceptance"] = "failed reading unchanged baseline history"
                continue
            assert json.loads(output) == state
            if label != "rc5":
                continue
            schema = directory / "schema.ts"
            schema.write_text(schema.read_text().replace("name: text().notNull()", "name: text().notNull(), note: text()"))
            require("rc5-generate-next", directory, ["bun", "--bun", "node_modules/drizzle-kit/bin.cjs", "generate", "--name", "next"])
            assert all(hashes(directory / "history")[name] == digest for name, digest in history.items())
            advanced = migration("rc5-apply-next", directory)
            assert len(advanced["log"]) == len(state["log"]) + 1
            assert advanced["log"][:len(state["log"])] == state["log"]
            assert advanced["rows"][0]["name"] == "preserved business row"
            assert migration("rc5-next-noop", directory) == advanced
            fresh = migration("rc5-fresh", directory, "fresh.sqlite")
            identity = lambda rows: [{k: v for k, v in row.items() if k != "applied_at"} for row in rows]
            assert fresh["schema"] == advanced["schema"] and identity(fresh["log"]) == identity(advanced["log"])
            assert fresh["rows"] == []
            RESULTS["fixtures"][label]["migrationAcceptance"] = "baseline/noop/next/fresh passed; declaration gate remains separate"
            RESULTS["fixtures"][label]["nextState"] = advanced
            RESULTS["fixtures"][label]["finalHistoryHashes"] = hashes(directory / "history")


if __name__ == "__main__":
    try:
        main()
    finally:
        RESULTS["cleanup"] = not Path(RESULTS.get("temporaryRoot", "/")).exists()
        write(OUTPUT / "results.json", RESULTS)
