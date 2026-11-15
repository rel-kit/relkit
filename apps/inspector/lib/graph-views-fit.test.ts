import { describe, expect, test } from "bun:test";
import {
  MIN_READABLE_ZOOM,
  SMALLEST_CARD_TEXT_PX,
  TOOLBAR_INSET,
  initialViewport,
} from "./graph-views-fit";

describe("default fit (IN-45)", () => {
  test("a graph that fits at a readable scale is fitted, centred and below the toolbar", () => {
    const view = initialViewport({ width: 600, height: 400 }, { width: 1200, height: 800 });
    expect(view.zoom).toBe(1);
    expect(view.x).toBe(300);
    expect(view.y).toBe(TOOLBAR_INSET + (800 - TOOLBAR_INSET - 400) / 2);
  });

  test("a large graph is shown at the readable minimum from its top-left, to pan", () => {
    const view = initialViewport({ width: 6000, height: 3000 }, { width: 1200, height: 800 });
    expect(view.zoom).toBe(MIN_READABLE_ZOOM);
    expect(view.x).toBe(24);
    expect(view.y).toBe(TOOLBAR_INSET + 24);
  });

  test("a graph a little too wide is panned, not shrunk below the minimum", () => {
    const view = initialViewport({ width: 1500, height: 300 }, { width: 1200, height: 800 });
    expect(view.zoom).toBe(MIN_READABLE_ZOOM);
  });

  test("the smallest card text stays about 11 px at the minimum scale", () => {
    expect(SMALLEST_CARD_TEXT_PX * MIN_READABLE_ZOOM).toBeGreaterThanOrEqual(10.9);
    expect(MIN_READABLE_ZOOM).toBeGreaterThanOrEqual(1);
  });

  test("no content starts under the toolbar", () => {
    for (const content of [
      { width: 300, height: 200 },
      { width: 900, height: 700 },
      { width: 9000, height: 9000 },
    ]) {
      expect(initialViewport(content, { width: 1200, height: 800 }).y).toBeGreaterThanOrEqual(
        TOOLBAR_INSET,
      );
    }
  });

  test("a canvas without a toolbar can start at the edge padding", () => {
    const view = initialViewport({ width: 6000, height: 3000 }, { width: 1200, height: 800 }, 1, 0);
    expect(view.y).toBe(24);
  });
});
