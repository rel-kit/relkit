import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { scanGeneratedSource } from "./scaffold-smoke-source.js";
import { runCommand } from "./pack-and-smoke-create-relkit-support.js";

async function freePort(): Promise<number> {
  const server = Bun.serve({ port: 0, fetch: () => new Response() });
  const port = server.port;
  await server.stop(true);
  if (port === undefined) throw new Error("Could not allocate a dynamic port.");
  return port;
}

async function waitFor(check: () => Promise<boolean>, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (await check()) return;
    } catch {}
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 50));
  }
  throw new Error("Timed out waiting for the generated development server.");
}

async function devSmokeAttempt(
  root: string,
  exercise?: (port: number) => Promise<void>,
): Promise<void> {
  const port = await freePort();
  const inspector = await freePort();
  const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as {
    readonly scripts?: Readonly<Record<string, string>>;
  };
  const devScript = manifest.scripts?.["dev:api"] === undefined ? "dev" : "dev:api";
  const child = Bun.spawn(
    [
      process.execPath,
      "run",
      devScript,
      "--",
      "--project-root",
      root,
      "--port",
      String(port),
      "--inspector-port",
      String(inspector),
    ],
    {
      cwd: root,
      env: { ...process.env, PORT: String(port) },
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const output = Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  let failure: unknown;
  const taskProject = existsSync(join(root, "src/orders/tasks/export-orders.task.ts"));
  const healthPath = taskProject ? "/health" : "/hello?name=RelKit";
  try {
    await waitFor(
      async () => {
        if (child.exitCode !== null)
          throw new Error(`Development process exited with ${child.exitCode}.`);
        const response = await fetch(`http://127.0.0.1:${port}${healthPath}`);
        if (!response.ok) throw new Error(`${response.status}: ${await response.text()}`);
        return (await fetch(`http://127.0.0.1:${inspector}`)).ok;
      },
      taskProject ? 90_000 : undefined,
    );
    const route = await (await fetch(`http://127.0.0.1:${port}${healthPath}`)).json();
    if (taskProject && JSON.stringify(route) !== JSON.stringify({ ok: true }))
      throw new Error("Task health route returned an unexpected response.");
    if (!taskProject && (route as { message?: string }).message !== "Hello, RelKit!")
      throw new Error("Example route returned an unexpected greeting.");
    const graph = await fetch(`http://127.0.0.1:${port}/_relkit/v1/graph`);
    if (!graph.ok || !(await graph.text()).includes('"graphHash"'))
      throw new Error("Inspector graph API failed.");
    const inspectorGraph = await fetch(
      `http://127.0.0.1:${inspector}/_relkit/backend/_relkit/v1/graph`,
    );
    if (!inspectorGraph.ok || !(await inspectorGraph.text()).includes('"graphHash"'))
      throw new Error("Packaged inspector proxy failed.");
    const openapi = await fetch(`http://127.0.0.1:${port}/_relkit/v1/openapi.json`);
    if (!openapi.ok || !(await openapi.text()).includes('"openapi":"3.1.0"'))
      throw new Error("OpenAPI endpoint failed.");
    const scalar = await fetch(`http://127.0.0.1:${port}/_relkit/v1/api-reference`);
    if (!scalar.ok || !(await scalar.text()).toLowerCase().includes("scalar"))
      throw new Error("Scalar API reference failed.");
    await exercise?.(port);
  } catch (error) {
    failure = error;
  } finally {
    if (child.exitCode === null) child.kill("SIGTERM");
    await Promise.race([child.exited, new Promise((resolve) => setTimeout(resolve, 2_000))]);
    if (child.exitCode === null) child.kill("SIGKILL");
  }
  const exitCode = await child.exited;
  const [stdout, stderr] = await output;
  if (failure !== undefined) throw new Error(`${failure}\n${stdout}${stderr}`);
  if (exitCode !== 0 && exitCode !== 143)
    throw new Error(`Development process exited with ${exitCode}.\n${stdout}${stderr}`);
  for (const released of [port, inspector]) {
    const probe = Bun.serve({ hostname: "127.0.0.1", port: released, fetch: () => new Response() });
    await probe.stop(true);
  }
}

export async function devSmoke(
  root: string,
  exercise?: (port: number) => Promise<void>,
): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await devSmokeAttempt(root, exercise);
    } catch (error) {
      if (attempt === 2 || !String(error).match(/already in use|EADDRINUSE/)) throw error;
    }
  }
}

export async function verifyGeneratedProject(
  root: string,
  exercise?: (port: number) => Promise<void>,
): Promise<void> {
  await devSmoke(root, exercise);
  await scanGeneratedSource(root);
}
