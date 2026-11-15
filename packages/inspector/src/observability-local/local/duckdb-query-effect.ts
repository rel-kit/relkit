/** Composes native history rows, versioned pages and execution detail under one serialization permit. */
import type { Semaphore } from "effect";
import type { DuckdbConnectionPort } from "./duckdb-driver.types.js";
import { makeDuckdbCount, makeDuckdbRows } from "./duckdb-query-rows.js";
import { makeDuckdbList } from "./duckdb-query-list.js";
import { makeDuckdbDetail } from "./duckdb-query-detail.js";
/** @param connection - Scoped database connection. @param permit - Shared write/read permit. @returns List and detail Effects. */
export function makeDuckdbQueryEffect(
  connection: DuckdbConnectionPort,
  permit: Semaphore.Semaphore,
) {
  const rows = makeDuckdbRows(connection, permit);
  const list = makeDuckdbList(rows, makeDuckdbCount(connection, permit));
  return { list, detail: makeDuckdbDetail(rows, list) };
}
