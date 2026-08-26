import type { DescriptorBase, MaybePromise } from "@zsys/contracts";
import type { InferInsertModel, InferSelectModel, Table } from "drizzle-orm";
import type { ZodType } from "zod";

export type TableMap = Readonly<Record<string, Table>>;
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

export type OperationName = keyof BaseOperations<Table>;
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

export type DataModelOverrides<Tables extends TableMap> = {
  readonly [Name in keyof Tables]?: TableOverrides<Tables[Name]>;
};

export interface TableZodSchemas<T extends Table> {
  readonly select: ZodType<Row<T>>;
  readonly insert: ZodType<Insert<T>>;
  readonly update: ZodType<Update<T>>;
}

export type ModelConstructor<Instance> = new () => Instance;
export type BaseModelConstructor<Database, T extends Table> = ModelConstructor<
  BaseOperations<T> & { readonly drizzle: Database; readonly table: T }
>;

export type DefaultModels<Database, Tables extends TableMap> = {
  readonly [Name in keyof Tables]: BaseModelConstructor<Database, Tables[Name]>;
};

export type CustomModels = Readonly<Record<string, ModelConstructor<object>>>;
declare const DATA_MODEL_TYPES: unique symbol;

export type DataModelClasses<Database, Tables extends TableMap, Models extends CustomModels> = {
  readonly [Name in keyof Tables]: Name extends keyof Models
    ? Models[Name]
    : BaseModelConstructor<Database, Tables[Name]>;
};

export type DataModelDescriptor<
  Database = unknown,
  Tables extends TableMap = TableMap,
  Models extends CustomModels = {},
> = DescriptorBase<"data-model", string> &
  DataModelClasses<Database, Tables, Models> & {
    readonly [DATA_MODEL_TYPES]: {
      readonly database: Database;
      readonly tables: Tables;
      readonly models: Models;
    };
    readonly dialect: "pg" | "mysql" | "sqlite";
    readonly tableNames: readonly Extract<keyof Tables, string>[];
    readonly custom: <
      Name extends Extract<keyof Tables, string>,
      Class extends ModelConstructor<
        InstanceType<DataModelClasses<Database, Tables, Models>[Name]>
      >,
    >(
      tableName: Name,
      model: Class,
    ) => DataModelDescriptor<Database, Tables, Models & Record<Name, Class>>;
  };

export type DatabaseContext<Descriptor extends DataModelDescriptor<any, any, any>> = {
  readonly [
    Name in keyof Descriptor[typeof DATA_MODEL_TYPES]["tables"]
  ]: Name extends keyof Descriptor[typeof DATA_MODEL_TYPES]["models"]
    ? InstanceType<Descriptor[typeof DATA_MODEL_TYPES]["models"][Name]>
    : InstanceType<
        BaseModelConstructor<
          Descriptor[typeof DATA_MODEL_TYPES]["database"],
          Descriptor[typeof DATA_MODEL_TYPES]["tables"][Name]
        >
      >;
} & {
  readonly transaction: <Value>(
    run: (context: DatabaseContext<Descriptor>) => MaybePromise<Value>,
  ) => Promise<Value>;
  readonly zodSchemas: {
    readonly [Name in keyof Descriptor[typeof DATA_MODEL_TYPES]["tables"]]: TableZodSchemas<
      Descriptor[typeof DATA_MODEL_TYPES]["tables"][Name]
    >;
  };
};
