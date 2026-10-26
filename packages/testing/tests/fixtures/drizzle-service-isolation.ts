/** Proves native helper selection, isolated SQLite owners and exactly-once release in Bun. */
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineEnv } from "@relkit/config";
import { createTestApplication as createGeneric } from "../../src/application.js";
import { createTestApplication } from "../../src/drizzle.js";
import { clients, released } from "./drizzle-service-resource.js";

const root = await mkdtemp(join(tmpdir(), "relkit-drizzle-helper-"));
const owners: Awaited<ReturnType<typeof createTestApplication>>[] = [];
try {
  const service = join(root, "src/services/database");
  await mkdir(service, { recursive: true });
  await mkdir(join(root, "src/routes/health"), { recursive: true });
  const resource = new URL("./drizzle-service-resource.ts", import.meta.url).href;
  await writeFile(
    join(service, "service.ts"),
    `export { database } from ${JSON.stringify(resource)};`,
  );
  await writeFile(
    join(root, "src/routes/health/route.ts"),
    `export { route as ALL } from ${JSON.stringify(resource)};`,
  );
  const app = { env: defineEnv({}) };
  await assert.rejects(createGeneric(app, { projectRoot: root }), /@relkit\/testing\/drizzle/);
  assert.equal(clients.length, 0);
  owners.push(await createTestApplication(app, { projectRoot: root }));
  owners.push(await createTestApplication(app, { projectRoot: root }));
  assert.equal(clients.length, 2);
  assert.notEqual(clients[0], clients[1]);
  assert.equal(released.length, 0);
  assert.deepEqual(clients[0]?.query("select id from records").all(), [{ id: 1 }]);
  await owners[0]?.close();
  await owners[0]?.close();
  assert.equal(released.length, 1);
  assert.deepEqual(clients[1]?.query("select id from records").all(), [{ id: 1 }]);
  await owners[1]?.close();
  assert.equal(released.length, 2);
  console.log("RELKIT_DRIZZLE_HELPER_ISOLATION_OK");
} finally {
  await Promise.allSettled(owners.map((owner) => owner.close()));
  await rm(root, { recursive: true, force: true });
}
