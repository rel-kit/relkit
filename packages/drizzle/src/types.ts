import type { Row, Insert, Update, BaseOperations } from "./operations.types.js";
import type { DescriptorBase, MaybePromise } from "@relkit/contracts";
import type { MySqlAsyncDatabase, MySqlTable } from "drizzle-orm/mysql-core";
import type { PgAsyncDatabase, PgTable } from "drizzle-orm/pg-core";
import type { SQLiteAsyncDatabase, SQLiteTable } from "drizzle-orm/sqlite-core";
import type { Table } from "drizzle-orm";
import type { ZodType } from "zod";

/** Supported tables keyed by authored schema names. */
export type TableMap = Readonly<Record<string, Table>>;

/**
 * Table-only projection of an authored Drizzle schema.
 * @typeParam Schema - Authored table/relation map.
 */
export type TablesOf<Schema> = {
  readonly [Name in keyof Schema as Schema[Name] extends Table ? Name : never]: Extract<
    Schema[Name],
    Table
  >;
};

export type {
  Row,
  Insert,
  Update,
  Where,
  FindOneArgs,
  FindManyArgs,
  InsertArgs,
  UpdateArgs,
  UpsertArgs,
  DeleteArgs,
  BaseOperations,
} from "./operations.types.js";

/**
 * Native override receiving a Promise base operation.
 * @typeParam Args - Original validated public operation arguments.
 * @typeParam Result - Public operation result.
 * @param options - Caller arguments and lazy base operation on the same client.
 * @returns Authored synchronous or asynchronous replacement result.
 */
export type OperationOverride<Args, Result> = (options: {
  readonly args: Args;
  readonly base: (args: Args) => Promise<Result>;
}) => MaybePromise<Result>;

/**
 * Optional replacements for the six reserved table operations.
 * @typeParam T - Matching table.
 */
export type TableOverrides<T extends Table> = {
  readonly [Name in keyof BaseOperations<T>]?: OperationOverride<
    Parameters<BaseOperations<T>[Name]>[0],
    Awaited<ReturnType<BaseOperations<T>[Name]>>
  >;
};

/**
 * Table-keyed override declarations.
 * @typeParam Tables - Discovered table map.
 */
export type DrizzleOverrides<Tables extends TableMap> = {
  readonly [Name in keyof Tables]?: TableOverrides<Tables[Name]>;
};

/**
 * Transaction-aware native database surface inferred by dialect.
 * @typeParam T - Table declaring the native dialect.
 */
export type DialectDatabase<T extends Table> = T extends SQLiteTable
  ? Omit<SQLiteAsyncDatabase<any, any, any>, "query">
  : T extends PgTable
    ? Omit<PgAsyncDatabase<any, any>, "query">
    : T extends MySqlTable
      ? Omit<MySqlAsyncDatabase<any, any>, "query">
      : never;

/**
 * Injected table and transaction-bound native database.
 * @typeParam T - Matching table.
 */
export interface ModelExtensionContext<T extends Table> {
  readonly table: T;
  readonly database: DialectDatabase<T>;
}

/**
 * Authored native extension with inferred caller arguments/results.
 * @typeParam T - Matching authored table.
 * @param context - Table and transaction-aware native database.
 * @param args - Custom caller arguments preserved in the public context.
 * @returns Authored result whose exact synchronous/asynchronous type is retained.
 */
export type ModelExtension<T extends Table> = (
  context: ModelExtensionContext<T>,
  ...args: any[]
) => unknown;

/**
 * Named authored extension functions.
 * @typeParam T - Matching table.
 */
export type ModelExtensionMap<T extends Table> = Readonly<Record<string, ModelExtension<T>>>;

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

/**
 * Optional table-keyed model declarations.
 * @typeParam Tables - Discovered table map.
 */
export type DrizzleModelMap<Tables extends TableMap> = Partial<{
  readonly [Name in keyof Tables]: ModelDescriptor<Tables[Name], any>;
}>;

/**
 * Projects authored methods without their injected context argument.
 * @typeParam Model - Lazy model descriptor.
 */
type ConsumerExtensions<Model> =
  Model extends ModelDescriptor<any, infer Extensions>
    ? {
        readonly [Name in keyof Extensions]: Extensions[Name] extends (
          context: any,
          ...args: infer Args
        ) => infer Result
          ? (...args: Args) => Result
          : never;
      }
    : {};

/**
 * Unchanged public select, insert and update Zod contracts.
 * @typeParam T - Matching table.
 */
export interface TableZodSchemas<T extends Table> {
  readonly select: ZodType<Row<T>>;
  readonly insert: ZodType<Insert<T>>;
  readonly update: ZodType<Update<T>>;
}

declare global {
  namespace Relkit {
    interface ApplicationEnv {}
  }
}

/** Application declaration augmentation, falling back to string environment values. */
export type ApplicationEnv = keyof Relkit.ApplicationEnv extends never
  ? Readonly<Record<string, string>>
  : Readonly<Relkit.ApplicationEnv>;

/** Pure compiler-visible dialect, tables, constraints and custom methods. */
export interface DrizzleCapability {
  readonly kind: "drizzle";
  readonly dialect: "pg" | "mysql" | "sqlite";
  readonly tables: readonly {
    readonly name: string;
    readonly databaseName: string;
    readonly columns: readonly {
      readonly key: string;
      readonly name: string;
      readonly dataType: string;
      readonly notNull: boolean;
      readonly hasDefault: boolean;
      readonly primaryKey: boolean;
      readonly unique: boolean;
    }[];
    readonly selectors: readonly (readonly string[])[];
    readonly customMethods: readonly string[];
  }[];
}

declare const SERVICE_TYPES: unique symbol;

/**
 * Frozen service descriptor retaining native client, schema and model inference.
 * @typeParam Id - Service identity.
 * @typeParam Client - Acquired native client.
 * @typeParam Schema - Authored schema.
 * @typeParam Models - Inferred table-specific models.
 */
export type DrizzleServiceDescriptor<
  Id extends string,
  Client,
  Schema,
  Models extends DrizzleModelMap<TablesOf<Schema>>,
> = DescriptorBase<"service", Id> & {
  readonly capability: DrizzleCapability;
  readonly [SERVICE_TYPES]: {
    readonly client: Client;
    readonly schema: Schema;
    readonly models: Models;
  };
};

/**
 * Public transaction-aware table operations and unchanged Zod schemas.
 * @typeParam Service - Authored service retaining table/model types.
 */
export type DatabaseContext<Service extends DrizzleServiceDescriptor<any, any, any, any>> = {
  readonly [Name in keyof TablesOf<Service[typeof SERVICE_TYPES]["schema"]>]: BaseOperations<
    TablesOf<Service[typeof SERVICE_TYPES]["schema"]>[Name]
  > &
    (Name extends keyof Service[typeof SERVICE_TYPES]["models"]
      ? ConsumerExtensions<Service[typeof SERVICE_TYPES]["models"][Name]>
      : {});
} & {
  /**
   * Runs a callback in a portable transaction without nested portable transactions.
   * @typeParam Value - Callback result.
   * @param run - Callback receiving transaction-bound table operations.
   * @returns Callback result after native commit, or original failure after rollback.
   */
  readonly transaction: <Value>(
    run: (context: DatabaseContext<Service>) => MaybePromise<Value>,
  ) => Promise<Value>;
  readonly zodSchemas: {
    readonly [Name in keyof TablesOf<Service[typeof SERVICE_TYPES]["schema"]>]: TableZodSchemas<
      TablesOf<Service[typeof SERVICE_TYPES]["schema"]>[Name]
    >;
  };
};
