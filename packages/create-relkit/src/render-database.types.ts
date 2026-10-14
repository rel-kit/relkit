/**
 * Carries the selected native database dialect and physical source destinations
 * between database/auth scaffold stages. Values describe source declarations;
 * no connection, transaction or provider ownership is acquired by planning.
 */
import type { AddRequest } from "./add-types.js";

/** Validated discovered/planned native database and registered schema locations. */
export interface RenderedDatabase {
  readonly dialect: Extract<AddRequest, { kind: "database" }>["dialect"];
  readonly servicePath: string;
  readonly schemaPath: string;
}
