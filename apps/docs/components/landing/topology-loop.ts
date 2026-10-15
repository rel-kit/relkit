/** A capped animation clock that freezes simulation time while suspended. */
export function createTopologyLoop(
  draw: (elapsed: number) => void,
  frames: {
    readonly request: (callback: (now: number) => void) => number;
    readonly cancel: (id: number) => void;
  },
) {
  let frame: number | undefined;
  let previous: number | undefined;
  let elapsed = 0;
  let running = false;

  const tick = (now: number) => {
    frame = undefined;
    if (!running) return;
    if (previous === undefined) previous = now;
    const delta = now - previous;
    if (delta >= 1000 / 24) {
      elapsed += Math.min(delta, 100);
      previous = now;
      draw(elapsed);
    }
    if (running) frame = frames.request(tick);
  };

  return {
    start() {
      if (running) return;
      running = true;
      previous = undefined;
      frame = frames.request(tick);
    },
    stop() {
      running = false;
      if (frame !== undefined) frames.cancel(frame);
      frame = undefined;
      previous = undefined;
    },
    redraw() {
      draw(elapsed);
    },
  };
}
