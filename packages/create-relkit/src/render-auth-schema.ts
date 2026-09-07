import type { DatabaseDialect } from "./add-types.js";

interface AuthDialect {
  readonly imports: string;
  readonly table: string;
  readonly string: string;
  readonly token: string;
  readonly boolean: string;
  readonly timestamp: string;
}

const DIALECTS: Readonly<Record<DatabaseDialect, AuthDialect>> = {
  sqlite: {
    imports: "integer, sqliteTable, text, uniqueIndex",
    table: "sqliteTable",
    string: "text()",
    token: "text()",
    boolean: `integer({ mode: "boolean" })`,
    timestamp: `integer({ mode: "timestamp" })`,
  },
  postgresql: {
    imports: "boolean, pgTable, text, timestamp, uniqueIndex",
    table: "pgTable",
    string: "text()",
    token: "text()",
    boolean: "boolean()",
    timestamp: `timestamp({ withTimezone: true })`,
  },
  mysql: {
    imports: "boolean, datetime, mysqlTable, text, uniqueIndex, varchar",
    table: "mysqlTable",
    string: "varchar({ length: 255 })",
    token: "text()",
    boolean: "boolean()",
    timestamp: "datetime()",
  },
};

export function authSchemaSource(dialect: DatabaseDialect): string {
  const value = DIALECTS[dialect];
  const module = dialect === "postgresql" ? "pg" : dialect;
  return `import { ${value.imports} } from "drizzle-orm/${module}-core";

const timestamps = {
  createdAt: ${value.timestamp}.notNull(),
  updatedAt: ${value.timestamp}.notNull(),
};

export const user = ${value.table}("user", {
  id: ${value.string}.primaryKey(),
  name: ${value.string}.notNull(),
  email: ${value.string}.notNull().unique(),
  emailVerified: ${value.boolean}.notNull(),
  image: ${value.token},
  ...timestamps,
});

export const session = ${value.table}("session", {
  id: ${value.string}.primaryKey(),
  expiresAt: ${value.timestamp}.notNull(),
  token: ${value.string}.notNull().unique(),
  ipAddress: ${value.string},
  userAgent: ${value.token},
  userId: ${value.string}.notNull(),
  ...timestamps,
});

export const account = ${value.table}(
  "account",
  {
    id: ${value.string}.primaryKey(),
    accountId: ${value.string}.notNull(),
    issuer: ${value.string}.notNull(),
    providerId: ${value.string}.notNull(),
    userId: ${value.string}.notNull(),
    accessToken: ${value.token},
    refreshToken: ${value.token},
    idToken: ${value.token},
    accessTokenExpiresAt: ${value.timestamp},
    refreshTokenExpiresAt: ${value.timestamp},
    scope: ${value.string},
    password: ${value.token},
    ...timestamps,
  },
  (table) => [uniqueIndex("account_issuer_account_id").on(table.issuer, table.accountId)],
);

export const verification = ${value.table}("verification", {
  id: ${value.string}.primaryKey(),
  identifier: ${value.string}.notNull(),
  value: ${value.token}.notNull(),
  expiresAt: ${value.timestamp}.notNull(),
  ...timestamps,
});
`;
}
