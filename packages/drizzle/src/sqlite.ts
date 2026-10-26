/** sqlite native model typing; imports only this selected dialect's upstream declarations. */
import type { SQLiteAsyncDatabase } from "drizzle-orm/sqlite-core/async/db";
import { defineModel as defineNativeModel } from "./model.js";
import type { DefineModel } from "./model.types.js";
export * from "./index.js";

/** Native database injected into model extensions for the selected dialect. */
export type DialectDatabase = Omit<SQLiteAsyncDatabase<any, any, any>, "query">;

/** Declares lazy native extensions with this dialect's real transaction client type. */
export const defineModel: DefineModel<DialectDatabase> = defineNativeModel;
