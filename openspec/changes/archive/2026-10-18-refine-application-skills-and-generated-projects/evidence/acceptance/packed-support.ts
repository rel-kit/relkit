/** Serial outside-workspace acceptance using the existing candidate registry and child owner. */
import assert from "node:assert/strict";
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import {
  loadReleaseTarballs,
  readManifests,
  startRegistry,
} from "../../../../../scripts/pack-and-smoke-create-relkit-pack.ts";
import { runCommand } from "../../../../../scripts/pack-and-smoke-create-relkit-support.ts";

export const repository = resolve(import.meta.dir, "../../../../..");
export const hash = (value: Uint8Array | string) =>
  createHash("sha256").update(value).digest("hex");
export function pressure() {
  return Number(
    Bun.spawnSync(["sysctl", "-n", "kern.memorystatus_vm_pressure_level"]).stdout.toString().trim(),
  );
}
export async function requireHeadroom(neededMiB = 192) {
  while (true) {
    const level = pressure();
    const vm = Bun.spawnSync(["vm_stat"]).stdout.toString();
    const pages = (name: string) => Number(new RegExp(`${name}:\\s+(\\d+)`).exec(vm)?.[1] ?? 0);
    const available = (pages("Pages free") + pages("Pages speculative") + pages("Pages purgeable")) * 16384 / 1024 / 1024;
    if (level === 1 || (level === 2 && available >= neededMiB)) return;
    console.log(`Waiting for ${neededMiB} MiB headroom before the next bounded acceptance operation`);
    await Bun.sleep(10000);
  }
}

export async function fixture() {
  await requireHeadroom();
  const index = await Bun.file(join(import.meta.dir, "artifacts.json")).json();
  const fingerprint = hash(JSON.stringify(index.packages));
  const pointer = join(import.meta.dir, "packed-resume.json");
  const resume = existsSync(pointer) ? await Bun.file(pointer).json() : undefined;
  const reuse = resume?.fingerprint === fingerprint && existsSync(resume.temporary);
  const temporary = reuse ? resume.temporary as string : await realpath(await mkdtemp(join(tmpdir(), "relkit-packed-acceptance-")));
  assert.ok(temporary.includes("/relkit-packed-acceptance-"));
  const state = join(temporary, "acceptance-state.json");
  const previous = reuse ? await Bun.file(state).json() : undefined;
  const server = await startRegistry(
    temporary,
    await loadReleaseTarballs(index.directory),
    await readManifests(repository),
  );
  const registry = `http://127.0.0.1:${server.port}`;
  const results: Record<string, unknown>[] = previous?.results ?? [];
  const observations: Record<string, unknown> = previous?.observations ?? {};
  delete observations.blocker;
  const save = async () => {
    const text = JSON.stringify({ temporary, registry, fingerprint, results, observations }, null, 2) + "\n";
    await writeFile(state, text);
    await writeFile(join(import.meta.dir, "packed-results.json"), text);
  };
  await writeFile(pointer, JSON.stringify({ temporary, fingerprint }));
  await save();
  return {
    temporary,
    version: index.version as string,
    results,
    observations,
    save,
    done: (label: string) => results.some((result) => result.label === label && result.passed === true),
    async run(label: string, args: string[], cwd = temporary) {
      if (this.done(label)) return readFile(join(import.meta.dir, `${label}.log`), "utf8");
      await requireHeadroom(args.includes("typecheck") ? 512 : 192);
      console.log(`Acceptance: ${label}`);
      const started = Date.now();
      try {
        const output = await runCommand(args, cwd, registry, join(temporary, "cache"));
        await writeFile(join(import.meta.dir, `${label}.log`), output);
        results.push({
          label,
          args,
          cwd,
          passed: true,
          ms: Date.now() - started,
          pressure: pressure(),
        });
        await save();
        return output;
      } catch (error) {
        results.push({
          label,
          args,
          cwd,
          passed: false,
          error: String(error),
          ms: Date.now() - started,
          pressure: pressure(),
        });
        await save();
        throw error;
      }
    },
    async install(label: string, cwd: string, frozen = false) {
      const invoke = () => this.run(
        label,
        [
          "--smol",
          "install",
          "--network-concurrency",
          "1",
          ...(frozen ? ["--frozen-lockfile"] : []),
          "--registry",
          registry,
        ],
        cwd,
      );
      try { return await invoke(); }
      catch (error) {
        if (!/502|503|504|ECONNRESET|Upstream npm registry unavailable/.test(String(error))) throw error;
        // Dependency installation is idempotent; SQL execution is never retried here.
        await Bun.sleep(1000);
        return invoke();
      }
    },
    async identity(cwd: string) {
      const records = [];
      for (const name of ["@relkit/cli", "create-relkit"]) {
        const directory = await realpath(join(cwd, "node_modules", name));
        assert.ok(directory.startsWith(cwd + "/"), `Package escapes consumer: ${directory}`);
        const manifest = await Bun.file(join(directory, "package.json")).json();
        assert.equal(manifest.version, index.version);
        const files: Record<string, string> = {};
        for (const path of name === "create-relkit"
          ? ["dist/create-capabilities.js"]
          : ["dist/database/migration-worker.js", "dist/database/migration-execute.js", "dist/database/migration-config.js"]) {
          files[path] = hash(await readFile(join(directory, path)));
          const producer = join(repository, "packages", name === "create-relkit" ? name : "cli", path);
          assert.equal(files[path], hash(await readFile(producer)), `Installed candidate differs: ${name}/${path}`);
        }
        records.push({
          name,
          directory,
          version: manifest.version,
          binSha256: hash(await readFile(join(directory, "dist/bin.js"))),
          files,
        });
      }
      return records;
    },
    async close() {
      await server.stop(true);
      observations.cleanup = { registryStopped: true, temporaryRemoved: observations.passed === true };
      await save();
      if (observations.passed === true) {
        await rm(temporary, { recursive: true, force: true });
        await rm(pointer, { force: true });
      }
    },
  };
}

export type Fixture = Awaited<ReturnType<typeof fixture>>;

/** Uses a finite production server and joins its process group before returning. */
export async function live(
  root: string,
  exercise: (base: string) => Promise<void>,
  selectedPort?: number,
) {
  await requireHeadroom();
  const portOwner = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: () => new Response() });
  const port = selectedPort ?? portOwner.port!;
  await portOwner.stop(true);
  const base = `http://127.0.0.1:${port}`;
  const child = Bun.spawn(
    [
      process.execPath,
      "--smol",
      join(root, "node_modules/.bin/relkit"),
      "start",
      "--port",
      String(port),
    ],
    {
      cwd: root,
      detached: true,
      env: { ...process.env, BETTER_AUTH_URL: base },
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const output = Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  const signal = (value: NodeJS.Signals) => {
    try {
      process.kill(-child.pid, value);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
    }
  };
  try {
    let ready = false;
    for (let attempt = 0; attempt < 150; attempt++) {
      const response = await fetch(base + "/hello?name=Acceptance", {
        signal: AbortSignal.timeout(1000),
      }).catch(() => undefined);
      if (response?.status === 200) {
        assert.deepEqual(await response.json(), { message: "Hello, Acceptance!" });
        ready = true;
        break;
      }
      await response?.arrayBuffer();
      if (child.exitCode !== null) break;
      await Bun.sleep(100);
    }
    assert.ok(ready, "Production server did not become ready");
    await exercise(base);
  } finally {
    signal("SIGTERM");
    const timer = setTimeout(() => signal("SIGKILL"), 2000);
    try {
      await child.exited;
      const text = (await output).join("\n");
      await writeFile(join(import.meta.dir, `server-${port}.log`), text);
    } finally {
      clearTimeout(timer);
    }
  }
  assert.equal(
    await fetch(base, { signal: AbortSignal.timeout(500) }).catch(() => undefined),
    undefined,
  );
}
