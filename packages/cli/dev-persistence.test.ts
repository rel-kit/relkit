import { expect, test } from "bun:test";
import { mkdtemp, mkdir, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { generateProject, CREATE_OPTION_DEFAULTS } from "create-relkit";
import { startDev } from "./src/commands/dev";
import { createDevLocalCompiler } from "./src/commands/dev-local";
import { startDevTelemetry } from "./src/commands/dev-telemetry";
import { createObservabilityRuntime } from "@relkit/observability";
import { runCli } from "./src/main";

test("generated backend reloads preserve committed telemetry without bundling the native driver", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-dev-storage-"));
  const projectRoot = join(root, "example");
  const repository = resolve(import.meta.dir, "../..");
  await generateProject(
    {
      ...CREATE_OPTION_DEFAULTS,
      name: "example",
      directory: projectRoot,
      install: false,
      git: false,
      json: false,
    },
    {
      templateRoot: join(repository, "templates/default/v1"),
      commandRunner: async () => ({ exitCode: 0 }),
    },
  );
  await mkdir(join(projectRoot, "node_modules/@relkit"), { recursive: true });
  await symlink(
    join(repository, "node_modules/@types"),
    join(projectRoot, "node_modules/@types"),
    "dir",
  );
  for (const directory of await readdir(join(repository, "packages"))) {
    if (directory !== "create-relkit")
      await symlink(
        join(repository, "packages", directory),
        join(projectRoot, "node_modules/@relkit", directory),
        "dir",
      );
  }
  let telemetry = await startDevTelemetry(projectRoot);
  const compiler = createDevLocalCompiler(projectRoot, false);
  let session: Awaited<ReturnType<typeof startDev>> | undefined;
  const diagnostics: string[] = [];
  try {
    session = await startDev({
      projectRoot,
      compile: compiler.compile,
      inspector: false,
      stablePort: 0,
      installSignalHandlers: false,
      logger: { human: { write: (line) => diagnostics.push(line) } },
      candidateStopTimeoutMs: 30_000,
      environment: {
        RELKIT_DEV_LOGS: "1",
        RELKIT_TELEMETRY_FLUSH_TIMEOUT_MS: "15000",
        ...telemetry.environment,
      },
      intercept: telemetry.handle,
      onRecord: telemetry.append,
      onStopping: telemetry.closeStream,
      observability: { append: telemetry.append },
    }).catch((error) => {
      throw new Error(`${error}\n${diagnostics.join("\n")}`);
    });
    const url = `http://127.0.0.1:${session.backendPort}`;
    expect((await fetch(`${url}/hello?name=Persistence`)).status).toBe(200);
    expect((await fetch(`${url}/missing-route`)).status).toBe(404);
    const bundle = await readFile(join(session.active!.directory, "server/index.js"), "utf8");
    expect(bundle).not.toContain("@duckdb/node-api");
    expect(bundle).not.toContain("duckdb.node");
    await Bun.sleep(250);
    const before = await telemetry.query.logs({ source: "application", order: "desc" });
    const applicationLog = before.items.find((item) => item.message === "hello invoked");
    expect(applicationLog?.spanId).toBeString();
    const trace = await telemetry.query.trace(applicationLog!.traceId!);
    expect(trace?.spans.some((span) => span.spanId === applicationLog!.spanId)).toBe(true);
    expect(
      before.items.some((item) => item.component === "runtime.http" && item.level === "info"),
    ).toBe(true);
    expect(
      before.items.some((item) => item.component === "runtime.http" && item.level === "warn"),
    ).toBe(true);
    const id = before.items[0]!.cursor!;
    const stream = await fetch(`${url}/_relkit/v1/stream`);
    const reader = stream.body!.getReader();
    expect(await session.notifySourceChange(1, ["src/platform/env.ts"])).toBe(true);
    expect((await telemetry.query.log(id))?.log.cursor).toBe(id);
    await reader.cancel();
    await session.stop();
    session = undefined;
    await telemetry.close();
    await checkCliJsonSession(projectRoot, root);
    telemetry = await startDevTelemetry(projectRoot);
    expect((await telemetry.query.log(id))?.log.cursor).toBe(id);
    const unauthorized = await fetch(`${telemetry.environment.RELKIT_TELEMETRY_URL}/records`, {
      method: "POST",
      body: "{}",
    });
    expect(unauthorized.status).toBe(401);
    const invalid = await telemetry.handle(
      new Request("http://localhost/_relkit/v1/logs?cursor=oops"),
    );
    expect(invalid?.status).toBe(400);
  } finally {
    await session?.stop();
    await compiler.close();
    await telemetry.close();
    await rm(root, { recursive: true, force: true });
  }
}, 60_000);

async function checkCliJsonSession(projectRoot: string, root: string) {
  const inspectorRoot = join(root, "inspector");
  await mkdir(inspectorRoot);
  await writeFile(
    join(inspectorRoot, "package.json"),
    JSON.stringify({ scripts: { dev: "bun server.ts" } }),
  );
  await writeFile(
    join(inspectorRoot, "server.ts"),
    'console.log("Inspector diagnostic"); Bun.serve({port:Number(process.env.PORT),fetch:()=>new Response("Inspector")});',
  );
  const ports = [
    Bun.serve({ port: 0, fetch: () => new Response() }),
    Bun.serve({ port: 0, fetch: () => new Response() }),
  ];
  const args = [
    "dev",
    "--json",
    "--verbose",
    "--no-color",
    "--project-root",
    projectRoot,
    "--local",
    "off",
    "--port",
    String(ports[0]!.port),
    "--inspector-port",
    String(ports[1]!.port),
  ];
  await Promise.all(ports.map((server) => server.stop(true)));
  const previous = process.env.RELKIT_INSPECTOR_ROOT;
  process.env.RELKIT_INSPECTOR_ROOT = inspectorRoot;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  const stdout: string[] = [];
  const stderr: string[] = [];
  let request: Promise<void> | undefined;
  try {
    const exit = await runCli(args, {
      signal: controller.signal,
      installSignalHandlers: false,
      io: {
        stdout: (line) => stdout.push(line),
        stderr: (line) => {
          stderr.push(line);
          const record = JSON.parse(line);
          if (record.message === "dev.ready")
            request = fetch(`${record.fields.backend}/hello`)
              .then(async () => {
                await Bun.sleep(150);
              })
              .finally(() => controller.abort());
        },
      },
    });
    await request;
    expect(exit).toBe(130);
    const records = stderr.map((line) => JSON.parse(line));
    expect(records.every((record) => record.version === 1 && record.signal === "log")).toBe(true);
    expect(records.some((record) => record.component === "runtime.http")).toBe(true);
    expect(
      records.some(
        (record) => record.component === "inspector" && record.message === "Inspector diagnostic",
      ),
    ).toBe(true);
    expect(records.some((record) => record.message === "dev.stopped")).toBe(true);
    expect(stdout.map((line) => JSON.parse(line))).toEqual([
      { ok: false, error: { code: "RELKIT_INTERRUPTED", message: "Operation interrupted." } },
    ]);
  } finally {
    clearTimeout(timer);
    if (previous === undefined) delete process.env.RELKIT_INSPECTOR_ROOT;
    else process.env.RELKIT_INSPECTOR_ROOT = previous;
  }
}

test("remote capture redacts before transport and reports dropped records without failing application work", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-storage-status-"));
  const telemetry = await startDevTelemetry(root);
  const runtime = await createObservabilityRuntime({
    remote: {
      url: telemetry.environment.RELKIT_TELEMETRY_URL,
      token: telemetry.environment.RELKIT_TELEMETRY_TOKEN,
    },
    configuration: {
      capture: { signals: ["log"] },
      redaction: { redactKeys: ["customerEmail"] },
      localRetention: { maxRecords: 1 },
    },
  });
  try {
    const base = {
      version: 1,
      signal: "log",
      timestamp: new Date().toISOString(),
      level: "debug",
      component: "application",
      fields: { customerEmail: "private@example.test" },
    } as const;
    runtime.collect({ ...base, message: "retained" });
    runtime.collect({ ...base, message: "x".repeat(1024 * 1024) });
    runtime.collect({ ...base, message: "also retained" });
    await runtime.flush();
    const page = await telemetry.query.logs();
    expect(page.items).toHaveLength(2);
    expect(JSON.stringify(page)).not.toContain("private@example.test");
    expect(telemetry.status()).toMatchObject({ state: "degraded", dropped: 1 });
    expect(runtime.exportCounters().persisted).toBe(2);
  } finally {
    await runtime.close();
    await telemetry.close();
    await rm(root, { recursive: true, force: true });
  }
});
