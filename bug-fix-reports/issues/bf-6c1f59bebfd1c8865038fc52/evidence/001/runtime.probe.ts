import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Effect } from "effect";
import { prepareSnapshotCommand } from "../../packages/cli/src/dev-snapshot/snapshot-prepare-command.ts";

const source = "/var/folders/54/3l8wd4hj6c36slgt3rl572sr0000gp/T/relkit-dev-recovery-7uwlmdbu/app";
const repository = resolve(import.meta.dir, "../..");
const phase = process.argv[2] ?? "before";
const root = await mkdtemp(join(tmpdir(), "relkit-prepared-compatibility-"));
let failures = 0;

function port() {
  const listener = Bun.serve({ port: 0, fetch: () => new Response() });
  const number = listener.port;
  listener.stop(true);
  return number;
}

async function smoke(app: string) {
  const number = port();
  const child = Bun.spawn([process.execPath, join(repository, "packages/cli/src/bin.ts"), "dev", "--project-root", app, "--port", String(number), "--inspector-port", String(port()), "--local", "off", "--no-color"], {
    cwd: app, env: { ...process.env, NODE_ENV: "development" }, stdout: "pipe", stderr: "pipe",
  });
  const output = new Response(child.stdout).text();
  const errors = new Response(child.stderr).text();
  let proof = "";
  try {
    let ready = false;
    for (let count = 0; count < 120; count++) {
      try {
        const response = await fetch(`http://127.0.0.1:${number}/hello?name=prepared`, { signal: AbortSignal.timeout(1000) });
        if (response.status === 200 && (await response.json()).message === "Hello, prepared!") { ready = true; break; }
      } catch {}
      await Bun.sleep(250);
    }
    assert(ready, "prepared server returns exact handler output");
    const parameter = await fetch(`http://127.0.0.1:${number}/route-proof`);
    assert.equal(parameter.status, 200);
    assert.equal((await parameter.json()).message, "Hello, route-proof!");
    const processes = Bun.spawn(["ps", "-axo", "pid=,ppid=,args="], { stdout: "pipe" });
    const rows = (await new Response(processes.stdout).text()).split("\n").map((line) => {
      const match = line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/);
      return match ? { pid: Number(match[1]), parent: Number(match[2]), command: match[3] } : undefined;
    }).filter((row) => row !== undefined);
    await processes.exited;
    const owned = new Set([child.pid]);
    for (let pass = 0; pass < rows.length; pass++) for (const row of rows) if (owned.has(row.parent)) owned.add(row.pid);
    const descendants = rows.filter((row) => owned.has(row.pid));
    proof = JSON.stringify(descendants, null, 2);
    assert(descendants.some((row) => row.command.includes(`${app}/.relkit/dev/sessions/dev-session-`)), "owned backend must execute from the prepared snapshot session");
  } finally {
    child.kill("SIGTERM");
    const stopped = await Promise.race([child.exited.then(() => true), Bun.sleep(10000).then(() => false)]);
    if (!stopped) { child.kill("SIGKILL"); await child.exited; }
    const log = (await output) + (await errors);
    await writeFile(join(import.meta.dir, "snapshot-smoke.log"), log + "\nOwned process proof:\n" + proof);
    await assert.rejects(fetch(`http://127.0.0.1:${number}/hello`, { signal: AbortSignal.timeout(1000) }), "owned HTTP listener must close after shutdown");
  }
  console.log("PASS actual prepared HTTP startup, parameter route and joined shutdown");
}

async function denyExtraRoot(app: string) {
  const configPath = join(app, "tsconfig.json");
  const original = await readFile(configPath, "utf8");
  const receiptPath = join(app, ".relkit/dev/current.json");
  const receipt = await readFile(receiptPath, "utf8");
  try {
    const config = JSON.parse(original);
    config.files.push("src/routes/hello/route.ts");
    await writeFile(configPath, JSON.stringify(config));
    const child = Bun.spawn([process.execPath, join(repository, "packages/cli/src/bin.ts"), "dev", "--prepare", "--json", "--project-root", app], {
      cwd: app, env: { ...process.env, NODE_ENV: "development" }, stdout: "pipe", stderr: "pipe",
    });
    const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
    await writeFile(join(import.meta.dir, "snapshot-extra-root.log"), stdout + stderr);
    assert.notEqual(code, 0, "arbitrary compiler root must be rejected by the actual CLI");
    assert((stdout + stderr).includes("compilation.aliases"), "rejection must be the closed-root policy");
    assert.equal(await readFile(receiptPath, "utf8"), receipt, "rejection must preserve the prior receipt bytes");
  } finally {
    await writeFile(configPath, original);
  }
  console.log("PASS actual CLI rejects extra compiler root and preserves prior receipt");
}

try {
  for (const scenario of phase === "smoke" ? ["context-routes"] : ["context", "routes"]) {
    const app = join(root, scenario);
    await mkdir(app);
    for (const path of ["package.json", "bun.lock", "relkit.config.ts", "tsconfig.json", "src"])
      await cp(join(source, path), join(app, path), { recursive: true });
    await cp(join(source, "node_modules"), join(app, "node_modules"), {
      recursive: true, verbatimSymlinks: true, mode: constants.COPYFILE_FICLONE,
    });
    const config = JSON.parse(await readFile(join(app, "tsconfig.json"), "utf8"));
    if (scenario.includes("context")) config.files.push(".relkit/generated/context-registry.d.ts");
    if (scenario.includes("routes")) {
      await mkdir(join(app, "src/routes/[name]"));
      await cp(join(app, "src/routes/hello/route.ts"), join(app, "src/routes/[name]/route.ts"));
    }
    await writeFile(join(app, "tsconfig.json"), JSON.stringify(config));
    const child = Bun.spawn([process.execPath, join(repository, "packages/cli/src/bin.ts"), "dev", "--prepare", "--project-root", app], {
      cwd: app,
      env: { ...process.env, NODE_ENV: "development" },
      stdout: "pipe", stderr: "pipe",
    });
    const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
    await writeFile(join(import.meta.dir, `snapshot-${scenario}-${phase}.log`), stdout + stderr);
    console.log(JSON.stringify({ scenario, exitCode: code, expected: 0 }));
    if (code !== 0) {
      failures++;
      try {
        await Effect.runPromise(prepareSnapshotCommand(["--project-root", app], {
          command: "dev", args: [], json: false, signal: new AbortController().signal,
          reporter: { output: () => undefined, error: () => undefined }, log: () => undefined,
          cwd: app, interactive: false,
        }));
      } catch (error) {
        console.error("DIAGNOSTIC", error);
      }
    }
    else {
      assert(await Bun.file(join(app, ".relkit/dev/current.json")).exists(), "successful prepare publishes its receipt");
      if (phase === "smoke") { await smoke(app); await denyExtraRoot(app); }
    }
  }
} finally {
  await rm(root, { recursive: true, force: true });
}
assert.equal(failures, 0, "both supported preparation scenarios must succeed");
