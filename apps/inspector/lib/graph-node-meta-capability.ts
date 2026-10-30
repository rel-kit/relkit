/** Readers for service capabilities: the capability kind, its detail line and database tables. */
import type { GraphNode } from "./graph-model";
import { meta, record, records, strings, text } from "./graph-node-meta-values";

export interface ColumnSpec {
  readonly name: string;
  readonly dataType: string;
  readonly notNull: boolean;
  readonly primaryKey: boolean;
  readonly unique: boolean;
  readonly hasDefault: boolean;
}

export interface TableSpec {
  readonly name: string;
  readonly databaseName: string;
  readonly columns: readonly ColumnSpec[];
  readonly selectors: readonly (readonly string[])[];
}

export function capabilityKind(node: GraphNode): string | undefined {
  return text(record(meta(node).capability)?.kind);
}

export function capabilityDetail(node: GraphNode): string | undefined {
  const capability = record(meta(node).capability);
  if (capability === undefined) return undefined;
  if (capability.kind === "drizzle") {
    const dialect = text(capability.dialect);
    const tables = databaseTables(node).length;
    return `${dialect ?? "drizzle"} · ${tables} ${tables === 1 ? "table" : "tables"}`;
  }
  if (capability.kind === "better-auth") return text(capability.basePath) ?? "better-auth";
  return text(capability.kind);
}

export function databaseTables(node: GraphNode): readonly TableSpec[] {
  const capability = record(meta(node).capability);
  if (capability?.kind !== "drizzle") return [];
  return records(capability.tables).flatMap((table) => {
    const name = text(table.name);
    if (name === undefined) return [];
    return [
      {
        name,
        databaseName: text(table.databaseName) ?? name,
        columns: records(table.columns).flatMap((column) => {
          const columnName = text(column.name) ?? text(column.key);
          return columnName === undefined
            ? []
            : [
                {
                  name: columnName,
                  dataType: text(column.dataType) ?? "unknown",
                  notNull: column.notNull === true,
                  primaryKey: column.primaryKey === true,
                  unique: column.unique === true,
                  hasDefault: column.hasDefault === true,
                },
              ];
        }),
        selectors: Array.isArray(table.selectors) ? table.selectors.map(strings) : [],
      },
    ];
  });
}
