import type { Table } from "drizzle-orm";
import type { DrizzleModelMap, DrizzleOverrides, TableMap, TableZodSchemas } from "./types.js";

export const DRIZZLE_RUNTIME = Symbol.for("relkit.drizzle.runtime");
export const MODEL_RUNTIME = Symbol.for("relkit.drizzle.model.runtime");

export interface TableMetadata {
  readonly columns: Readonly<Record<string, unknown>>;
  readonly selectors: readonly (readonly string[])[];
}

export interface ModelRuntime {
  readonly table: Table;
  readonly extend: Readonly<Record<string, (context: any, ...args: any[]) => unknown>>;
}

export interface DrizzleServiceRuntime {
  readonly client: (context: { readonly env: Readonly<Record<string, unknown>> }) => unknown;
  readonly dispose?: (database: any) => unknown;
  readonly schema: Readonly<Record<string, unknown>>;
  readonly tables: TableMap;
  readonly models: DrizzleModelMap<TableMap>;
  readonly overrides: DrizzleOverrides<TableMap>;
  readonly metadata: Readonly<Record<string, TableMetadata>>;
  readonly zodSchemas: Readonly<Record<string, TableZodSchemas<Table>>>;
  readonly dialect: "pg" | "mysql" | "sqlite";
}

export interface ModelBinding {
  readonly drizzle: unknown;
  readonly table: Table;
  readonly dialect: "pg" | "mysql" | "sqlite";
  readonly inTransaction: boolean;
  readonly metadata: TableMetadata;
  readonly override: Readonly<Record<string, unknown>>;
}
