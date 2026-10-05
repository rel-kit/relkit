import type { Table } from "drizzle-orm";
import type { Effect } from "effect";
import type { DrizzleFailure } from "./failure.js";
import type { effectSchemasFor } from "./table.schemas.js";
import type { DrizzleModelMap, DrizzleOverrides, TableMap, TableZodSchemas } from "./types.js";

/** Stable hidden descriptor brand; shared across module copies. */
export const DRIZZLE_RUNTIME = Symbol.for("relkit.drizzle.runtime");

/** Stable hidden model descriptor brand. */
export const MODEL_RUNTIME = Symbol.for("relkit.drizzle.model.runtime");

/** Pure table-column and complete unique-selector metadata. */
export interface TableMetadata {
  readonly columns: Readonly<Record<string, unknown>>;
  readonly selectors: readonly (readonly string[])[];
}

/** Opaque authored extensions retaining their native injected database contract. */
export interface ModelRuntime {
  readonly table: Table;
  readonly extend: Readonly<Record<string, (context: any, ...args: any[]) => unknown>>;
}

/** Pure declaration dependencies; accessing this object never acquires a client. */
export interface DrizzleServiceRuntime {
  readonly client: (context: { readonly env: Readonly<Record<string, unknown>> }) => unknown;
  readonly dispose?: (database: any) => unknown;
  readonly schema: Readonly<Record<string, unknown>>;
  readonly tables: TableMap;
  readonly models: DrizzleModelMap<TableMap>;
  readonly overrides: DrizzleOverrides<TableMap>;
  readonly metadata: Readonly<Record<string, TableMetadata>>;
  readonly zodSchemas: Readonly<Record<string, TableZodSchemas<Table>>>;
  readonly effectSchemas: Readonly<Record<string, ReturnType<typeof effectSchemasFor>>>;
  readonly dialect: "pg" | "mysql" | "sqlite";
}

/** Table operations bound to an owner or an already admitted transaction. */
export interface ModelBinding {
  /**
   * Executes work at its owning runtime edge.
   * @typeParam A - Successful result.
   * @param effect - Lazy typed operation.
   * @param operation - Bounded diagnostic label.
   * @returns Public result or original native failure.
   */
  readonly run: <A>(effect: Effect.Effect<A, DrizzleFailure>, operation: string) => Promise<A>;
  readonly drizzle: unknown;
  readonly table: Table;
  readonly dialect: "pg" | "mysql" | "sqlite";
  readonly inTransaction: boolean;
  readonly metadata: TableMetadata;
  readonly override: Readonly<Record<string, unknown>>;
  readonly schemas: ReturnType<typeof effectSchemasFor>;
}
