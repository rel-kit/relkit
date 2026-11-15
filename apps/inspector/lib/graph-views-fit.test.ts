import { describe, expect, test } from "bun:test";
import { MIN_READABLE_ZOOM, initialViewport } from "./graph-views-fit";

describe("default fit (IN-45)", () => {
  test("a graph that fits at a readable scale is fitted and centred", () => {
    const view = initialViewport({ width: 600, height: 400 }, { width: 1200, height: 800 });
    expect(view.zoom).toBe(1);
    expect(view.x).toBe(300);
    expect(view.y).toBe(200);
  });

  test("a large graph is shown at the readable minimum from its top-left, to pan", () => {
    const view = initialViewport({ width: 6000, height: 3000 }, { width: 1200, height: 800 });
    expect(view.zoom).toBe(MIN_READABLE_ZOOM);
    expect(view.x).toBe(24);
    expect(view.y).toBe(24);
  });

  test("a graph a little too wide shrinks only to the minimum", () => {
    const view = initialViewport({ width: 1500, height: 300 }, { width: 1200, height: 800 });
    expect(view.zoom).toBeGreaterThanOrEqual(MIN_READABLE_ZOOM);
    expect(view.zoom).toBeLessThan(1);
  });

  test("the minimum keeps 12 px card text at least about 7 px", () => {
    expect(12 * MIN_READABLE_ZOOM).toBeGreaterThanOrEqual(7);
  });
});
