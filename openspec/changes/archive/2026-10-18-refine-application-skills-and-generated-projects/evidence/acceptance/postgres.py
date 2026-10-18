"""Real bounded PostgreSQL delegation proof; local links are explicitly not packed evidence."""

import hashlib
import json
import os
from pathlib import Path
import shutil
import signal
import socket
import subprocess
import tempfile
import time
from local_support import headroom

repository = Path.cwd()
evidence = Path(__file__).resolve().parent
temporary = Path(tempfile.mkdtemp(prefix="relkit PG acceptance ")).resolve()
cluster = temporary / "cluster"
application = temporary / "application with spaces"
application.mkdir()
report = {"temporary": str(temporary), "commands": [], "workspaceLinked": True}
started = False


def save():
    (evidence / "postgres-results.json").write_text(json.dumps(report, indent=2) + "\n")


def pressure():
    return int(subprocess.check_output(
        ["rtk", "sysctl", "-n", "kern.memorystatus_vm_pressure_level"], text=True).strip())


def run(label, args, expected=0, gate=True, cwd=None, timeout=60):
    if gate:
        headroom()
    before = time.monotonic()
    record = {"label": label, "args": list(map(str, args)), "beforePressure": pressure()}
    print(label, flush=True)
    child = subprocess.Popen(
        ["rtk", "nice", "-n", "10", *map(str, args)], cwd=cwd or application,
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, start_new_session=True,
    )
    record["pid"] = child.pid
    try:
        output = child.communicate(timeout=timeout)[0].decode(errors="replace")
    except subprocess.TimeoutExpired:
        os.killpg(child.pid, signal.SIGINT)
        try:
            output = child.communicate(timeout=5)[0].decode(errors="replace")
        except subprocess.TimeoutExpired:
            os.killpg(child.pid, signal.SIGKILL)
            output = child.communicate()[0].decode(errors="replace")
        record["timedOut"] = True
    record.update(exit=child.returncode, seconds=time.monotonic() - before, afterPressure=pressure())
    report["commands"].append(record)
    (evidence / ("pg-" + label + ".log")).write_text(output)
    save()
    if child.returncode != expected:
        raise RuntimeError(label + " exited " + str(child.returncode) + ": " + output[-2000:])
    return output


def sql(label, query, database="postgres"):
    return run(label, ["psql", "--no-psqlrc", "--tuples-only", "--no-align", "--dbname", url(database), "--set", "ON_ERROR_STOP=1", "--command", query], gate=False).strip()


def url(database="postgres"):
    return "postgresql://relkit_acceptance@127.0.0.1:" + str(port) + "/" + database


def config(database="postgres"):
    path = application / "nested config" / "drizzle.config.ts"
    path.parent.mkdir(exist_ok=True)
    path.write_text("export default " + json.dumps({
        "dialect": "postgresql", "schema": "./src/services/database/schema/index.ts",
        "out": "./src/services/database/migrations", "dbCredentials": {"url": url(database)},
        "migrations": {"table": "acceptance_log", "schema": "acceptance_history"},
    }) + ";\n")
    return str(path)


def migrate(label, expected=0):
    output = run(label, ["bun", "--smol", repository / "packages/cli/dist/bin.js", "--json", "db", "migrate", "--config", config_path], expected)
    value = json.loads(output)
    assert value["ok"] == (expected == 0), value
    return value


try:
    run("initdb", ["initdb", "-D", cluster, "-U", "relkit_acceptance", "-A", "trust", "--no-locale", "--encoding=UTF8", "--no-sync"])
    with socket.socket() as reservation:
        reservation.bind(("127.0.0.1", 0))
        port = reservation.getsockname()[1]
    socket_dir = temporary / "socket"
    socket_dir.mkdir()
    # Unix socket path must be short; TCP is used for every proof query.
    options = "-h 127.0.0.1 -p " + str(port) + " -k '' -c shared_buffers=8MB -c max_connections=5 -c autovacuum=off -c max_worker_processes=0 -c max_parallel_workers=0"
    run("start", ["pg_ctl", "-D", cluster, "-w", "-t", "10", "-l", temporary / "postgres.log", "-o", options, "start"])
    started = True
    report["postmasterPid"] = int((cluster / "postmaster.pid").read_text().splitlines()[0])
    catalog = json.loads((repository / "packages/cli/package.json").read_text())["relkit"]["buildCatalog"]["dependencies"]
    (application / "package.json").write_text(json.dumps({"type": "module", "dependencies": {name: catalog[name] for name in ["drizzle-orm", "drizzle-kit"]}}))
    (application / "relkit.config.ts").write_text("export default {};\n")
    modules = application / "node_modules"
    modules.mkdir()
    for name in ["drizzle-orm", "drizzle-kit"]:
        target = repository / "node_modules" / name
        if not target.exists():
            target = repository / "node_modules/.bun" / (name + "@" + catalog[name]) / "node_modules" / name
        assert target.exists(), target
        (modules / name).symlink_to(target)
    schema = application / "src/services/database/schema/index.ts"
    schema.parent.mkdir(parents=True)
    schema.write_text('import { pgTable, serial, text } from "drizzle-orm/pg-core";\nexport const entries = pgTable("entries", { id: serial().primaryKey(), value: text().notNull() });\n')
    config_path = config()
    kit = application / "node_modules/drizzle-kit/bin.cjs"
    generate = ["bun", "--smol", "--bun", kit, "generate", "--config", config_path]
    run("generate-initial", [*generate, "--name=initial"])
    report["initialMigrate"] = migrate("migrate-initial")
    sql("insert", "INSERT INTO entries(value) VALUES ('business-row-survives');")
    log_query = "SELECT coalesce(json_agg(t), '[]') FROM (SELECT * FROM acceptance_history.acceptance_log ORDER BY id) t;"
    before = sql("log-before-repeat", log_query)
    migrate("repeat-initial")
    assert sql("log-after-repeat", log_query) == before
    schema.write_text(schema.read_text().replace("value: text().notNull()", 'value: text().notNull(), note: text().default("second")'))
    run("generate-second", [*generate, "--name=second"])
    migrate("migrate-second")
    after = sql("log-second", log_query)
    assert len(json.loads(after)) == len(json.loads(before)) + 1
    rows = sql("business-rows", "SELECT json_agg(t) FROM (SELECT value,note FROM entries ORDER BY id) t;")
    assert json.loads(rows) == [{"value": "business-row-survives", "note": "second"}]
    migrate("repeat-second")
    assert sql("log-repeat-second", log_query) == after
    sql("fresh-database", "CREATE DATABASE acceptance_fresh;")
    config_path = config("acceptance_fresh")
    migrate("fresh-full-history")
    assert len(json.loads(sql("fresh-log", log_query, "acceptance_fresh"))) == 2
    config_path = config()
    invalid = application / "src/services/database/migrations/20300101000000_invalid/migration.sql"
    invalid.parent.mkdir()
    invalid.write_text("THIS IS INVALID SQL;\n")
    report["failedMigration"] = migrate("failed-sql", 1)
    assert sql("log-after-failure", log_query) == after
    assert sql("rows-after-failure", "SELECT json_agg(t) FROM (SELECT value,note FROM entries ORDER BY id) t;") == rows
    report["auth"] = json.loads(run("auth-runtime", ["bun", "--smol", evidence / "dialect-auth.ts", "postgresql", url()], cwd=repository, timeout=240).split("DIALECT_AUTH_RESULT=")[-1])
    report.update(passed=True, businessRows=json.loads(rows), appliedLog=json.loads(after))
    report["historyHashes"] = {str(p.relative_to(application)): hashlib.sha256(p.read_bytes()).hexdigest() for p in (application / "src/services/database/migrations").rglob("*") if p.is_file()}
except Exception as error:
    report["blocker"] = str(error)
    raise
finally:
    if started or (cluster / "postmaster.pid").exists():
        run("stop", ["pg_ctl", "-D", cluster, "-m", "fast", "-w", "-t", "10", "stop"], gate=False)
    report["cleanup"] = {"postmasterPidFileAbsent": not (cluster / "postmaster.pid").exists()}
    shutil.rmtree(temporary)
    report["cleanup"]["temporaryRemoved"] = not temporary.exists()
    save()
