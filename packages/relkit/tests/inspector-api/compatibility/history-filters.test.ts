/**
 * The history filters the stores implement reach them over HTTP: `status`, `method`, `path`,
 * `errorId` and the opt-in `count` (task 14.9).
 */
import { describe, expect, test } from "bun:test";
import { API_BASE_PATH } from "relkit/contracts";
import { json, makeApp } from "./contracts-fixtures.ts";

describe("history query filters", () => {
  test("request filters and count are passed to the store", async () => {
    const { app, seen } = makeApp();
    await json(
      app,
      API_BASE_PATH +
        "/requests?status=5xx&method=get&path=%2Forders&errorId=orders.invalid&count=true",
    );
    expect(seen.at(-1)).toMatchObject({
      status: "5xx",
      method: "get",
      path: "/orders",
      errorId: "orders.invalid",
      count: "true",
    });
  });
});
