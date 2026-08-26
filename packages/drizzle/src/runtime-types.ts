import type { Table } from "drizzle-orm";
import type { DataModelOverrides, ModelConstructor, TableMap, TableZodSchemas } from "./types.js";

export const DATA_MODEL_RUNTIME = Symbol.for("zsys.data-model.runtime");
export const CREATE_DATABASE_CONTEXT = Symbol.for("zsys.data-model.create-context");
export const MODEL_BINDING = Symbol("zsys.model.binding");

export interface TableMetadata {
  readonly columns: Readonly<Record<string, unknown>>;
  readonly selectors: readonly (readonly string[])[];
}

export interface DataModelRuntime {
  readonly drizzle: unknown;
  readonly tables: TableMap;
  readonly overrides: DataModelOverrides<TableMap>;
  readonly models: Readonly<Record<string, ModelConstructor<object>>>;
  readonly metadata: Readonly<Record<string, TableMetadata>>;
  readonly zodSchemas: Readonly<Record<string, TableZodSchemas<Table>>>;
}

export interface ModelBinding {
  readonly drizzle: unknown;
  readonly table: Table;
  readonly dialect: "pg" | "mysql" | "sqlite";
  readonly inTransaction: boolean;
  readonly metadata: TableMetadata;
  readonly override: Readonly<Record<string, unknown>>;
}

export type BoundModel = { [MODEL_BINDING]?: ModelBinding };
