import { createDescriptorBase } from "@relkit/contracts";
import { createUnboundIdentity } from "@relkit/invocation";
import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-orm/zod";
import { getTableName } from "drizzle-orm";
import { extractTables, inspectTables } from "./metadata.js";
import { modelRuntimeOf, RESERVED_OPERATIONS } from "./model.js";
import { effectSchemasFor } from "./table.schemas.js";
import { DRIZZLE_RUNTIME, type DrizzleServiceRuntime } from "./runtime-types.js";
import type { DrizzleModelMap, DrizzleServiceDescriptor, TablesOf } from "./types.js";

import type { DefineDrizzleServiceOptions } from "./service.types.js";
export type { DefineDrizzleServiceOptions } from "./service.types.js";

/**
 * Defines the application's Drizzle service, table operations, and model customizations.
 * The client factory runs at activation, not during descriptor discovery.
 * @typeParam Client - Native driver client retained by activation.
 * @typeParam Schema - Authored tables and relations.
 * @typeParam Models - Table extensions preserving caller arguments/results.
 * @param options - Lazy client factory, schema, model/override and disposal policy.
 * @returns Frozen descriptor and pure capabilities; no SDK work is started.
 * @throws TypeError for invalid declarations, dialects, models or overrides.
 *
 * @example
 * ```ts
 * import { defineDrizzleService } from "@relkit/drizzle"
 * import { integer, sqliteTable } from "drizzle-orm/sqlite-core"
 *
 * const users = sqliteTable("users", { id: integer().primaryKey() })
 * const service = defineDrizzleService({
 *   schema: { users },
 *   client: () => { throw new Error("Configure a Drizzle driver before activation") },
 * })
 * console.assert(service.capability.dialect === "sqlite")
 * ```
 * @category Database
 * @since 0.1.0
 */
export function defineDrizzleService<
  Client,
  const Schema extends Readonly<Record<string, unknown>>,
  const Models extends DrizzleModelMap<TablesOf<Schema>> = {},
>(
  options: DefineDrizzleServiceOptions<Client, Schema, Models>,
): DrizzleServiceDescriptor<string, Client, Schema, Models> {
  if (!isRecord(options) || !isRecord(options.schema) || typeof options.client !== "function") {
    throw new TypeError("Invalid Drizzle service options");
  }
  const tables = extractTables(options.schema);
  const inspection = inspectTables(tables);
  const models = Object.freeze({ ...(options.models ?? {}) }) as Models;
  const overrides = Object.freeze({ ...(options.overrides ?? {}) });
  validateModels(tables, models);
  validateOverrides(tables, overrides, inspection.metadata);
  const zodSchemas = Object.freeze(
    Object.fromEntries(
      Object.entries(tables).map(([name, table]) => [
        name,
        Object.freeze({
          select: createSelectSchema(table),
          insert: createInsertSchema(table),
          update: createUpdateSchema(table),
        }),
      ]),
    ),
  );
  const runtime: DrizzleServiceRuntime = {
    client: options.client as DrizzleServiceRuntime["client"],
    ...(options.dispose === undefined ? {} : { dispose: options.dispose }),
    schema: options.schema,
    tables,
    models,
    overrides,
    metadata: inspection.metadata,
    zodSchemas,
    effectSchemas: Object.freeze(
      Object.fromEntries(
        Object.entries(tables).map(([name, table]) => [name, effectSchemasFor(table)]),
      ),
    ),
    dialect: inspection.dialect,
  };
  const capability = Object.freeze({
    kind: "drizzle" as const,
    dialect: inspection.dialect,
    tables: Object.freeze(
      Object.entries(tables).map(([name, table]) =>
        Object.freeze({
          name,
          databaseName: getTableName(table),
          columns: Object.freeze(
            Object.entries(inspection.metadata[name]!.columns).map(([key, column]) => {
              const value = column as Record<string, unknown>;
              return Object.freeze({
                key,
                name: typeof value.name === "string" ? value.name : key,
                dataType: typeof value.dataType === "string" ? value.dataType : "unknown",
                notNull: value.notNull === true,
                hasDefault: value.hasDefault === true,
                primaryKey: value.primary === true,
                unique: value.isUnique === true,
              });
            }),
          ),
          selectors: inspection.metadata[name]!.selectors,
          customMethods: capabilityMethods(models, name),
        }),
      ),
    ),
  });
  const descriptor = {
    ...createDescriptorBase("service", options.id ?? createUnboundIdentity()),
    capability,
  };
  Object.defineProperty(descriptor, DRIZZLE_RUNTIME, { value: runtime });
  return Object.freeze(descriptor) as DrizzleServiceDescriptor<string, Client, Schema, Models>;
}

/**
 * Reads the declared extension names for capability discovery.
 * @param models - Pure authored model map.
 * @param name - Schema table key.
 * @returns Frozen declared custom methods, or an empty list.
 */
function capabilityMethods(models: object, name: string): readonly string[] {
  const model = (models as Record<string, { readonly extensionNames?: readonly string[] }>)[name];
  return model?.extensionNames ?? Object.freeze([]);
}

/**
 * Resolves hidden runtime metadata without acquiring a client.
 * @param value - Frozen service declaration.
 * @returns Pure client factory/table metadata.
 * @throws TypeError for unbranded declarations.
 */
export function drizzleRuntimeOf(value: object): DrizzleServiceRuntime {
  const runtime = (value as Record<PropertyKey, unknown>)[DRIZZLE_RUNTIME];
  if (!isRecord(runtime)) throw new TypeError("Invalid Drizzle service descriptor");
  return runtime as unknown as DrizzleServiceRuntime;
}

/**
 * Validates extension table identity.
 * @param tables - Discovered tables.
 * @param models - Authored extensions.
 * @returns Void after validation.
 * @throws TypeError for unknown or mismatched tables.
 */
function validateModels(
  tables: Readonly<Record<string, unknown>>,
  models: Readonly<Record<string, unknown>>,
): void {
  for (const [name, model] of Object.entries(models)) {
    if (!(name in tables)) throw new TypeError(`Unknown Drizzle model table "${name}"`);
    const runtime = modelRuntimeOf(model as never);
    if (runtime.table !== tables[name]) {
      throw new TypeError(`Drizzle model "${name}" must use the matching schema table`);
    }
  }
}

/**
 * Checks override names and required keyless-table operations.
 * @param tables - Discovered tables.
 * @param overrides - Authored operation substitutions.
 * @param metadata - Discovered unique selectors.
 * @returns Void after validation.
 * @throws TypeError for invalid overrides or uncovered keyless operations.
 */
function validateOverrides(
  tables: Readonly<Record<string, unknown>>,
  overrides: Readonly<Record<string, any>>,
  metadata: DrizzleServiceRuntime["metadata"],
): void {
  for (const [name, value] of Object.entries(overrides)) {
    if (!(name in tables)) throw new TypeError(`Unknown Drizzle override table "${name}"`);
    for (const operation of Object.keys(value ?? {})) {
      if (!(RESERVED_OPERATIONS as readonly string[]).includes(operation)) {
        throw new TypeError(`Unknown base operation override "${operation}"`);
      }
    }
  }
  for (const [name, table] of Object.entries(metadata)) {
    if (table.selectors.length > 0) continue;
    const missing = ["findOne", "update", "upsert", "delete"].filter(
      (operation) => typeof overrides[name]?.[operation] !== "function",
    );
    if (missing.length > 0) {
      throw new TypeError(`Keyless table "${name}" requires overrides for ${missing.join(", ")}`);
    }
  }
}

/**
 * Narrows opaque declaration records without acquiring clients.
 * @param value - Unknown declaration.
 * @returns Whether value is a non-array object.
 */
function isRecord(value: unknown): value is Record<PropertyKey, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
