import { createTopologyLoop } from "./topology-loop";

export type TopologyStatus = "idle" | "ready" | "reduced" | "unavailable";

export interface TopologyScene {
  readonly render: (elapsed: number) => void;
  readonly resize: () => void;
  readonly dispose: () => void;
}

/** Owns the browser lifecycle, including late imports and Strict Mode cleanup. */
export function connectTopology(
  host: HTMLDivElement,
  options: {
    readonly load: (host: HTMLDivElement) => Promise<TopologyScene>;
    readonly onStatus: (status: TopologyStatus) => void;
    readonly paused: boolean;
  },
) {
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let disposed = false;
  let visible = false;
  let paused = options.paused;
  let loading = false;
  let failed = false;
  let scene: TopologyScene | undefined;
  let loop: ReturnType<typeof createTopologyLoop> | undefined;

  const fail = () => {
    failed = true;
    loop?.stop();
    scene?.dispose();
    scene = undefined;
    loop = undefined;
    if (!disposed) options.onStatus("unavailable");
  };

  const sync = () => {
    if (disposed || failed) return;
    const active = visible && !document.hidden && !motion.matches;
    if (!active || paused) loop?.stop();
    if (motion.matches) {
      options.onStatus("reduced");
      return;
    }
    if (scene) {
      options.onStatus("ready");
      if (active && !paused) loop?.start();
      return;
    }
    options.onStatus("idle");
    if (!active || loading) return;
    loading = true;
    void options
      .load(host)
      .then((loaded) => {
        if (disposed || failed) {
          loaded.dispose();
          return;
        }
        scene = loaded;
        loop = createTopologyLoop(
          (elapsed) => {
            try {
              loaded.render(elapsed);
            } catch {
              fail();
            }
          },
          {
            request: (callback) => requestAnimationFrame(callback),
            cancel: (id) => cancelAnimationFrame(id),
          },
        );
        resize();
        sync();
      })
      .catch(fail)
      .finally(() => {
        loading = false;
      });
  };

  const resize = () => {
    if (!scene || disposed || failed) return;
    try {
      scene.resize();
      loop?.redraw();
    } catch {
      fail();
    }
  };
  const intersection = new IntersectionObserver(([entry]) => {
    visible = entry?.isIntersecting ?? false;
    sync();
  });
  const observer = new ResizeObserver(resize);
  const contextLost = (event: Event) => {
    event.preventDefault();
    fail();
  };
  intersection.observe(host);
  observer.observe(host);
  host.addEventListener("webglcontextlost", contextLost, true);
  document.addEventListener("visibilitychange", sync);
  motion.addEventListener("change", sync);
  sync();

  return {
    setPaused(value: boolean) {
      paused = value;
      sync();
    },
    dispose() {
      disposed = true;
      loop?.stop();
      intersection.disconnect();
      observer.disconnect();
      host.removeEventListener("webglcontextlost", contextLost, true);
      document.removeEventListener("visibilitychange", sync);
      motion.removeEventListener("change", sync);
      scene?.dispose();
      scene = undefined;
    },
  };
}
