import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { buildProject } from "../../../packages/cli/src/commands/build.js";
import { writeGeneratedHostFixture } from "./generated-host-fixture.js";

test("generated host preserves database/auth ownership, rollback, session admission and shutdown", async () => {
  const repository = resolve(import.meta.dir, "../../..");
  const root = await mkdtemp(join(tmpdir(), "relkit-specialized-host-"));
  const probe = Bun.serve({ port: 0, fetch: () => new Response() });
  const baseURL = `http://127.0.0.1:${probe.port}`;
  const port = probe.port;
  await probe.stop(true);
  let host: Bun.Subprocess<"ignore", "pipe", "pipe"> | undefined;
  let output: Promise<string[]> | undefined;
  const databasePath = join(root, "test.sqlite");
  const releasesPath = join(root, "releases.txt");
  try {
    await writeGeneratedHostFixture(root, repository);
    const sqlite = new Database(databasePath);
    try {
      sqlite.exec(await readFile(join(root, "drizzle/20260831094750_auth/migration.sql"), "utf8"));
      sqlite.exec("create table records (id integer primary key, value text not null)");
      sqlite.exec("create table samples (id integer primary key, value real not null)");
    } finally {
      sqlite.close();
    }
    const built = await buildProject({ projectRoot: root });
    expect(built.ok, JSON.stringify(built.diagnostics)).toBe(true);
    const generated = await readFile(join(root, ".relkit/build/server/index.ts"), "utf8");
    expect(generated).toContain("instrumentation: specializedInstrumentation");
    host = Bun.spawn([process.execPath, "run", "--no-env-file", ".relkit/build/server/index.js"], {
      cwd: root,
      env: {
        ...process.env,
        PORT: String(port),
        NODE_ENV: "test",
        DATABASE_PATH: databasePath,
        BETTER_AUTH_URL: baseURL,
        BETTER_AUTH_SECRET: "generated-host-test-secret-at-least-32-bytes",
        RELKIT_TEST_RELEASES: releasesPath,
        RELKIT_DRAIN_TIMEOUT_MS: "5000",
        RELKIT_TELEMETRY_FLUSH_TIMEOUT_MS: "1000",
      },
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });
    output = Promise.all([new Response(host.stdout).text(), new Response(host.stderr).text()]);
    const deadline = Date.now() + 20_000;
    let ready = false;
    while (Date.now() < deadline && host.exitCode === null) {
      try {
        ready = (await fetch(`${baseURL}/session`, { signal: AbortSignal.timeout(1000) })).ok;
        if (ready) break;
      } catch {
        /* The owned child has not started listening yet. */
      }
      await Bun.sleep(25);
    }
    expect(
      ready,
      host.exitCode === null ? "Generated host startup timed out" : (await output).join("\n"),
    ).toBe(true);
    const request = (path: string, options: RequestInit = {}) =>
      fetch(`${baseURL}${path}`, { signal: AbortSignal.timeout(10_000), ...options });
    const records = async (mode: string) => {
      const response = await request("/records", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const result = await response.json();
      if (response.status !== 200 && host?.exitCode === null) {
        host.kill("SIGTERM");
        await host.exited;
        console.log((await output)?.join("\n"));
      }
      expect(response.status, JSON.stringify(result)).toBe(200);
      return result;
    };
    expect(await records("write")).toMatchObject({ count: 1 });
    expect(await records("rollback")).toMatchObject({ count: 1 });
    expect(await records("read")).toMatchObject({ count: 1 });
    expect(await records("ownership")).toMatchObject({
      count: 1,
      shared: true,
      isolated: true,
      recovered: true,
    });
    expect(await records("descendants")).toMatchObject({ count: 1 });
    expect(await records("numeric")).toMatchObject({ count: 1, numeric: -1e100 });
    expect(await records("nested-auth")).toMatchObject({ count: 1, nested: true });
    expect((await request("/account/profile")).status).toBe(401);
    const signup = await request("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin: baseURL },
      body: JSON.stringify({
        name: "Generated Host",
        email: "host@example.com",
        password: "host-password-123",
      }),
    });
    expect(signup.status, await signup.text()).toBe(200);
    const cookie = signup.headers.get("set-cookie")?.split(";", 1)[0];
    expect(cookie).toContain("better-auth");
    const headers = { cookie: cookie ?? "" };
    const session = await request("/api/auth/get-session", { headers });
    expect(await session.json()).toMatchObject({ user: { email: "host@example.com" } });
    const profile = await request("/account/profile", { headers });
    expect(profile.status).toBe(200);
    expect(await profile.json()).toMatchObject({ authenticated: true });
    expect((await readFile(releasesPath, "utf8")).trim().split("\n")).toHaveLength(1);
    host.kill("SIGTERM");
    expect(await host.exited).toBe(0);
    expect((await readFile(releasesPath, "utf8")).trim().split("\n")).toHaveLength(2);
    expect((await output).join("\n")).not.toContain("host-password-123");
    expect((await output).join("\n")).not.toContain("generated-host-test-secret-at-least-32-bytes");
  } finally {
    if (host?.exitCode === null) {
      host.kill("SIGTERM");
      await host.exited;
    }
    await output;
    await rm(root, { recursive: true, force: true });
  }
}, 90_000);
