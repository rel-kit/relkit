import type { DatabaseDialect } from "./add-types.js";

/**
 * Renders database Service Source as source text without executing user modules.
 * @param dialect - Supported database dialect.
 * @returns TypeScript declaring the selected Drizzle database service and connection factory.
 */
export function databaseServiceSource(dialect: DatabaseDialect): string {
  const sqlite = dialect === "sqlite";
  const client = sqlite
    ? `const sqlite = new Database(env.DATABASE_PATH);\n    return drizzle({ client: sqlite });`
    : `const url = env.DATABASE_URL;\n    if (!url) throw new Error("DATABASE_URL is required");\n    return drizzle.${dialect === "postgresql" ? "postgres" : "mysql"}(url);`;
  return `${sqlite ? `import { Database } from "bun:sqlite";\n` : ""}import { defineDrizzleService } from "@relkit/drizzle";
import { drizzle } from "drizzle-orm/${sqlite ? "bun-sqlite" : "bun-sql"}";
import * as schema from "./schema/index.js";

export default defineDrizzleService({
  schema,
  client: ({ env }) => {
    ${client}
  },
  dispose: (database) => database.$client.close(),
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
 * @returns Drizzle Kit configuration source using the dialect's explicit environment connection.
 */
export function drizzleConfigSource(dialect: DatabaseDialect): string {
  const variable = dialect === "sqlite" ? "DATABASE_PATH" : "DATABASE_URL";
  const value = dialect === "sqlite" ? "path" : "url";
  const invalid = dialect === "sqlite" ? ` || path === ":memory:"` : "";
  return `import { defineConfig } from "drizzle-kit";

const ${value} = process.env.${variable};
if (${value} === undefined || ${value}.trim() === ""${invalid}) {
  throw new Error("Set ${variable} to the database you intend to migrate");
}

export default defineConfig({
  schema: "./src/database/schema/index.ts",
  dialect: "${dialect}",
  out: "./drizzle",
  dbCredentials: { url: ${value} },
});
`;
}
