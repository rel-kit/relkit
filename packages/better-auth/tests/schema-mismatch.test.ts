/** A schema the installed Better Auth release rejects stops activation with one coded failure. */
import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { betterAuth } from "better-auth";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { activateDrizzleService, defineDrizzleService } from "@relkit/drizzle";
import { activateBetterAuthService, defineBetterAuthService } from "../src/drizzle.ts";
import * as current from "./auth/full-schema.ts";

/** The account table RelKit generated for Better Auth 1.7.1: a required issuer column and its index. */
const account = sqliteTable(
  "account",
  {
    id: text().primaryKey(),
    accountId: text().notNull(),
    issuer: text().notNull(),
    providerId: text().notNull(),
    userId: text().notNull(),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: integer({ mode: "timestamp" }),
    refreshTokenExpiresAt: integer({ mode: "timestamp" }),
    scope: text(),
    password: text(),
    createdAt: integer({ mode: "timestamp" }).notNull(),
    updatedAt: integer({ mode: "timestamp" }).notNull(),
  },
  (table) => [uniqueIndex("account_issuer_account_id").on(table.issuer, table.accountId)],
);

const settings = {
  secret: "schema-test-secret-schema-test-secret",
  baseURL: "http://localhost",
  emailAndPassword: { enabled: true },
} as const;

/** Activates auth over a Drizzle service declaring the given tables. */
async function activate(schema: Record<string, unknown>, options: object = {}) {
  const database = defineDrizzleService({
    schema,
    client: () => drizzle({ client: new Database(":memory:") }),
  });
  const active = await activateDrizzleService(database, {});
  const service = defineBetterAuthService({ auth: betterAuth({ ...settings, ...options }) });
  try {
    return await activateBetterAuthService(service, active, "/api/auth", { isolated: true });
  } finally {
    await active.close();
  }
}

test("the 1.7.1 account issuer column fails activation naming the column and the migration", async () => {
  const failure = await activate({ ...current, account }).then(
    () => undefined,
    (error: unknown) => error,
  );
  expect(failure).toMatchObject({
    _tag: "AuthSchemaMismatchError",
    code: "RELKIT_AUTH_SCHEMA_MISMATCH",
    findings: [{ kind: "unexpected-required-column", table: "account", column: "issuer" }],
  });
  const message = (failure as Error).message;
  expect(message).toStartWith("RELKIT_AUTH_SCHEMA_MISMATCH: ");
  expect(message).toContain("Column account.issuer is required");
  expect(message).toContain("relkit migrate --write");
  expect(message).toContain("db:generate");
  expect(message).toContain("https://relkit.dev/docs/errors/relkit-auth-schema-mismatch");
});

test("a missing table is named with the change that adds it", async () => {
  const { verification: _verification, ...withoutVerification } = current;
  const failure = await activate(withoutVerification).then(
    () => undefined,
    (error: unknown) => error as Error,
  );
  expect(failure?.message).toContain('Table "verification" is missing');
  expect(failure?.message).not.toContain("relkit migrate");
});

test("the current schema activates, and validateSchema: false skips the check", async () => {
  expect(typeof (await activate(current)).handler).toBe("function");
  const skipped = await activate(
    { ...current, account },
    { advanced: { database: { validateSchema: false } } },
  );
  expect(typeof skipped.handler).toBe("function");
});
