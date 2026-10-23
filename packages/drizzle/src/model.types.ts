/** Native model injection contracts without an implicit database driver selection. */
import type { Table } from "drizzle-orm";

/**
 * Injected table and transaction-bound native database.
 * @typeParam T - Matching table.
 */
export interface ModelExtensionContext<T extends Table, Database = never> {
  readonly table: T;
  readonly database: Database;
}

/**
 * Authored native extension with inferred caller arguments/results.
 * @typeParam T - Matching authored table.
 * @param context - Table and transaction-aware native database.
 * @param args - Custom caller arguments preserved in the public context.
 * @returns Authored result whose exact synchronous/asynchronous type is retained.
 */
export type ModelExtension<T extends Table, Database = never> = (
  context: ModelExtensionContext<T, Database>,
  ...args: any[]
) => unknown;

/**
 * Named authored extension functions.
 * @typeParam T - Matching table.
 */
export type ModelExtensionMap<T extends Table, Database = never> = Readonly<
  Record<string, ModelExtension<T, Database>>
>;

/**
 * Rejects declarations without any custom methods.
 * @typeParam Extensions - Authored method map.
 */
export type NonEmptyExtensions<Extensions extends Readonly<Record<string, unknown>>> =
  keyof Extensions extends never ? never : Extensions;

declare const MODEL_TYPES: unique symbol;

/**
 * Frozen lazy model descriptor retaining authored extension types.
 * @typeParam T - Matching table.
 * @typeParam Extensions - Inferred custom method signatures.
 */
export interface ModelDescriptor<
  T extends Table,
  Extensions extends ModelExtensionMap<T> = ModelExtensionMap<T>,
> {
  readonly table: T;
  readonly extensionNames: readonly Extract<keyof Extensions, string>[];
  readonly [MODEL_TYPES]: Extensions;
}

/** Internal erased model descriptor used for pure discovery. */
export type ModelDescriptorAny = ModelDescriptor<Table, ModelExtensionMap<Table>>;

/** Native model authoring signature specialized by an explicitly selected dialect entrypoint. */
export type DefineModel<Database> = <
  const T extends Table,
  const Extensions extends ModelExtensionMap<T, Database>,
>(options: {
  readonly table: T;
  readonly extend: NonEmptyExtensions<Extensions>;
}) => ModelDescriptor<T, Extensions>;
