import { describe, expect, test } from "bun:test";
import { listTotalLabel } from "./list-total";

describe("how many a list says it holds", () => {
  test("the first page of a longer list names the total", () => {
    expect(listTotalLabel({ offset: 0, shown: 20, total: 23, hasMore: true })).toBe("20 of 23");
  });

  test("a later page names which records it shows", () => {
    expect(listTotalLabel({ offset: 20, shown: 3, total: 23, hasMore: false })).toBe("21–23 of 23");
  });

  test("a list that fits on one page is just its count", () => {
    expect(listTotalLabel({ offset: 0, shown: 3, total: 3, hasMore: false })).toBe("3");
    expect(listTotalLabel({ offset: 0, shown: 0, total: 0, hasMore: false })).toBe("0");
  });

  test("without a total, a full page with more behind it is a lower bound", () => {
    expect(listTotalLabel({ offset: 0, shown: 20, hasMore: true })).toBe("20+");
    expect(listTotalLabel({ offset: 0, shown: 7, hasMore: false })).toBe("7");
  });
});
