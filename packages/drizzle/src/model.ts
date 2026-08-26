import type { Table } from "drizzle-orm";
import { MODEL_BINDING, type BoundModel, type ModelBinding } from "./runtime-types.js";
import { runOperation } from "./operations.js";
import type {
  BaseOperations,
  DeleteArgs,
  FindManyArgs,
  FindOneArgs,
  InsertArgs,
  Row,
  UpdateArgs,
  UpsertArgs,
} from "./types.js";

export const RESERVED_OPERATIONS = Object.freeze([
  "findOne",
  "findMany",
  "insert",
  "update",
  "upsert",
  "delete",
] as const);

export abstract class RuntimeModel<Database, T extends Table>
  implements BaseOperations<T>, BoundModel
{
  declare [MODEL_BINDING]?: ModelBinding;

  get drizzle(): Database {
    return bindingOf(this).drizzle as Database;
  }

  get table(): T {
    return bindingOf(this).table as T;
  }

  findOne(args: FindOneArgs<T>): Promise<Row<T> | null> {
    return runOperation(bindingOf(this), "findOne", args) as Promise<Row<T> | null>;
  }

  findMany(args: FindManyArgs<T> = {}): Promise<Row<T>[]> {
    return runOperation(bindingOf(this), "findMany", args) as Promise<Row<T>[]>;
  }

  insert(args: InsertArgs<T>): Promise<Row<T>> {
    return runOperation(bindingOf(this), "insert", args) as Promise<Row<T>>;
  }

  update(args: UpdateArgs<T>): Promise<Row<T> | null> {
    return runOperation(bindingOf(this), "update", args) as Promise<Row<T> | null>;
  }

  upsert(args: UpsertArgs<T>): Promise<Row<T>> {
    return runOperation(bindingOf(this), "upsert", args) as Promise<Row<T>>;
  }

  delete(args: DeleteArgs<T>): Promise<Row<T> | null> {
    return runOperation(bindingOf(this), "delete", args) as Promise<Row<T> | null>;
  }
}

export function bindModel<Instance extends object>(
  model: Instance,
  binding: ModelBinding,
): Instance {
  Object.defineProperty(model, MODEL_BINDING, { value: binding });
  return model;
}

function bindingOf(value: BoundModel): ModelBinding {
  const binding = value[MODEL_BINDING];
  if (binding === undefined) {
    throw new TypeError("Data-model runtime is unavailable during construction");
  }
  return binding;
}
