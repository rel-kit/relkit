import { and, asc, desc, eq, isNull, type Column, type SQL } from "drizzle-orm";
import type { ModelBinding } from "./runtime-types.js";
import { withOperationTracing } from "./operation-tracing.js";
export const runOperation = withOperationTracing(runLogicalOperation);
async function runLogicalOperation(
  binding: ModelBinding,
  name: string,
  args: unknown,
): Promise<unknown> {
  if (
    binding.dialect === "mysql" &&
    !binding.inTransaction &&
    ["insert", "update", "upsert", "delete"].includes(name)
  ) {
    return transaction(binding.drizzle, (drizzle) =>
      runLogicalOperation({ ...binding, drizzle, inTransaction: true }, name, args),
    );
  }
  const base = (next: unknown): Promise<unknown> => baseOperation(binding, name, next);
  const override = binding.override[name];
  return typeof override === "function" ? override({ args, base }) : base(args);
}
async function baseOperation(binding: ModelBinding, name: string, args: unknown): Promise<unknown> {
  const value = isRecord(args) ? args : {};
  switch (name) {
    case "findOne":
      return findOne(binding, selector(binding, value.where));
    case "findMany":
      return findMany(binding, value);
    case "insert":
      return insert(binding, value.data);
    case "update":
      return update(binding, selector(binding, value.where), value.data);
    case "delete":
      return remove(binding, selector(binding, value.where));
    case "upsert":
      return upsert(binding, selector(binding, value.where), value.create, value.update);
    default:
      throw new TypeError(`Unknown model operation "${name}"`);
  }
}
async function findOne(binding: ModelBinding, where: Record<string, unknown>): Promise<unknown> {
  let query = call(
    call(call(binding.drizzle, "select"), "from", binding.table),
    "where",
    clause(binding, where),
  );
  query = call(query, "limit", 1);
  return (await rows(query))[0] ?? null;
}
async function findMany(binding: ModelBinding, args: Record<string, unknown>): Promise<unknown[]> {
  const limit = integer(args.limit, "limit", 100, 1_000);
  const offset = integer(args.offset, "offset", 0);
  let query = call(call(binding.drizzle, "select"), "from", binding.table);
  if (args.where !== undefined) query = call(query, "where", clause(binding, record(args.where)));
  if (args.orderBy !== undefined) {
    const order = record(args.orderBy);
    const field = text(order.field, "orderBy.field");
    const column = columnFor(binding, field);
    if (order.direction !== "asc" && order.direction !== "desc") {
      throw new TypeError("orderBy.direction must be asc or desc");
    }
    query = call(query, "orderBy", order.direction === "asc" ? asc(column) : desc(column));
  }
  query = call(call(query, "limit", limit), "offset", offset);
  return rows(query);
}
async function insert(binding: ModelBinding, data: unknown): Promise<unknown> {
  const values = record(data);
  const query = call(call(binding.drizzle, "insert", binding.table), "values", values);
  if (hasMethod(query, "returning")) return requiredRow((await rows(call(query, "returning")))[0]);
  const where = recoverable(binding, values);
  if (where === undefined)
    throw new TypeError("MySQL insert requires a recoverable unique key override");
  await query;
  return requiredRow(await findOne(binding, where));
}
async function update(
  binding: ModelBinding,
  where: Record<string, unknown>,
  data: unknown,
): Promise<unknown> {
  const before = binding.dialect === "mysql" ? await findOne(binding, where) : undefined;
  if (binding.dialect === "mysql" && before === null) return null;
  let query = call(call(binding.drizzle, "update", binding.table), "set", record(data));
  query = call(query, "where", clause(binding, where));
  if (hasMethod(query, "returning")) return (await rows(call(query, "returning")))[0] ?? null;
  await query;
  const recover = recoverable(binding, { ...record(before), ...record(data) });
  if (recover === undefined)
    throw new TypeError("MySQL update requires a recoverable unique key override");
  return findOne(binding, recover);
}
async function remove(binding: ModelBinding, where: Record<string, unknown>): Promise<unknown> {
  const before = await findOne(binding, where);
  if (before === null) return null;
  let query = call(binding.drizzle, "delete", binding.table);
  query = call(query, "where", clause(binding, where));
  if (hasMethod(query, "returning")) return (await rows(call(query, "returning")))[0] ?? null;
  await query;
  return before;
}
async function upsert(
  binding: ModelBinding,
  where: Record<string, unknown>,
  create: unknown,
  updateValue: unknown,
): Promise<unknown> {
  const existing = await findOne(binding, where);
  return existing === null
    ? insert(binding, create)
    : requiredRow(await update(binding, where, updateValue));
}
function selector(binding: ModelBinding, value: unknown): Record<string, unknown> {
  const where = record(value);
  for (const [key, entry] of Object.entries(where)) {
    columnFor(binding, key);
    if (entry === null || entry === undefined)
      throw new TypeError("Selector values cannot be null or undefined");
  }
  if (!binding.metadata.selectors.some((keys) => keys.every((key) => Object.hasOwn(where, key)))) {
    throw new TypeError("Selector must contain a complete primary or unique constraint");
  }
  return where;
}
function recoverable(
  binding: ModelBinding,
  value: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const keys = binding.metadata.selectors.find((candidate) =>
    candidate.every((key) => value[key] !== null && value[key] !== undefined),
  );
  return keys === undefined ? undefined : Object.fromEntries(keys.map((key) => [key, value[key]]));
}
function clause(binding: ModelBinding, where: Record<string, unknown>): SQL | undefined {
  const filters = Object.entries(where).map(([key, value]) => {
    const column = columnFor(binding, key);
    if (value === undefined) throw new TypeError("Filter values cannot be undefined");
    return value === null ? isNull(column) : eq(column, value);
  });
  return filters.length === 0 ? undefined : and(...filters);
}
function columnFor(binding: ModelBinding, key: string): Column {
  const column = binding.metadata.columns[key];
  if (column === undefined) throw new TypeError(`Unknown table column "${key}"`);
  return column as Column;
}
async function rows(query: unknown): Promise<unknown[]> {
  const value = await (query as PromiseLike<unknown>);
  if (!Array.isArray(value)) throw new TypeError("Drizzle query did not return rows");
  return value;
}
function call(target: unknown, name: string, ...args: unknown[]): unknown {
  if (!isRecord(target) && typeof target !== "function")
    throw new TypeError(`Drizzle ${name} is unavailable`);
  const method = (target as Record<string, unknown>)[name];
  if (typeof method !== "function") throw new TypeError(`Drizzle ${name} is unavailable`);
  return method.apply(target, args);
}
function hasMethod(target: unknown, name: string): boolean {
  return (
    (isRecord(target) || typeof target === "function") &&
    typeof (target as Record<string, unknown>)[name] === "function"
  );
}
function transaction(
  drizzle: unknown,
  run: (transaction: unknown) => Promise<unknown>,
): Promise<unknown> {
  return call(drizzle, "transaction", run) as Promise<unknown>;
}
function record(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new TypeError("Data-model arguments must be objects");
  return value;
}
function text(value: unknown, name: string): string {
  if (typeof value !== "string" || value === "") throw new TypeError(`${name} is invalid`);
  return value;
}
function integer(
  value: unknown,
  name: string,
  fallback: number,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > maximum)
    throw new TypeError(`${name} is invalid`);
  return Number(value);
}
function requiredRow(value: unknown): unknown {
  if (value === null || value === undefined) throw new TypeError("Mutation did not return a row");
  return value;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
