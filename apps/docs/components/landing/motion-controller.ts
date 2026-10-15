export interface LandingMotionState {
  readonly paused: boolean;
  readonly reduced: boolean;
  readonly running: boolean;
}

/** Suspends CSS timelines without resetting their progress or the visitor's choice. */
export function connectLandingMotion(
  host: HTMLDivElement,
  key: string,
  onChange: (state: LandingMotionState) => void,
) {
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  let paused = false;
  let visible = false;
  let disposed = false;
  try {
    paused = window.sessionStorage.getItem(key) === "true";
  } catch {
    // Motion controls still work when browser storage is unavailable.
  }
  const sync = () => {
    if (disposed) return;
    onChange({
      paused,
      reduced: media.matches,
      running: visible && !document.hidden && !media.matches && !paused,
    });
  };
  const observer = new IntersectionObserver(([entry]) => {
    visible = entry?.isIntersecting ?? false;
    sync();
  });
  observer.observe(host);
  media.addEventListener("change", sync);
  document.addEventListener("visibilitychange", sync);
  sync();
  return {
    toggle() {
      paused = !paused;
      try {
        window.sessionStorage.setItem(key, String(paused));
      } catch {
        // Persistence is optional; pausing is not.
      }
      sync();
    },
    dispose() {
      disposed = true;
      observer.disconnect();
      media.removeEventListener("change", sync);
      document.removeEventListener("visibilitychange", sync);
    },
  };
}
