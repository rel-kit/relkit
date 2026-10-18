/** Replays the independently authored users/orders contract over an owned production TCP server. */
import assert from "node:assert/strict";
import { join } from "node:path";
import { writeFile } from "node:fs/promises";
import { Database } from "bun:sqlite";
const root = process.argv[2]!;
const reservation = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: () => new Response() });
const port = reservation.port!;
await reservation.stop(true);
const base = `http://127.0.0.1:${port}`;
const child = Bun.spawn([process.execPath, "--smol", join(root, "node_modules/.bin/relkit"), "start", "--port", String(port)], { cwd: root, env: { ...process.env, BETTER_AUTH_URL: base }, detached: true, stdout: "pipe", stderr: "pipe" });
const output = Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()]);
const request = (path: string, options?: RequestInit) => fetch(base + path, { ...options, signal: AbortSignal.timeout(5000) });
const signal = (value: NodeJS.Signals) => { try { process.kill(-child.pid, value); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; } };
try {
  let ready = false;
  for (let attempt = 0; attempt < 150; attempt++) {
    const response = await request("/users/me").catch(() => undefined);
    if (response?.status === 401) { await response.arrayBuffer(); ready = true; break; }
    await response?.arrayBuffer();
    if (child.exitCode !== null) break;
    await Bun.sleep(100);
  }
  assert.ok(ready);
  const users = [];
  for (const name of ["alice", "bob"]) {
    const response = await request("/api/auth/sign-up/email", { method: "POST", headers: { "content-type": "application/json", origin: base }, body: JSON.stringify({ name, email: name + "@example.test", password: "local-acceptance-password-123" }) });
    assert.equal(response.status, 200);
    const data = await response.json();
    const cookie = response.headers.getSetCookie().map(value => value.split(";", 1)[0]).join("; ");
    assert.ok(cookie.includes("better-auth"));
    users.push({ id: data.user.id, headers: { cookie, "content-type": "application/json", origin: base } });
  }
  const [alice, bob] = users;
  const created = await request("/orders", { method: "POST", headers: alice!.headers, body: JSON.stringify({ sku: "network-book", quantity: 2, ownerId: bob!.id }) });
  assert.equal(created.status, 201);
  const order = await created.json();
  assert.equal(order.ownerId, alice!.id);
  const own = await request("/orders?ownerId=" + bob!.id, { headers: alice!.headers });
  assert.deepEqual(await own.json(), [order]);
  const other = await request("/orders", { headers: bob!.headers });
  assert.deepEqual(await other.json(), []);
  const invalid = await request("/orders", { method: "POST", headers: alice!.headers, body: JSON.stringify({ sku: "", quantity: 0 }) });
  assert.equal(invalid.status, 422);
  await invalid.arrayBuffer();
  const revoked = await request("/api/auth/sign-out", { method: "POST", headers: alice!.headers, body: "{}" });
  assert.equal(revoked.status, 200);
  await revoked.arrayBuffer();
  const denied = await request("/users/me", { headers: alice!.headers });
  assert.equal(denied.status, 401);
  await denied.arrayBuffer();
  const database = new Database(process.env.DATABASE_PATH!, { readonly: true });
  try {
    assert.deepEqual(database.query("SELECT content FROM notes WHERE id=0").get(), { content: "Preserve this existing record" });
    assert.equal((database.query("SELECT COUNT(*) AS count FROM orders").get() as { count: number }).count, 1);
  } finally { database.close(); }
  console.log(JSON.stringify({ passed: true, productionHTTP: true, distinctResources: true, trustedOwnership: true, validation: true, revocation: true, preservedBusinessRows: true }));
} finally {
  signal("SIGTERM");
  const timer = setTimeout(() => signal("SIGKILL"), 2000);
  try { await child.exited; await writeFile(join(import.meta.dir, "guidance01-production-server.log"), (await output).join("\n")); }
  finally { clearTimeout(timer); }
}
