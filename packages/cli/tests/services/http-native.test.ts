import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { fetchJobsJson } from "../../src/commands/jobs-request.js";

const parsed = { path: [], options: {}, repeated: {}, projectRoot: process.cwd() };

test("caller cancellation completes while the jobs backend withholds headers", async () => {
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch() {
      entered.resolve();
      await release.promise;
      return Response.json({ providers: [] });
    },
  });
  const port = process.env.PORT;
  process.env.PORT = String(server.port);
  const controller = new AbortController();
  const task = fetchJobsJson(parsed, "GET", "/jobs/capabilities", {
    signal: controller.signal,
  }).catch((error: unknown) => error);
  try {
    await entered.promise;
    controller.abort();
    const completedBeforeHeaders = await Promise.race([
      task.then(() => true),
      Bun.sleep(500).then(() => false),
    ]);
    release.resolve();
    expect(await task).toBeInstanceOf(Error);
    expect(completedBeforeHeaders).toBe(true);
  } finally {
    controller.abort();
    release.resolve();
    await task;
    server.stop(true);
    if (port === undefined) delete process.env.PORT;
    else process.env.PORT = port;
  }
});

test("SIGINT exits the real jobs CLI before the backend sends headers", async () => {
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch() {
      entered.resolve();
      await release.promise;
      return Response.json({ providers: [] });
    },
  });
  const child = Bun.spawn(
    [
      process.execPath,
      resolve(import.meta.dir, "../../src/bin.ts"),
      "jobs",
      "capabilities",
      "--json",
    ],
    {
      cwd: parsed.projectRoot,
      env: { ...process.env, PORT: String(server.port), CI: "1" },
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const output = Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  try {
    await Promise.race([
      entered.promise,
      child.exited.then((code) => {
        throw new Error(`CLI exited before requesting headers: ${code}`);
      }),
    ]);
    child.kill("SIGINT");
    const exitBeforeHeaders = await Promise.race([child.exited, Bun.sleep(1_000).then(() => null)]);
    release.resolve();
    await child.exited;
    await output;
    expect(exitBeforeHeaders).toBe(130);
  } finally {
    release.resolve();
    if (child.exitCode === null) child.kill("SIGKILL");
    await child.exited;
    await output;
    server.stop(true);
  }
}, 15_000);

test("the native jobs consumer still decodes JSON and reports backend failures", async () => {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: (request) =>
      new URL(request.url).pathname.endsWith("/unavailable")
        ? Response.json({ error: "unavailable" }, { status: 503 })
        : Response.json({ providers: [{ name: "local" }] }),
  });
  const port = process.env.PORT;
  process.env.PORT = String(server.port);
  try {
    expect(await fetchJobsJson(parsed, "GET", "/jobs/capabilities")).toEqual({
      providers: [{ name: "local" }],
    });
    await expect(fetchJobsJson(parsed, "GET", "/unavailable")).rejects.toMatchObject({
      code: "RELKIT_JOBS_REQUEST_FAILED",
      message: "Jobs service returned 503.",
    });
  } finally {
    server.stop(true);
    if (port === undefined) delete process.env.PORT;
    else process.env.PORT = port;
  }
});
