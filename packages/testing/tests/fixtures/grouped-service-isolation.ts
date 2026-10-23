/** Exercises real grouped database/auth acquisition and reverse-order owner release. */
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineEnv } from "@relkit/config";
import { createTestApplication, type TestApplication } from "../../src/better-auth.js";
import { auth, clients, releases } from "./service-isolation-resource.js";

const root = await mkdtemp(join(tmpdir(), "relkit-grouped-native-isolation-"));
const resource = new URL("./service-isolation-resource.ts", import.meta.url).href;
const owners: TestApplication[] = [];
try {
  for (const [file, source] of [
    ["src/services/database/service.ts", `export { database } from ${JSON.stringify(resource)};`],
    ["src/services/auth/service.ts", `export { auth } from ${JSON.stringify(resource)};`],
    [
      "src/routes/api/auth/[[...path]]/route.ts",
      `export { authRoute as ALL } from ${JSON.stringify(resource)};`,
    ],
  ]) {
    if (file === undefined || source === undefined) throw new Error("Incomplete native fixture");
    const path = join(root, file);
    await mkdir(join(path, ".."), { recursive: true });
    await writeFile(path, source);
  }
  const first = await createTestApplication({ env: defineEnv({}) }, { projectRoot: root });
  owners.push(first);
  const second = await createTestApplication({ env: defineEnv({}) }, { projectRoot: root });
  owners.push(second);
  assert.equal(clients.length, 2);
  assert.notEqual(clients[0], clients[1]);
  assert.equal((await first.http.get("/api/auth/get-session")).status, 200);
  assert.equal((await second.http.get("/api/auth/get-session")).status, 200);
  assert.equal(
    (await auth.handler(new Request("http://relkit.test/api/auth/get-session"))).status,
    503,
  );
  await first.close();
  await first.close();
  assert.equal(releases.length, 1);
  assert.equal((await second.http.get("/api/auth/get-session")).status, 200);
  const client = clients[1];
  if (client === undefined) throw new Error("Missing second owner database");
  client.run("insert into records (id) values (2)");
  assert.deepEqual(client.query("select id from records").all(), [{ id: 2 }]);
  const third = await createTestApplication({ env: defineEnv({}) }, { projectRoot: root });
  owners.push(third);
  const fresh = clients[2];
  if (fresh === undefined) throw new Error("Missing fresh owner database");
  assert.deepEqual(fresh.query("select id from records").all(), []);
  await Promise.all([second.close(), third.close()]);
  assert.equal(releases.length, 3);
  console.log("RELKIT_GROUPED_NATIVE_SERVICE_ISOLATION_OK");
} finally {
  await Promise.allSettled(owners.map((owner) => owner.close()));
  await rm(root, { recursive: true, force: true });
}
