import type { DescriptorBase, MaybePromise } from "@relkit/contracts";
import type { MySqlAsyncDatabase } from "drizzle-orm/mysql-core";
import type { PgAsyncDatabase } from "drizzle-orm/pg-core";
import type { SQLiteAsyncDatabase } from "drizzle-orm/sqlite-core";
import type { InferInsertModel, InferSelectModel, Table } from "drizzle-orm";
import type { MySqlTable } from "drizzle-orm/mysql-core";
import type { PgTable } from "drizzle-orm/pg-core";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import type { ZodType } from "zod";

export type TableMap = Readonly<Record<string, Table>>;
export type TablesOf<Schema> = {
  readonly [Name in keyof Schema as Schema[Name] extends Table ? Name : never]: Extract<
    Schema[Name],
    Table
  >;
};
export type Row<T extends Table> = InferSelectModel<T>;
export type Insert<T extends Table> = InferInsertModel<T>;
export type Update<T extends Table> = Partial<Insert<T>>;
export type Where<T extends Table> = Partial<Row<T>>;

export interface FindOneArgs<T extends Table> {
  readonly where: Where<T>;
}
export interface FindManyArgs<T extends Table> {
  readonly where?: Where<T>;
  readonly orderBy?: {
    readonly field: Extract<keyof Row<T>, string>;
    readonly direction: "asc" | "desc";
  };
  readonly limit?: number;
  readonly offset?: number;
}
export interface InsertArgs<T extends Table> {
  readonly data: Insert<T>;
}
export interface UpdateArgs<T extends Table> {
  readonly where: Where<T>;
  readonly data: Update<T>;
}
export interface UpsertArgs<T extends Table> {
  readonly where: Where<T>;
  readonly create: Insert<T>;
  readonly update: Update<T>;
}
export interface DeleteArgs<T extends Table> {
  readonly where: Where<T>;
}

export interface BaseOperations<T extends Table> {
  findOne(args: FindOneArgs<T>): Promise<Row<T> | null>;
  findMany(args?: FindManyArgs<T>): Promise<Row<T>[]>;
  insert(args: InsertArgs<T>): Promise<Row<T>>;
  update(args: UpdateArgs<T>): Promise<Row<T> | null>;
  upsert(args: UpsertArgs<T>): Promise<Row<T>>;
  delete(args: DeleteArgs<T>): Promise<Row<T> | null>;
}

export type OperationOverride<Args, Result> = (options: {
  readonly args: Args;
  readonly base: (args: Args) => Promise<Result>;
}) => MaybePromise<Result>;
export type TableOverrides<T extends Table> = {
  readonly [Name in keyof BaseOperations<T>]?: OperationOverride<
    Parameters<BaseOperations<T>[Name]>[0],
    Awaited<ReturnType<BaseOperations<T>[Name]>>
  >;
};
export type DrizzleOverrides<Tables extends TableMap> = {
  readonly [Name in keyof Tables]?: TableOverrides<Tables[Name]>;
};

export type DialectDatabase<T extends Table> = T extends SQLiteTable
  ? Omit<SQLiteAsyncDatabase<any, any, any>, "query">
  : T extends PgTable
    ? Omit<PgAsyncDatabase<any, any>, "query">
    : T extends MySqlTable
      ? Omit<MySqlAsyncDatabase<any, any>, "query">
      : never;

export interface ModelExtensionContext<T extends Table> {
  readonly table: T;
  readonly database: DialectDatabase<T>;
}
export type ModelExtension<T extends Table> = (
  context: ModelExtensionContext<T>,
  ...args: any[]
) => unknown;
export type ModelExtensionMap<T extends Table> = Readonly<Record<string, ModelExtension<T>>>;
export type NonEmptyExtensions<Extensions extends Readonly<Record<string, unknown>>> =
  keyof Extensions extends never ? never : Extensions;

declare const MODEL_TYPES: unique symbol;
export interface ModelDescriptor<
  T extends Table,
  Extensions extends ModelExtensionMap<T> = ModelExtensionMap<T>,
> {
  readonly table: T;
  readonly extensionNames: readonly Extract<keyof Extensions, string>[];
  readonly [MODEL_TYPES]: Extensions;
}
export type ModelDescriptorAny = ModelDescriptor<Table, ModelExtensionMap<Table>>;
export type DrizzleModelMap<Tables extends TableMap> = Partial<{
  readonly [Name in keyof Tables]: ModelDescriptor<Tables[Name], any>;
}>;

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
export type ApplicationEnv = keyof Relkit.ApplicationEnv extends never
  ? Readonly<Record<string, string>>
  : Readonly<Relkit.ApplicationEnv>;

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

export type DatabaseContext<Service extends DrizzleServiceDescriptor<any, any, any, any>> = {
  readonly [Name in keyof TablesOf<Service[typeof SERVICE_TYPES]["schema"]>]: BaseOperations<
    TablesOf<Service[typeof SERVICE_TYPES]["schema"]>[Name]
  > &
    (Name extends keyof Service[typeof SERVICE_TYPES]["models"]
      ? ConsumerExtensions<Service[typeof SERVICE_TYPES]["models"][Name]>
      : {});
} & {
  readonly transaction: <Value>(
    run: (context: DatabaseContext<Service>) => MaybePromise<Value>,
  ) => Promise<Value>;
  readonly zodSchemas: {
    readonly [Name in keyof TablesOf<Service[typeof SERVICE_TYPES]["schema"]>]: TableZodSchemas<
      TablesOf<Service[typeof SERVICE_TYPES]["schema"]>[Name]
    >;
  };
};
