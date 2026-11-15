import { describe, expect, test } from "bun:test";
import { recentQuery, RECENT_LIMIT } from "./recent-signals";

describe("the recent signals of a function or a route", () => {
  test("asks for the newest records first, since history is oldest first by default", () => {
    expect(recentQuery({ functionId: "orders.create" })).toEqual({
      functionId: "orders.create",
      limit: RECENT_LIMIT,
      order: "desc",
    });
    expect(recentQuery({ routeId: "orders.create.http" })).toEqual({
      routeId: "orders.create.http",
      limit: RECENT_LIMIT,
      order: "desc",
    });
  });
});
