/** Browser event/clock fixture: no GPU, timers, or real animation loops. */
export function topologyFixture() {
  const media = Object.assign(new EventTarget(), { matches: false });
  const page = Object.assign(new EventTarget(), { hidden: false });
  const host = new EventTarget() as HTMLDivElement;
  const frames = new Map<number, FrameRequestCallback>();
  let nextFrame = 0;
  let intersect: IntersectionObserverCallback;
  let resize: ResizeObserverCallback;
  let intersectionsDisconnected = 0;
  let resizesDisconnected = 0;
  const originals = new Map<string, PropertyDescriptor | undefined>();
  const replace = (name: string, value: unknown) => {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, value });
  };
  replace("window", { matchMedia: () => media });
  replace("document", page);
  replace("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  });
  replace("cancelAnimationFrame", (id: number) => frames.delete(id));
  replace(
    "IntersectionObserver",
    class {
      constructor(callback: IntersectionObserverCallback) {
        intersect = callback;
      }
      observe() {}
      disconnect() {
        intersectionsDisconnected++;
      }
    },
  );
  replace(
    "ResizeObserver",
    class {
      constructor(callback: ResizeObserverCallback) {
        resize = callback;
      }
      observe() {}
      disconnect() {
        resizesDisconnected++;
      }
    },
  );
  return {
    host,
    frames,
    visible(value: boolean) {
      intersect(
        [{ isIntersecting: value } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    },
    hidden(value: boolean) {
      page.hidden = value;
      page.dispatchEvent(new Event("visibilitychange"));
    },
    reduced(value: boolean) {
      media.matches = value;
      media.dispatchEvent(new Event("change"));
    },
    resize() {
      resize([], {} as ResizeObserver);
    },
    frame(now: number) {
      const pending = [...frames.values()];
      frames.clear();
      for (const callback of pending) callback(now);
    },
    disconnected() {
      return [intersectionsDisconnected, resizesDisconnected];
    },
    restore() {
      for (const [name, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else Reflect.deleteProperty(globalThis, name);
      }
    },
  };
}
