import type { Table } from "drizzle-orm";
import { runOperation } from "./operations.js";
import { MODEL_RUNTIME, type ModelBinding, type ModelRuntime } from "./runtime-types.js";
import type {
  BaseOperations,
  ModelDescriptor,
  ModelDescriptorAny,
  ModelExtensionMap,
  NonEmptyExtensions,
} from "./types.js";
import { frameworkTrace } from "@relkit/invocation";

export const RESERVED_OPERATIONS = Object.freeze([
  "findOne",
  "findMany",
  "insert",
  "update",
  "upsert",
  "delete",
] as const);

/**
 * Adds named table methods with an injected table and transaction-aware Drizzle client.
 * Use service overrides, not extensions, to replace the six reserved CRUD operations.
 *
 * @example
 * ```ts
 * import { defineModel } from "@relkit/drizzle"
 * import { integer, sqliteTable } from "drizzle-orm/sqlite-core"
 *
 * const users = sqliteTable("users", { id: integer().primaryKey() })
 * const model = defineModel({
 *   table: users,
 *   extend: { firstTen: ({ table, database }) => database.select().from(table).limit(10) },
 * })
 * console.assert(model.extensionNames.includes("firstTen"))
 * ```
 * @category Database
 * @since 0.1.0
 */
export function defineModel<
  const T extends Table,
  const Extensions extends ModelExtensionMap<T>,
>(options: {
  readonly table: T;
  readonly extend: NonEmptyExtensions<Extensions>;
}): ModelDescriptor<T, Extensions> {
  if (!isRecord(options) || !isRecord(options.extend) || Object.keys(options.extend).length === 0) {
    throw new TypeError("A model needs at least one extension function");
  }
  for (const [name, extension] of Object.entries(options.extend)) {
    if (RESERVED_OPERATIONS.includes(name as (typeof RESERVED_OPERATIONS)[number])) {
      throw new TypeError(`Model extensions cannot replace reserved operation "${name}"`);
    }
    if (typeof extension !== "function") {
      throw new TypeError(`Model extension "${name}" must be a function`);
    }
  }
  const runtime: ModelRuntime = { table: options.table, extend: options.extend as never };
  const descriptor = {
    table: options.table,
    extensionNames: Object.freeze(Object.keys(options.extend)),
  };
  Object.defineProperty(descriptor, MODEL_RUNTIME, { value: runtime });
  return Object.freeze(descriptor) as ModelDescriptor<T, Extensions>;
}

export function modelRuntimeOf(value: ModelDescriptorAny): ModelRuntime {
  const runtime = (value as unknown as Record<PropertyKey, unknown>)[MODEL_RUNTIME];
  if (!isRecord(runtime) || !isRecord(runtime.extend)) {
    throw new TypeError("Invalid Drizzle model descriptor");
  }
  return runtime as unknown as ModelRuntime;
}

export function createBoundModel(binding: ModelBinding, model?: ModelDescriptorAny): object {
  const base: BaseOperations<Table> = {
    findOne: (args) => runOperation(binding, "findOne", args) as never,
    findMany: (args = {}) => runOperation(binding, "findMany", args) as never,
    insert: (args) => runOperation(binding, "insert", args) as never,
    update: (args) => runOperation(binding, "update", args) as never,
    upsert: (args) => runOperation(binding, "upsert", args) as never,
    delete: (args) => runOperation(binding, "delete", args) as never,
  };
  if (model === undefined) return Object.freeze(base);
  const extensions = Object.fromEntries(
    Object.entries(modelRuntimeOf(model).extend).map(([name, extension]) => [
      name,
      (...args: unknown[]) =>
        frameworkTrace.span(
          `relkit.database.${name}`,
          {
            input: args,
            attributes: {
              "db.system.name": binding.dialect,
              "db.operation.name": name,
            },
          },
          () => extension({ table: binding.table, database: binding.drizzle as any }, ...args),
        ),
    ]),
  );
  return Object.freeze({ ...base, ...extensions });
}

function isRecord(value: unknown): value is Record<PropertyKey, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
