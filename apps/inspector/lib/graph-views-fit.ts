/**
 * The graph canvas's first viewport (IN-45). Fitting a large application into the canvas shrank
 * card text to about 5 px; below a readable scale the canvas starts at the top-left and the
 * reader pans instead.
 */

/** Lowest default scale: 12 px card text stays above 7 px. */
export const MIN_READABLE_ZOOM = 0.62;
const PADDING = 24;

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
 */
export function initialViewport(content: Size, canvas: Size, maxZoom = 1): Viewport {
  const fit = Math.min(
    (canvas.width - PADDING * 2) / Math.max(1, content.width),
    (canvas.height - PADDING * 2) / Math.max(1, content.height),
  );
  const zoom = Math.max(MIN_READABLE_ZOOM, Math.min(maxZoom, fit));
  const centre = (available: number, size: number) =>
    Math.max(PADDING, (available - size * zoom) / 2);
  return { x: centre(canvas.width, content.width), y: centre(canvas.height, content.height), zoom };
}
