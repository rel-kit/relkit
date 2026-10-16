/** Commerce construction stays static; runtime work and tooling never execute in this guard. */
import { expect, it } from "@effect/vitest";
import { Effect, Exit } from "effect";
import { verifyStaticSnapshotSource } from "../../src/dev-snapshot/snapshot-eligibility.js";

const schema = `import { integer, text, sqliteTable, uniqueIndex, check, primaryKey } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
export const user = sqliteTable("user", { id: text().primaryKey() });
export const item = sqliteTable("item", {
  id: text().primaryKey(),
  userId: text().notNull().references(() => user.id, { onDelete: "cascade" }),
  count: integer().notNull().default(1),
}, (t) => [uniqueIndex("owner").on(t.userId), primaryKey({columns: [t.id]}), check("positive", sql\`\${t.count} > 0\`)]);`;

it.effect("accepts audited SQLite metadata, native deferred clients, errors and literal auth", () =>
  Effect.gen(function* () {
    for (const source of [
      schema,
      'import {mkdirSync} from "node:fs"; import {dirname} from "node:path"; export async function client(env: {path:string}) { mkdirSync(dirname(env.path), {recursive:true}); }',
      'import { defineDrizzleService } from "@relkit/drizzle"; import { Database } from "bun:sqlite"; import { drizzle } from "drizzle-orm/bun-sqlite"; import * as schema from "./schema/index.js"; export default defineDrizzleService({schema, client: ({env}) => drizzle({client: new Database(env.DATABASE_PATH)}), dispose: (db) => db.$client.close()});',
      'import { defineBetterAuthService } from "@relkit/better-auth"; export default defineBetterAuthService({baseURL: "http://127.0.0.1:3400", emailAndPassword: {enabled: true}});',
      'import {defineError} from "@relkit/app/functions"; import {z} from "@relkit/app/schema"; export default defineError({id:"cart.denied", data:z.object({}), message:"Sign in", http:{status:401}});',
      "export async function owner(context: unknown) { return process.env.RUNTIME; }",
      'export const html = String.raw`<script>const value = "\\n";</script>`;',
      'import {defineEnv, env} from "@relkit/app/config"; export default defineEnv({SECRET:env.secret(), URL:env.url().default(new URL("http://localhost:3400"))});',
      'export * from "./schema/commerce.js";',
    ])
      expect(
        Exit.isSuccess(yield* Effect.exit(verifyStaticSnapshotSource(source, "src/service.ts"))),
        source,
      ).toBe(true);
  }),
);

it.effect(
  "rejects ambient metadata, eager callbacks, imported tooling and runtime construction",
  () =>
    Effect.gen(function* () {
      const unsafe = [
        schema.replace("text().primaryKey()", "text().default(process.env.SECRET)"),
        schema.replace("() => user.id", "() => process.env.SECRET"),
        schema
          .replace("(t) => [", "(t) => { process.env.SECRET; return [")
          .replace("]);", "]; });"),
        schema.replace("sql`${t.count} > 0`", "sql`${Date.now()} > 0`"),
        schema.replace("integer().notNull().default(1)", "integer().$defaultFn(() => Date.now())"),
        schema.replace("text().primaryKey()", "text().default(() => process.env.SECRET)"),
        'import {Database} from "bun:sqlite"; export const db = new Database("private.sqlite");',
        'import {drizzle} from "drizzle-orm/bun-sqlite"; export default drizzle({});',
        'import {defineBetterAuthService} from "@relkit/better-auth"; export default defineBetterAuthService({baseURL:process.env.URL});',
        'import {defineDrizzleService} from "@relkit/drizzle"; export default defineDrizzleService({schema:{}, client: (() => process.env.SECRET)()});',
        "export async function read() {return process.env.SECRET;} export const value = read();",
        'export * from "../scripts/seed.js";',
        'import value from "../scripts/seed.js"; export default value;',
        'export * from "./web/private.js";',
        "export const html = String.raw`${process.env.SECRET}`;",
        'export const value = new URL("http://localhost"); function URL() { return process.env.SECRET; }',
        'export const value = String.raw`private`; import String from "./replacement.js";',
        'export * from "./directory";',
        'export * from "./script.d.ts";',
        'import {mkdirSync} from "node:fs"; mkdirSync("./private", {recursive:true});',
        'import {dirname} from "node:path"; export const value = dirname(process.env.SECRET);',
        'import {mkdirSync} from "node:fs" with {type:"macro"}; import {defineDrizzleService} from "@relkit/drizzle"; export default defineDrizzleService({schema:{}, client:()=>mkdirSync("./private")});',
        'export * from "./schema.js" with {type:"macro"};',
        'import {defineEnv,env} from "@relkit/app/config"; export default defineEnv({URL:env.url().default(new URL(process.env.URL))});',
      ];
      for (const source of unsafe)
        expect(
          Exit.isFailure(yield* Effect.exit(verifyStaticSnapshotSource(source, "src/service.ts"))),
          source,
        ).toBe(true);
    }),
);
