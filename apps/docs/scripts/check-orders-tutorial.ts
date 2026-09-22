import { cp, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { generateProject, normalizeCreateOptions } from "create-relkit";
const root = resolve(import.meta.dir, "../../..");
const overlays = resolve(import.meta.dir, "../examples/orders-tutorial/steps");
const parent = await mkdtemp(join(tmpdir(), "relkit-docs-orders-"));
const app = join(parent, "relkit-orders");
const env = {
  ...process.env,
  DATABASE_PATH: join(app, "orders.sqlite"),
  BETTER_AUTH_SECRET: "isolated-tutorial-check-secret-123456789012345",
  BETTER_AUTH_URL: "http://127.0.0.1:3000",
};
async function run(...args: string[]): Promise<void> {
  const child = Bun.spawn(args, { cwd: app, env, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, status] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (status !== 0) throw new Error(`${args.join(" ")} failed (${status}):\n${stdout}\n${stderr}`);
  console.log(`passed: ${args.join(" ")}`);
}
async function apply(step: string): Promise<void> {
  await cp(join(overlays, step), app, { recursive: true, force: true });
}
async function verifyProduction(): Promise<void> {
  const reservation = Bun.serve({ port: 0, fetch: () => new Response() });
  const origin = `http://127.0.0.1:${reservation.port}`;
  reservation.stop(true);
  const serverEnv = { ...env, PORT: String(new URL(origin).port), BETTER_AUTH_URL: origin };
  const headers = { "content-type": "application/json", origin };
  const request = (path: string, init?: RequestInit) => fetch(`${origin}${path}`, init);
  const start = async () => {
    const child = Bun.spawn([process.execPath, "run", "start"], {
      cwd: app,
      env: serverEnv,
      stdout: "pipe",
      stderr: "pipe",
    });
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (typeof child.exitCode === "number") break;
      try {
        if ((await request("/hello")).ok) return child;
      } catch {}
      await Bun.sleep(100);
    }
    child.kill();
    throw new Error(`Production server did not start:\n${await new Response(child.stderr).text()}`);
  };
  const stop = async (child: ReturnType<typeof Bun.spawn>) => {
    child.kill();
    await child.exited;
  };
  let server = await start();
  try {
    if ((await request("/orders/production-1")).status !== 401)
      throw new Error("Production route allowed an anonymous reader");
    const signUp = async (name: string, email: string) => {
      const response = await request("/api/auth/sign-up/email", {
        method: "POST",
        headers,
        body: JSON.stringify({ name, email, password: "local-test-password-123" }),
      });
      if (response.status !== 200) throw new Error(`Sign-up failed: ${response.status}`);
      return response.headers.get("set-cookie")?.split(";", 1)[0] ?? "";
    };
    const alice = await signUp("Alice", "alice@orders.test");
    const bob = await signUp("Bob", "bob@orders.test");
    const created = await request("/orders", {
      method: "POST",
      headers: { ...headers, cookie: alice },
      body: JSON.stringify({ orderId: "production-1", sku: "book", quantity: 10 }),
    });
    if (created.status !== 201 || (await created.json()).totalCents !== 900)
      throw new Error("Production order creation returned the wrong result");
    const otherRead = await request("/orders/production-1", { headers: { cookie: bob } });
    if (otherRead.status !== 200 || (await otherRead.json()).found !== false)
      throw new Error("Another user could read the order");
    const invalid = await request("/orders", {
      method: "POST",
      headers: { ...headers, cookie: alice },
      body: JSON.stringify({ orderId: "invalid", sku: "book", quantity: 0 }),
    });
    if (invalid.status !== 422) throw new Error(`Invalid input returned ${invalid.status}`);
    await stop(server);
    server = await start();
    const signedIn = await request("/api/auth/sign-in/email", {
      method: "POST",
      headers,
      body: JSON.stringify({ email: "alice@orders.test", password: "local-test-password-123" }),
    });
    if (signedIn.status !== 200) throw new Error(`Production sign-in failed: ${signedIn.status}`);
    const cookie = signedIn.headers.get("set-cookie")?.split(";", 1)[0] ?? "";
    const stored = await request("/orders/production-1", { headers: { cookie } });
    if (stored.status !== 200 || (await stored.json()).found !== true)
      throw new Error("Order or session did not survive production restart");
    console.log("passed: authenticated production HTTP flow and restart");
  } finally {
    await stop(server);
  }
}
try {
  await generateProject(
    normalizeCreateOptions([
      "relkit-orders",
      "--directory",
      app,
      "--template",
      "api",
      "--cloud",
      "none",
      "--deploy",
      "none",
      "--no-install",
      "--no-git",
    ]),
    { commandRunner: async () => ({ exitCode: 0 }) },
  );
  await symlink(resolve(root, "examples/auth-drizzle/node_modules"), join(app, "node_modules"));
  await apply("endpoint");
  await run(process.execPath, "run", "check");
  const manifest = JSON.parse(await readFile(join(app, "package.json"), "utf8")) as {
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
  };
  manifest.dependencies["@relkit/drizzle"] = "0.5.0";
  manifest.dependencies["drizzle-orm"] = "1.0.0-rc.5-169397b";
  manifest.devDependencies["drizzle-kit"] = "1.0.0-rc.5-ab785fc";
  await writeFile(join(app, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await apply("database");
  await run(process.execPath, "--bun", "drizzle-kit", "generate", "--name=initial");
  await run(process.execPath, "scripts/migrate.ts");
  await run(process.execPath, "run", "check");
  await run(process.execPath, "run", "typecheck");
  manifest.dependencies["@relkit/better-auth"] = "0.5.0";
  manifest.dependencies["better-auth"] = "1.7.1";
  await writeFile(join(app, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await apply("auth");
  await run(process.execPath, "--bun", "drizzle-kit", "generate", "--name=auth");
  await run(process.execPath, "scripts/migrate.ts");
  await run(process.execPath, "run", "check");
  await apply("tests");
  await run(process.execPath, "run", "typecheck");
  await run(process.execPath, "run", "test");
  await run(process.execPath, "run", "build");
  await verifyProduction();
} finally {
  if (process.env.RELKIT_KEEP_TUTORIAL_TEMP === "1") console.log(`kept: ${app}`);
  else await rm(parent, { recursive: true, force: true });
}
