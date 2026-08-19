import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, expect, test } from "bun:test";
import { API_BASE_PATH } from "@zsys/contracts";
import { startDev, type DevOptions } from "./src/commands/dev.js";
import { defaultInspectorOptions } from "./src/commands/dev-inspector.js";
import { startDevSourceWatcher } from "./src/commands/dev-watch.js";

const sessions: Array<Awaited<ReturnType<typeof startDev>>> = [];
const roots: string[] = [];

test("owns a stable proxy, dynamic backend, candidate, and clean stop", async () => {
  const root = await makeRoot();
  const graphHash = "sha256:dev-test";
  const session = await startDev(options(root, graphHash));
  sessions.push(session);

  expect(session.backendPort).toBeGreaterThan(0);
  expect(session.activeTarget?.port).toBeGreaterThan(0);
  expect(session.activeTarget?.port).not.toBe(session.backendPort);
  expect(session.stateMachine.state).toBe("active");
  expect(await (await fetch(`http://127.0.0.1:${session.backendPort}/hello`)).text()).toBe("hello");

  const candidate = session.active;
  await session.stop();
  await candidate?.process.exited;
  await expect(fetch(`http://127.0.0.1:${session.backendPort}/hello`)).rejects.toThrow();
});

test("keeps the active backend when a later candidate fails", async () => {
  const root = await makeRoot();
  const graphHash = "sha256:dev-failure";
  let attempts = 0;
  const session = await startDev({
    ...options(root, graphHash),
    compile: async (request) => {
      attempts += 1;
      if (attempts > 1) throw new Error("invalid source");
      return options(root, graphHash).compile(request);
    },
  });
  sessions.push(session);
  const target = session.activeTarget;

  expect(await session.notifySourceChange(1, ["src/app.ts"])).toBe(false);
  expect(session.activeTarget).toEqual(target);
  expect(session.stateMachine.state).toBe("active");
  expect(await (await fetch(`http://127.0.0.1:${session.backendPort}/hello`)).text()).toBe("hello");
});

test("stops an inspector child through the external shutdown signal", async () => {
  const root = await makeRoot();
  const controller = new AbortController();
  const session = await startDev({
    ...options(root, "sha256:dev-inspector"),
    signal: controller.signal,
    inspector: {
      command: [process.execPath, "-e", "setTimeout(() => {}, 10000)"],
      port: 0,
    },
  });
  sessions.push(session);
  expect(session.inspectorPort).toBeGreaterThan(0);

  controller.abort(new Error("test shutdown"));
  await session.waitForShutdown();
  expect(session.activeTarget).toBeUndefined();
});

test("forwards source saves through the supervisor watcher", async () => {
  const root = await makeRoot();
  await mkdir(join(root, "src"));
  let builds = 0;
  const session = await startDev({
    ...options(root, "sha256:watcher"),
    compile: async (request) => {
      builds += 1;
      return options(root, "sha256:watcher").compile(request);
    },
  });
  sessions.push(session);
  const watcher = startDevSourceWatcher(session);
  try {
    await writeFile(join(root, "src", "app.ts"), "export const changed = true;\n");
    await waitFor(() => builds > 1 && session.stateMachine.state === "active");
  } finally {
    watcher.close();
  }
  expect(session.stateMachine.state).toBe("active");
});

test("uses the workspace Next inspector and configured port by default", () => {
  const options = defaultInspectorOptions(3217);
  expect(options.command).toEqual([process.execPath, "run", "dev"]);
  expect(options.cwd?.endsWith("/apps/inspector")).toBe(true);
  expect(options.port).toBe(3217);
});

async function makeRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "zsys-dev-"));
  roots.push(root);
  return root;
}

function options(root: string, graphHash: string): DevOptions {
  return {
    projectRoot: root,
    graphHash,
    stablePort: 0,
    installSignalHandlers: false,
    inspector: false,
    logger: { human: false, json: false },
    compile: async ({ outputDirectory, token }) => {
      const entrypoint = join(outputDirectory, "server.ts");
      await writeFile(entrypoint, serverSource(graphHash));
      void token;
      return { entrypoint };
    },
  };
}

function serverSource(graphHash: string): string {
  return `const hash = ${JSON.stringify(graphHash)};
Bun.serve({ port: Number(process.env.PORT), fetch(request) {
  const path = new URL(request.url).pathname;
  const identity = { sourceToken: Number(process.env.ZSYS_SOURCE_TOKEN), generationToken: Number(process.env.ZSYS_GENERATION_TOKEN) };
  const headers = { "content-type": "application/json", "x-zsys-api-version": "1" };
  if (path === "/hello") return new Response("hello");
  if (path === "${API_BASE_PATH}/health/live") return Response.json({ protocol: "zsys.inspector", version: 1, status: "ok", ...identity }, { headers });
  if (path === "${API_BASE_PATH}/graph") return Response.json({ protocol: "zsys.inspector", version: 1, graphHash: hash, manifestGraphHash: hash, graphContractVersion: 1, manifestContractVersion: 1, manifestGeneratorVersion: 1, ...identity }, { headers });
  if (path === "${API_BASE_PATH}/health/ready") return Response.json({ protocol: "zsys.inspector", version: 1, status: "ready", environmentReady: true, providerReady: true, ...identity }, { headers });
  return new Response("not found", { status: 404 });
}});`;
}

async function waitFor(check: () => boolean): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("Timed out waiting for the source watcher.");
}

afterEach(async () => {
  await Promise.all(sessions.splice(0).map((session) => session.stop()));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
