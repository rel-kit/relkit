import { Database } from "bun:sqlite";
import { defineDataModel } from "@relkit/drizzle";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: integer({ mode: "timestamp" }).notNull(),
  updatedAt: integer({ mode: "timestamp" }).notNull(),
};

export const user = sqliteTable("user", {
  id: text().primaryKey(),
  name: text().notNull(),
  email: text().notNull().unique(),
  emailVerified: integer({ mode: "boolean" }).notNull(),
  image: text(),
  ...timestamps,
});
export const session = sqliteTable("session", {
  id: text().primaryKey(),
  expiresAt: integer({ mode: "timestamp" }).notNull(),
  token: text().notNull().unique(),
  ipAddress: text(),
  userAgent: text(),
  userId: text().notNull(),
  ...timestamps,
});
export const account = sqliteTable(
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
    ...timestamps,
  },
  (table) => [uniqueIndex("account_issuer_account_id").on(table.issuer, table.accountId)],
);
export const verification = sqliteTable("verification", {
  id: text().primaryKey(),
  identifier: text().notNull(),
  value: text().notNull(),
  expiresAt: integer({ mode: "timestamp" }).notNull(),
  ...timestamps,
});
export const schema = { user, session, account, verification };
export const sqlite = new Database(process.env.DATABASE_PATH ?? ":memory:");
export const database = drizzle({ client: sqlite });

export function initializeAuthDatabase(): void {
  sqlite.exec(
    "create table if not exists user (id text primary key, name text not null, email text not null unique, emailVerified integer not null, image text, createdAt integer not null, updatedAt integer not null); create table if not exists session (id text primary key, expiresAt integer not null, token text not null unique, ipAddress text, userAgent text, userId text not null, createdAt integer not null, updatedAt integer not null); create table if not exists account (id text primary key, accountId text not null, issuer text not null, providerId text not null, userId text not null, accessToken text, refreshToken text, idToken text, accessTokenExpiresAt integer, refreshTokenExpiresAt integer, scope text, password text, createdAt integer not null, updatedAt integer not null, unique (issuer, accountId)); create table if not exists verification (id text primary key, identifier text not null, value text not null, expiresAt integer not null, createdAt integer not null, updatedAt integer not null)",
  );
}

initializeAuthDatabase();

export default defineDataModel(database, schema);
