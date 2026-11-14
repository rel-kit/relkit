import { describe, expect, test } from "bun:test";
import { errorOccurrences, requestsHref } from "./error-occurrences";

describe("occurrences of declared errors in the retained requests", () => {
  test("counts each error once and keeps the order of the ids", async () => {
    const asked: string[] = [];
    const counts = await errorOccurrences(["a", "b", "c"], async (id) => {
      asked.push(id);
      return { a: 29, b: 0, c: 4 }[id as "a" | "b" | "c"];
    });
    expect(asked.sort()).toEqual(["a", "b", "c"]);
    expect([...counts.entries()]).toEqual([
      ["a", 29],
      ["b", 0],
      ["c", 4],
    ]);
  });

  test("an error whose count cannot be read has no number", async () => {
    const counts = await errorOccurrences(["a", "b"], async (id) => {
      if (id === "b") throw new Error("history unavailable");
      return 3;
    });
    expect(counts.get("a")).toBe(3);
    expect(counts.get("b")).toBeUndefined();
    expect(counts.has("b")).toBe(true);
  });

  test("asks for no more than a few counts at a time", async () => {
    let active = 0;
    let peak = 0;
    await errorOccurrences(
      Array.from({ length: 20 }, (_, index) => `e${index}`),
      async () => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 1));
        active -= 1;
        return 1;
      },
    );
    expect(peak).toBeLessThanOrEqual(4);
  });

  test("links to the requests that ended with an error or with an unexpected failure", () => {
    expect(requestsHref({ errorId: "orders.out-of-stock" })).toBe(
      "/requests?errorId=orders.out-of-stock",
    );
    expect(requestsHref({ errorId: "a b/c" })).toBe("/requests?errorId=a%20b%2Fc");
    expect(requestsHref({ outcome: "defect" })).toBe("/requests?outcome=defect");
  });
});
