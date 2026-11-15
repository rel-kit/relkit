import { describe, expect, test } from "bun:test";
import { requestTiles } from "./overview-counts";

const sample = { total: 100, failed: 5, truncated: true };

describe("request tiles (IN-16)", () => {
  test("count every retained request and failure when the counts are known", () => {
    const tiles = requestTiles(sample, { total: 1144, failed: 29 });
    expect(tiles.requests).toEqual({
      value: "1,144",
      hint: "retained · trend of the last 100",
    });
    expect(tiles.errorRate).toEqual({ value: "2.5%", hint: "29 of 1,144 retained answered 5xx" });
    expect(tiles.failed).toBe(29);
  });

  test("say the sample is the last 100 when the counts are unknown", () => {
    const tiles = requestTiles(sample, undefined);
    expect(tiles.requests).toEqual({ value: "100+", hint: "last 100 requests" });
    expect(tiles.errorRate).toEqual({
      value: "5.0%",
      hint: "5 of the last 100 requests answered 5xx",
    });
  });

  test("a short history is the whole history", () => {
    const tiles = requestTiles({ total: 3, failed: 0, truncated: false }, undefined);
    expect(tiles.requests).toEqual({ value: "3", hint: "retained in history" });
    expect(tiles.errorRate.hint).toBe("0 of 3 retained answered 5xx");
  });

  test("no requests at all", () => {
    const tiles = requestTiles({ total: 0, failed: 0, truncated: false }, { total: 0, failed: 0 });
    expect(tiles.requests.value).toBe("0");
    expect(tiles.errorRate.value).toBe("—");
    expect(tiles.requests.hint).toBe("no requests retained");
  });
});
