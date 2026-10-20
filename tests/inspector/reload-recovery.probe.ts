/** Reproduces failed source activation and automatic Inspector recovery through the real CLI. */
import { strict as assert } from "node:assert";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Effect, Logger } from "effect";
import { recoveryProcess } from "../../packages/cli/tests/dev-environment/recovery-process";
import { recoveryFixture, recoveryInspector } from "../../scripts/test-inspector-recovery-fixture";
import { scaffoldChild } from "../../scripts/scaffold-process";

const repository = resolve(import.meta.dirname, "../..");
const evidence = resolve(process.env.RELKIT_RECOVERY_EVIDENCE_DIR ?? ".relkit/reload-recovery");
const sessionName = `relkit-reload-recovery-${process.pid}`;
const inspector = join(repository, "apps/inspector");
const nextEnvPath = join(inspector, "next-env.d.ts");
const nextEnv = await readFile(nextEnvPath, "utf8");
const inspectorDist = `.relkit/next-reload-recovery-${process.pid}`;
const environment = {
  RAYON_NUM_THREADS: "1",
  UV_THREADPOOL_SIZE: "1",
  NODE_OPTIONS: "--max-old-space-size=1024",
  NEXT_TELEMETRY_DISABLED: "1",
  AGENT_BROWSER_DEFAULT_TIMEOUT: "15000",
  RELKIT_INSPECTOR_ROOT: inspector,
  RELKIT_INSPECTOR_DIST_DIR: inspectorDist,
};

/** Runs a finite owned browser/CLI command and joins its output streams. */
async function run(command: readonly string[], cwd = repository, log?: string): Promise<string> {
  assert.ok(command[0] === "agent-browser" || command[0] === process.execPath);
  const args = command[0] === "agent-browser" ? ["x", ...command] : command.slice(1);
  return Effect.runPromise(
    Effect.gen(function* () {
      const owner = yield* scaffoldChild({ executable: "bun", args, cwd, env: environment });
      const results = yield* Effect.promise(() => owner.settled);
      const [exit, out, error] = results;
      assert.ok(
        exit?.status === "fulfilled" &&
          out?.status === "fulfilled" &&
          error?.status === "fulfilled",
      );
      if (log !== undefined)
        yield* Effect.promise(() => writeFile(log, out.value + "\n" + error.value));
      assert.equal(exit.value, 0, `${command[0]} failed: ${error.value}\n${out.value}`);
      return out.value;
    }).pipe(Effect.scoped, Effect.timeout("30 seconds"), Effect.provide(Logger.layer([]))),
  );
}

const browser = (...args: string[]) => run(["agent-browser", "--session", sessionName, ...args]);

function port(): number {
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() });
  const value = server.port;
  server.stop(true);
  assert.ok(value !== undefined);
  return value;
}

function hasPath(specification: unknown, path: string): boolean {
  assert.ok(
    specification !== null && typeof specification === "object" && "paths" in specification,
  );
  const paths = specification.paths;
  assert.ok(paths !== null && typeof paths === "object");
  return Object.hasOwn(paths, path);
}

/** Exercises one unchanged dev PID across a rejected edit and a repaired generation. */
async function replay(mode: "ordinary" | "prepared"): Promise<void> {
  const root = await mkdtemp(join(repository, ".relkit-reload-recovery-"));
  const output = join(evidence, mode);
  await mkdir(output, { recursive: true });
  let dev: ReturnType<typeof recoveryProcess> | undefined;
  try {
    const backendPort = port(),
      inspectorPort = port();
    const baseUrl = `http://127.0.0.1:${backendPort}`;
    const inspectorUrl = `http://127.0.0.1:${inspectorPort}`;
    const cli = join(repository, "packages/cli/src/bin.ts");
    await recoveryFixture(root, repository, backendPort, inspectorPort);
    const inspectorRoot = await recoveryInspector(root, inspector);
    if (mode === "prepared")
      await writeFile(
        join(output, "prepare.txt"),
        await run(
          [
            process.execPath,
            cli,
            "dev",
            "--prepare",
            "--verbose",
            "--json",
            "--project-root",
            root,
          ],
          root,
        ),
      );
    const startedAt = performance.now();
    dev = recoveryProcess(root, mode, backendPort, {
      path: "/hello/probe",
      environment: { ...environment, RELKIT_INSPECTOR_ROOT: inspectorRoot },
    });
    const ownerPid = dev.child.pid;
    await dev.wait(
      "Initial typed response",
      async () => (await dev?.read()) === '{"message":"number:7"}',
    );
    const backendReadyMs = Math.round(performance.now() - startedAt);
    assert.equal(dev.logs().includes(".relkit/dev/sessions/"), mode === "prepared");
    await dev.wait(
      "CLI-owned Inspector ready",
      () => {
        if (dev?.logs().includes("dev.inspector.failed"))
          throw new Error(`CLI-owned Inspector failed during startup: ${dev.logs().slice(-4000)}`);
        return dev?.logs().includes("dev.inspector.ready") ?? false;
      },
      65_000,
    );
    const inspectorReadyMs = Math.round(performance.now() - startedAt);
    await browser("open", `${inspectorUrl}/routes`);
    await browser("wait", "--fn", "document.querySelector('table')?.innerText.includes('/hello/')");
    await browser("wait", "--fn", "!document.body.innerText.includes('Latest reload failed')");
    const before = dev.logs().length;
    await writeFile(join(root, ".env"), "DAYS=invalid\n");
    await mkdir(join(root, "src/routes/recovered/[name]"), { recursive: true });
    await writeFile(
      join(root, "src/routes/recovered/[name]/route.ts"),
      (await readFile(join(root, "src/routes/hello/[name]/route.ts"), "utf8")).replace(
        'id: "hello.route"',
        'id: "hello.recovered-route"',
      ),
    );
    await dev.wait("Rejected candidate", () =>
      /dev\.generation\.failed|Reload failed; previous version/.test(
        dev?.logs().slice(before) ?? "",
      ),
    );
    await dev.wait(
      "Old version retained",
      async () => (await dev?.read()) === '{"message":"number:7"}',
    );
    await browser("wait", "--text", "Latest reload failed");
    assert.match(await browser("get", "text", "body"), /DAYS|environment/i);
    await writeFile(join(output, "failed-tree.txt"), await browser("snapshot", "-c"));
    const oldSpec = await (await fetch(`${baseUrl}/_relkit/v1/openapi.json`)).json();
    assert.equal(hasPath(oldSpec, "/recovered/{name}"), false);
    await writeFile(join(root, ".env"), "DAYS=30\n");
    await dev.wait(
      "Repaired typed response",
      async () => (await dev?.read()) === '{"message":"number:30"}',
    );
    const currentSpec = await (await fetch(`${baseUrl}/_relkit/v1/openapi.json`)).json();
    assert.ok(hasPath(currentSpec, "/recovered/{name}"));
    await browser("wait", "--fn", "!document.body.innerText.includes('Latest reload failed')");
    await browser(
      "wait",
      "--fn",
      "document.querySelector('table')?.innerText.includes('/recovered/')",
    );
    await writeFile(join(output, "recovered-tree.txt"), await browser("snapshot", "-c"));
    assert.equal(dev.child.pid, ownerPid);
    assert.equal(dev.child.exitCode, null);
    await writeFile(
      join(output, "result.json"),
      JSON.stringify(
        {
          mode,
          sameDevPid: ownerPid,
          inspectorLaunchedByBunDev: true,
          controlledInspectorStartupDelayMs: 6_000,
          backendReadyMs,
          inspectorReadyMs,
          rejectedEditRetainedOldResponse: true,
          failureVisible: true,
          recoveredResponse: "number:30",
          newOpenApiPath: "/recovered/{name}",
          newRouteVisibleWithoutRefresh: true,
          errorClearedWithoutRefresh: true,
        },
        null,
        2,
      ),
    );
    console.log(
      `${mode}: bun dev owns Inspector; rejection, visible failure, typed recovery, new routes/OpenAPI and automatic error clearing passed (PID ${ownerPid}).`,
    );
  } catch (error) {
    if (dev === undefined)
      await run(
        [
          process.execPath,
          join(repository, "packages/cli/src/bin.ts"),
          "check",
          "--json",
          "--project-root",
          root,
        ],
        root,
        join(output, "check.txt"),
      ).catch(() => undefined);
    await writeFile(
      join(output, "failure-tree.txt"),
      await browser("snapshot", "-c").catch(() => "unavailable"),
    );
    throw error;
  } finally {
    await browser("close").catch(() => undefined);
    try {
      if (dev !== undefined) {
        try {
          await dev.stop();
        } finally {
          await writeFile(join(output, "dev.log"), dev.logs());
        }
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
}

try {
  const selected = process.argv[2];
  assert.ok(selected === undefined || selected === "ordinary" || selected === "prepared");
  for (const mode of ["ordinary", "prepared"] as const)
    if (selected === undefined || selected === mode) await replay(mode);
} finally {
  const current = await readFile(nextEnvPath, "utf8");
  if (current.includes(`${inspectorDist}/`)) {
    const restored = current.replaceAll(`${inspectorDist}/dev/`, ".next/dev/");
    if (restored === nextEnv) await writeFile(nextEnvPath, nextEnv);
  }
  await rm(join(inspector, inspectorDist), { recursive: true, force: true });
}
