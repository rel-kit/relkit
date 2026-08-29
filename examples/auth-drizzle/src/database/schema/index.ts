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
