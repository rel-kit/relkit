import { createDescriptorBase } from "@relkit/contracts";
import { createUnboundIdentity } from "@relkit/invocation";
import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-orm/zod";
import { inspectTables } from "./metadata.js";
import { RESERVED_OPERATIONS, RuntimeModel } from "./model.js";
import { createDatabaseContext } from "./context.js";
import {
  CREATE_DATABASE_CONTEXT,
  DATA_MODEL_RUNTIME,
  type DataModelRuntime,
} from "./runtime-types.js";
import type {
  CustomModels,
  DataModelDescriptor,
  DataModelOverrides,
  ModelConstructor,
  TableMap,
} from "./types.js";

export function defineDataModel<Database, const Tables extends TableMap>(
  drizzle: Database,
  tables: Tables,
  overrides: DataModelOverrides<Tables> = {},
): DataModelDescriptor<Database, Tables> {
  const tableMap = Object.freeze({ ...tables }) as Tables;
  const overrideMap = Object.freeze({ ...overrides }) as DataModelOverrides<Tables>;
  const inspection = inspectTables(tableMap);
  validateOverrides(tableMap, overrideMap, inspection.metadata);
  const models = Object.fromEntries(
    Object.keys(tableMap).map((name) => [
      name,
      class extends RuntimeModel<Database, Tables[typeof name]> {},
    ]),
  ) as CustomModels;
  const runtime: DataModelRuntime = Object.freeze({
    drizzle,
    tables: tableMap,
    overrides: overrideMap as DataModelRuntime["overrides"],
    models: Object.freeze(models),
    metadata: inspection.metadata,
    zodSchemas: Object.freeze(
      Object.fromEntries(
        Object.entries(tableMap).map(([name, table]) => [
          name,
          Object.freeze({
            select: createSelectSchema(table),
            insert: createInsertSchema(table),
            update: createUpdateSchema(table),
          }),
        ]),
      ),
    ) as DataModelRuntime["zodSchemas"],
  });
  return descriptor(runtime, inspection.dialect) as DataModelDescriptor<Database, Tables>;
}

function descriptor(
  runtime: DataModelRuntime,
  dialect: "pg" | "mysql" | "sqlite",
): DataModelDescriptor {
  const value = {
    ...createDescriptorBase("data-model", createUnboundIdentity()),
    dialect,
    tableNames: Object.freeze(Object.keys(runtime.tables)),
    ...runtime.models,
    custom(tableName: string, model: ModelConstructor<object>): DataModelDescriptor {
      if (!(tableName in runtime.tables))
        throw new TypeError(`Unknown data-model table "${tableName}"`);
      validateCustomModel(runtime.models[tableName]!, model);
      const models = Object.freeze({ ...runtime.models, [tableName]: model });
      return descriptor(Object.freeze({ ...runtime, models }), dialect);
    },
  };
  Object.defineProperty(value, DATA_MODEL_RUNTIME, { value: runtime });
  Object.defineProperty(value, CREATE_DATABASE_CONTEXT, {
    value: () => createDatabaseContext(value as DataModelDescriptor),
  });
  return Object.freeze(value) as DataModelDescriptor;
}

function validateOverrides<Tables extends TableMap>(
  tables: Tables,
  overrides: DataModelOverrides<Tables>,
  metadata: DataModelRuntime["metadata"],
): void {
  for (const [name, value] of Object.entries(overrides)) {
    if (!(name in tables)) throw new TypeError(`Unknown data-model override table "${name}"`);
    for (const operation of Object.keys(value ?? {})) {
      if (!(RESERVED_OPERATIONS as readonly string[]).includes(operation)) {
        throw new TypeError(`Unknown base operation override "${operation}"`);
      }
    }
  }
  for (const [name, table] of Object.entries(metadata)) {
    if (table.selectors.length > 0) continue;
    const replacement = overrides[name] ?? {};
    const missing = ["findOne", "update", "upsert", "delete"].filter(
      (operation) => typeof replacement[operation as keyof typeof replacement] !== "function",
    );
    if (missing.length > 0) {
      throw new TypeError(`Keyless table "${name}" requires overrides for ${missing.join(", ")}`);
    }
  }
}

function validateCustomModel(
  base: ModelConstructor<object>,
  model: ModelConstructor<object>,
): void {
  if (!(model.prototype instanceof base)) {
    throw new TypeError("A custom model must extend the generated table model");
  }
  for (const name of RESERVED_OPERATIONS) {
    if (Object.hasOwn(model.prototype, name)) {
      throw new TypeError(`Custom models cannot replace reserved operation "${name}"`);
    }
  }
}
