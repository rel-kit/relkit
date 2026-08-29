import { getTableColumns, is, type Table } from "drizzle-orm";
import { getTableConfig as getMySqlTableConfig, MySqlTable } from "drizzle-orm/mysql-core";
import { getTableConfig as getPgTableConfig, PgTable } from "drizzle-orm/pg-core";
import { getTableConfig as getSqliteTableConfig, SQLiteTable } from "drizzle-orm/sqlite-core";
import type { TableMetadata } from "./runtime-types.js";
import type { TableMap } from "./types.js";

export function inspectTables(tables: TableMap): {
  readonly dialect: "pg" | "mysql" | "sqlite";
  readonly metadata: Readonly<Record<string, TableMetadata>>;
} {
  const entries = Object.entries(tables);
  if (entries.length === 0) throw new TypeError("A data model requires at least one table");
  const dialects = new Set(entries.map(([, table]) => dialectFor(table)));
  if (dialects.size !== 1) throw new TypeError("A data model cannot mix Drizzle dialects");
  return {
    dialect: [...dialects][0]!,
    metadata: Object.freeze(
      Object.fromEntries(entries.map(([name, table]) => [name, tableMetadata(table)])),
    ),
  };
}

export function extractTables(schema: Readonly<Record<string, unknown>>): TableMap {
  const tables = Object.fromEntries(
    Object.entries(schema).filter(([, value]) => isSupportedTable(value)),
  ) as TableMap;
  if (Object.keys(tables).length === 0) throw new TypeError("A Drizzle service requires a table");
  return Object.freeze(tables);
}

export function dialectFor(table: Table): "pg" | "mysql" | "sqlite" {
  if (is(table, PgTable)) return "pg";
  if (is(table, MySqlTable)) return "mysql";
  if (is(table, SQLiteTable)) return "sqlite";
  throw new TypeError("Only PostgreSQL, MySQL, and SQLite Drizzle tables are supported");
}

function isSupportedTable(value: unknown): value is Table {
  try {
    dialectFor(value as Table);
    return true;
  } catch {
    return false;
  }
}

function tableMetadata(table: Table): TableMetadata {
  const columns = getTableColumns(table) as unknown as Record<string, unknown>;
  const config = configFor(table);
  const byColumn = new Map(Object.entries(columns).map(([name, column]) => [column, name]));
  const byDatabaseName = new Map(
    Object.entries(columns).map(([name, column]) => [
      (column as { readonly name?: unknown }).name,
      name,
    ]),
  );
  const selectors: string[][] = [];
  for (const [name, column] of Object.entries(columns)) {
    const metadata = column as { readonly primary?: unknown; readonly isUnique?: unknown };
    if (metadata.primary === true || metadata.isUnique === true) selectors.push([name]);
  }
  for (const constraint of [
    ...config.primaryKeys,
    ...config.uniqueConstraints,
    ...config.indexes,
  ]) {
    const record = constraint as {
      readonly columns?: readonly unknown[];
      readonly config?: unknown;
    };
    const index = isRecord(record.config) ? record.config : undefined;
    if (index !== undefined && index.unique !== true) continue;
    const names = (record.columns ?? (index?.columns as readonly unknown[] | undefined) ?? [])
      .map(
        (column) =>
          byColumn.get(column) ?? byDatabaseName.get((column as { readonly name?: unknown }).name),
      )
      .filter((name): name is string => name !== undefined);
    if (names.length > 0) selectors.push(names);
  }
  return {
    columns: Object.freeze({ ...columns }),
    selectors: Object.freeze(uniqueSelectors(selectors)),
  };
}

function configFor(table: Table): {
  readonly primaryKeys: readonly unknown[];
  readonly uniqueConstraints: readonly unknown[];
  readonly indexes: readonly unknown[];
} {
  if (is(table, PgTable)) return getPgTableConfig(table);
  if (is(table, MySqlTable)) return getMySqlTableConfig(table);
  if (is(table, SQLiteTable)) return getSqliteTableConfig(table);
  throw new TypeError("Unsupported Drizzle table");
}

function uniqueSelectors(values: readonly string[][]): readonly (readonly string[])[] {
  return [
    ...new Map(
      values.map((value) => [[...value].sort().join("\0"), Object.freeze([...value])]),
    ).values(),
  ];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
