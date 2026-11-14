/**
 * Renders native Drizzle service/schema/tooling declarations for supported dialects.
 * The selected physical schema path is passed by layout-aware planning; connection
 * factories stay lazy and source rendering never opens a database client.
 */

import type { DatabaseDialect } from "create-relkit/add-types";
import { dirname } from "node:path";

/** Runtime-selecting client of each dialect: its `@relkit/drizzle` entry, opener and variable. */
const CLIENTS = {
  sqlite: {
    entry: "sqlite",
    open: "openSqliteDatabase",
    variable: "DATABASE_PATH",
    close: "close",
  },
  postgresql: { entry: "pg", open: "openPostgresDatabase", variable: "DATABASE_URL", close: "end" },
  mysql: { entry: "mysql", open: "openMysqlDatabase", variable: "DATABASE_URL", close: "end" },
} as const;

/** Driver package the runtime-selecting client loads on Node, per dialect; Bun needs none. */
export const NODE_DATABASE_DRIVERS = {
  sqlite: undefined,
  postgresql: "pg",
  mysql: "mysql2",
} as const;

/**
 * Renders database Service Source as source text without executing user modules. The service
 * opens its database through `@relkit/drizzle`'s runtime-selecting client, so it imports nothing
 * specific to Bun or Node and runs on both.
 * @param dialect - Supported database dialect.
 * @returns TypeScript declaring the selected Drizzle database service and connection factory.
 */
export function databaseServiceSource(dialect: DatabaseDialect): string {
  const client = CLIENTS[dialect];
  const value = dialect === "sqlite" ? "path" : "url";
  return `import { defineDrizzleService } from "@relkit/drizzle";
import { ${client.open} } from "@relkit/drizzle/${client.entry}";
import * as schema from "./schema/index.js";

export default defineDrizzleService({
  schema,
  client: ({ env }) => {
    const ${value} = env.${client.variable};
    if (!${value}) throw new Error("${client.variable} is required");
    return ${client.open}(${value});
  },
  dispose: (database) => database.$client.${client.close}(),
});
`;
}

/**
 * Renders items Schema Source as source text without executing user modules.
 * @param dialect - Supported database dialect.
 * @returns Drizzle TypeScript schema source for the example items table.
 */
export function itemsSchemaSource(dialect: DatabaseDialect): string {
  if (dialect === "sqlite") {
    return `import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const items = sqliteTable("items", {
  id: integer().primaryKey({ autoIncrement: true }),
  name: text().notNull(),
});
`;
  }
  if (dialect === "postgresql") {
    return `import { pgTable, serial, text } from "drizzle-orm/pg-core";

export const items = pgTable("items", {
  id: serial().primaryKey(),
  name: text().notNull(),
});
`;
  }
  return `import { int, mysqlTable, varchar } from "drizzle-orm/mysql-core";

export const items = mysqlTable("items", {
  id: int().autoincrement().primaryKey(),
  name: varchar({ length: 255 }).notNull(),
});
`;
}

/**
 * Renders drizzle Config Source as source text without executing user modules.
 * @param dialect - Supported database dialect.
 * @param schemaPath - Selected physical application schema registration source.
 * @returns Drizzle Kit configuration source using the dialect's explicit environment connection.
 */
export function drizzleConfigSource(dialect: DatabaseDialect, schemaPath: string): string {
  const variable = dialect === "sqlite" ? "DATABASE_PATH" : "DATABASE_URL";
  const value = dialect === "sqlite" ? "path" : "url";
  const invalid = dialect === "sqlite" ? ` || path === ":memory:"` : "";
  return `import { existsSync } from "node:fs";
import { defineConfig } from "drizzle-kit";

// Bun and \`relkit db migrate\` load the environment files; drizzle-kit run by npm or pnpm on Node
// does not. Values already set win, and .env.local comes before .env.
for (const file of [".env.local", ".env"]) {
  if (typeof process.loadEnvFile === "function" && existsSync(file)) process.loadEnvFile(file);
}

const ${value} = process.env.${variable};
if (${value} === undefined || ${value}.trim() === ""${invalid}) {
  throw new Error("Set ${variable} to the database you intend to migrate");
}

export default defineConfig({
  schema: "./${schemaPath}",
  dialect: "${dialect}",
  out: "./${dirname(dirname(schemaPath))}/migrations",
  dbCredentials: { url: ${value} },
});
`;
}
