import type { InferInsertModel, InferSelectModel, Table } from "drizzle-orm";

/**
 * Persisted row inferred from a table.
 * @typeParam T - Authored table.
 */
export type Row<T extends Table> = InferSelectModel<T>;

/**
 * Insert values retaining nullable, default and generated-column inference.
 * @typeParam T - Authored table.
 */
export type Insert<T extends Table> = InferInsertModel<T>;

/**
 * Partial insert-compatible update values.
 * @typeParam T - Authored table.
 */
export type Update<T extends Table> = Partial<Insert<T>>;

/**
 * Column equality filter; unique operations require a complete selector.
 * @typeParam T - Authored table.
 */
export type Where<T extends Table> = Partial<Row<T>>;

/**
 * Complete unique selector for one row.
 * @typeParam T - Authored table.
 */
export interface FindOneArgs<T extends Table> {
  readonly where: Where<T>;
}

/**
 * Bounded ordered page filters; default limit is 100.
 * @typeParam T - Authored table.
 */
export interface FindManyArgs<T extends Table> {
  readonly where?: Where<T>;
  readonly orderBy?: {
    readonly field: Extract<keyof Row<T>, string>;
    readonly direction: "asc" | "desc";
  };
  readonly limit?: number;
  readonly offset?: number;
}

/**
 * Single-row insertion values.
 * @typeParam T - Authored table.
 */
export interface InsertArgs<T extends Table> {
  readonly data: Insert<T>;
}

/**
 * Complete selector and partial update values.
 * @typeParam T - Authored table.
 */
export interface UpdateArgs<T extends Table> {
  readonly where: Where<T>;
  readonly data: Update<T>;
}

/**
 * Selector and separate create/update branches.
 * @typeParam T - Authored table.
 */
export interface UpsertArgs<T extends Table> {
  readonly where: Where<T>;
  readonly create: Insert<T>;
  readonly update: Update<T>;
}

/**
 * Complete unique selector for deletion.
 * @typeParam T - Authored table.
 */
export interface DeleteArgs<T extends Table> {
  readonly where: Where<T>;
}

/**
 * Stable public Promise CRUD contract over one table.
 * @typeParam T - Authored table.
 */
export interface BaseOperations<T extends Table> {
  /**
   * Selects one row by a complete unique key.
   * @param args - Unique selector.
   * @returns Matching row or null, rejecting invalid selectors/native failures.
   */
  findOne(args: FindOneArgs<T>): Promise<Row<T> | null>;

  /**
   * Selects a bounded ordered page.
   * @param args - Optional filters, ordering and pagination.
   * @returns Validated rows in driver order.
   */
  findMany(args?: FindManyArgs<T>): Promise<Row<T>[]>;

  /**
   * Inserts one row without automatic retries.
   * @param args - Insert values.
   * @returns Validated inserted row.
   */
  insert(args: InsertArgs<T>): Promise<Row<T>>;

  /**
   * Updates one selected row without automatic retries.
   * @param args - Unique selector and partial update values.
   * @returns Updated row or null when absent.
   */
  update(args: UpdateArgs<T>): Promise<Row<T> | null>;

  /**
   * Selects then inserts or updates using portable dialect semantics.
   * @param args - Unique selector and create/update branches.
   * @returns Resulting row; this portable read/write sequence is not an atomic SQL upsert.
   */
  upsert(args: UpsertArgs<T>): Promise<Row<T>>;

  /**
   * Removes one selected row without automatic retries.
   * @param args - Complete unique selector.
   * @returns Deleted row or null when absent.
   */
  delete(args: DeleteArgs<T>): Promise<Row<T> | null>;
}
