/**
 * The graph canvas's first viewport (IN-45). Fitting a large application into the canvas shrank
 * card text to about 5 px; below a readable scale the canvas starts at the top-left and the
 * reader pans instead.
 */

/** The smallest card text, the subtitle at 0.68rem, in pixels at scale 1. */
export const SMALLEST_CARD_TEXT_PX = 10.9;
/** The smallest card text the default view may show, in pixels. */
export const READABLE_TEXT_PX = 11;

/** Lowest default scale: the smallest card text stays about 11 px, so a large graph is panned. */
export const MIN_READABLE_ZOOM = Math.min(1, READABLE_TEXT_PX / SMALLEST_CARD_TEXT_PX);
const PADDING = 24;

/** Room the toolbar floated at the top of the canvas takes, so the first cards start below it. */
export const TOOLBAR_INSET = 56;

export interface Size {
  readonly width: number;
  readonly height: number;
}

export interface Viewport {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}

/**
 * @param content - The laid-out graph's size in flow units.
 * @param canvas - The canvas's size in pixels.
 * @param maxZoom - The largest scale a fit may use.
 * @param topInset - Pixels at the top of the canvas the content must stay below.
 */
export function initialViewport(
  content: Size,
  canvas: Size,
  maxZoom = 1,
  topInset = TOOLBAR_INSET,
): Viewport {
  const fit = Math.min(
    (canvas.width - PADDING * 2) / Math.max(1, content.width),
    (canvas.height - topInset - PADDING * 2) / Math.max(1, content.height),
  );
  const zoom = Math.max(MIN_READABLE_ZOOM, Math.min(maxZoom, fit));
  const centre = (available: number, size: number, start: number) =>
    Math.max(start + PADDING, start + (available - size * zoom) / 2);
  return {
    x: centre(canvas.width, content.width, 0),
    y: centre(canvas.height - topInset, content.height, topInset),
    zoom,
  };
}
