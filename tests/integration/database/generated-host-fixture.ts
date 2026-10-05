import { cp, mkdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

/** Creates a disposable copy of the auth example with database lifecycle probes. */
export async function writeGeneratedHostFixture(root: string, repository: string): Promise<void> {
  const example = join(repository, "examples/auth-drizzle");
  for (const path of ["src", "drizzle", "relkit.config.ts", "package.json"]) {
    await cp(join(example, path), join(root, path), { recursive: true });
  }
  const tsconfig = await Bun.file(
    join(repository, "templates/default/v1/minimal/tsconfig.json"),
  ).json();
  tsconfig.files.push(".relkit/generated/context-registry.d.ts");
  await writeFile(join(root, "tsconfig.json"), JSON.stringify(tsconfig));
  await symlink(join(example, "node_modules"), join(root, "node_modules"), "dir");
  const schema = await Bun.file(join(root, "src/database/schema/index.ts")).text();
  await writeFile(
    join(root, "src/database/schema/index.ts"),
    `${schema}\nimport { real } from "drizzle-orm/sqlite-core";
export const samples = sqliteTable("samples", {
  id: integer().primaryKey(), value: real().notNull(),
});
export const records = sqliteTable("records", {
  id: integer().primaryKey(), value: text().notNull(),
});\n`,
  );
  const files = {
    "src/database/service.ts": `import { appendFileSync } from "node:fs";
import { Database } from "bun:sqlite";
import { defineDrizzleService } from "@relkit/drizzle";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "./schema/index.js";
import recordsModel from "./models/records.model.js";
export default defineDrizzleService({
  schema,
  models: { records: recordsModel },
  client: ({ env }) => drizzle({ client: new Database(env.DATABASE_PATH) }),
  dispose: (database) => {
    database.$client.close();
    appendFileSync(process.env.RELKIT_TEST_RELEASES!, "released\\n");
  },
});
`,
    "src/database/lifecycle.ts": `import { activateDrizzleService, defineDrizzleService, defineModel, type ApplicationEnv } from "@relkit/drizzle";
import { activateBetterAuthService, defineBetterAuthService } from "@relkit/better-auth";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import database from "./service.js";
import * as schema from "./schema/index.js";
import auth from "@app/auth/service.js";
export async function probeLifecycle(context: unknown, env: ApplicationEnv): Promise<{ shared: boolean; isolated: boolean; recovered: boolean }> {
  const shared = await activateDrizzleService(database, env);
  const again = await activateDrizzleService(database, { DATABASE_PATH: "ignored.sqlite" });
  const isolated = await activateDrizzleService(database, env, { isolated: true });
  const sharedAuth = await activateBetterAuthService(auth, shared, "/api/auth");
  const isolatedAuth = await activateBetterAuthService(auth, isolated, "/api/auth", { isolated: true });
  let attempts = 0;
  const retry = defineDrizzleService({
    schema,
    client: (context) => {
      if (++attempts === 1) throw new Error("fixture acquisition failure");
      return drizzle({ client: new Database(String(context.env.DATABASE_PATH)) });
    },
    dispose: (client) => client.$client.close(),
  });
  let failed = false;
  try { await activateDrizzleService(retry, env); } catch { failed = true; }
  const recovered = await activateDrizzleService(retry, env);
  const result = {
    shared: shared === again && shared.context === context,
    isolated: isolated !== shared && isolatedAuth !== sharedAuth,
    recovered: failed && attempts === 2,
  };
  await Promise.all([isolated.close(), recovered.close()]);
  return result;
}
export async function probeDescendants(databasePath: string): Promise<void> {
  let enter!: () => void, release!: () => void;
  const entered = new Promise<void>((resolve) => { enter = resolve; });
  const released = new Promise<void>((resolve) => { release = resolve; });
  let disposed = false, committed = false;
  const model = defineModel({ table: schema.records, extend: {
    delayedRead: async ({ database, table }) => {
      enter(); await released; return database.select().from(table);
    },
  } });
  const service = defineDrizzleService({
    schema: { records: schema.records }, models: { records: model },
    client: () => drizzle({ client: new Database(databasePath) }),
    dispose: (client) => { disposed = true; client.$client.close(); },
  });
  const active = await activateDrizzleService(service, {}, { isolated: true });
  let child: Promise<unknown> | undefined;
  const parent = active.context.transaction(async (tx) => {
    child = tx.records.delayedRead(); await entered;
  }).then(() => { committed = true; });
  await entered;
  const closing = active.close();
  await new Promise<void>((resolve) => setImmediate(resolve));
  const premature = committed || disposed;
  release();
  const outcomes = await Promise.allSettled([parent, child, closing]);
  for (const outcome of outcomes) if (outcome.status === "rejected") throw outcome.reason;
  if (premature || !committed || !disposed) throw new Error("transaction descendant lifetime failed");
}
export async function probeNestedAuth(databasePath: string): Promise<boolean> {
  const active = await activateDrizzleService(database, { DATABASE_PATH: databasePath });
  const options = { baseURL: "http://localhost", secret: "nested-fixture-secret-at-least-32-bytes" };
  const secondary = defineBetterAuthService(options);
  let initialized = false;
  const primary = defineBetterAuthService({ ...options, plugins: [{
    id: "nested-auth", init: async () => {
      const child = await activateBetterAuthService(secondary, active, "/api/secondary");
      initialized = (await child.api.getSession({ headers: new Headers() })) === null;
    },
  }] });
  const acquired = await active.context.transaction(() =>
    activateBetterAuthService(primary, active, "/api/nested"));
  return initialized && (await acquired.api.getSession({ headers: new Headers() })) === null;
}
`,
    "src/database/models/records.model.ts": `import { defineModel } from "@relkit/drizzle";
import { records } from "../schema/index.js";
import { probeLifecycle, probeDescendants, probeNestedAuth } from "../lifecycle.js";
export default defineModel({
  table: records,
  extend: { ownership: (_context, context: unknown, databasePath: string) =>
    probeLifecycle(context, { DATABASE_PATH: databasePath }),
    descendants: (_context, databasePath: string) => probeDescendants(databasePath),
    nestedAuth: (_context, databasePath: string) => probeNestedAuth(databasePath) },
});
`,
    "src/records/service.ts": `import { defineService } from "@relkit/app/services";
import probe from "./functions/probe.function.js";
export default defineService({ functions: { probe } });
`,
    "src/records/functions/probe.function.ts": `import { defineFunction } from "@relkit/app/functions";
import { z } from "@relkit/app/schema";
export default defineFunction({
  input: z.object({ mode: z.union([z.literal("write"), z.literal("rollback"), z.literal("read"), z.literal("ownership"), z.literal("descendants"), z.literal("numeric"), z.literal("nested-auth")]) }),
  output: z.object({ count: z.number(), shared: z.boolean(), isolated: z.boolean(), recovered: z.boolean(), numeric: z.number().optional(), nested: z.boolean().optional() }),
  handler: async ({ mode }, context) => {
    let ownership = { shared: false, isolated: false, recovered: false };
    let numeric: number | undefined, nested: boolean | undefined;
    if (mode === "numeric") {
      await context.database.samples.insert({ data: { id: 1, value: 1e20 } });
      await context.database.samples.update({ where: { id: 1 }, data: { value: -1e100 } });
      numeric = (await context.database.samples.findOne({ where: { id: 1 } }))?.value;
    }
    if (mode === "nested-auth") nested = await context.database.records.nestedAuth(process.env.DATABASE_PATH!);
    if (mode === "write") await context.database.records.insert({ data: { id: 1, value: "kept" } });
    if (mode === "rollback") {
      try {
        await context.database.transaction(async (transaction) => {
          await transaction.records.insert({ data: { id: 2, value: "rolled back" } });
          throw new Error("fixture rollback");
        });
      } catch (error) {
        if (!(error instanceof Error) || error.message !== "fixture rollback") throw error;
      }
    }
    if (mode === "ownership") ownership = await context.database.records.ownership(context.database, String(context.env.DATABASE_PATH));
    if (mode === "descendants") await context.database.records.descendants(process.env.DATABASE_PATH!);
    return { count: (await context.database.records.findMany()).length, ...ownership,
      ...(numeric === undefined ? {} : { numeric }), ...(nested === undefined ? {} : { nested }) };
  },
});
`,
    "src/routes/records/route.ts": `import { defineRoute } from "@relkit/app/routes";
import records from "@app/records/service.js";
export const POST = defineRoute({ target: records.probe });
`,
  };
  for (const [path, source] of Object.entries(files)) {
    const target = join(root, path);
    await mkdir(join(target, ".."), { recursive: true });
    await writeFile(target, source);
  }
}
