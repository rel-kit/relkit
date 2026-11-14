import { describe, expect, test } from "bun:test";
import { SharedInspectorStream, type SharedStreamSource } from "./stream-shared";
import {
  STREAM_PROTOCOL,
  STREAM_VERSION,
  type InspectorStreamOptions,
  type StreamEvent,
  type StreamSnapshot,
} from "./stream-protocol";

/** A stream double that records how often it was opened and lets a test drive it. */
function harness() {
  const opened: FakeSource[] = [];
  const timers: { run: () => void; ms: number; cancelled: boolean }[] = [];
  const shared = new SharedInspectorStream(
    (options) => {
      const source = new FakeSource(options);
      opened.push(source);
      return source;
    },
    {
      releaseDelayMs: 1_000,
      schedule: (run, ms) => {
        const timer = { run, ms, cancelled: false };
        timers.push(timer);
        return timer;
      },
      cancel: (timer) => {
        (timer as { cancelled: boolean }).cancelled = true;
      },
    },
  );
  const flush = () => {
    for (const timer of timers.splice(0)) if (!timer.cancelled) timer.run();
  };
  return { shared, opened, flush };
}

class FakeSource implements SharedStreamSource {
  running = false;
  stops = 0;
  snapshot: StreamSnapshot = {
    state: "offline",
    cursor: undefined,
    droppedEvents: 0,
    reconnectAttempt: 0,
    error: undefined,
  };
  constructor(readonly options: InspectorStreamOptions) {}
  start() {
    this.running = true;
    this.state({ state: "connecting" });
  }
  stop() {
    this.running = false;
    this.stops += 1;
    this.state({ state: "offline" });
  }
  state(next: Partial<StreamSnapshot>) {
    this.snapshot = { ...this.snapshot, ...next };
    this.options.onStateChange?.(this.snapshot);
  }
  emit(type: StreamEvent["type"], cursor: string, data: unknown = {}) {
    const event: StreamEvent = {
      protocol: STREAM_PROTOCOL,
      version: STREAM_VERSION,
      cursor,
      type,
      data,
    };
    this.options.onEvent?.(event);
    this.options.onInvalidate?.(["graph"], event);
  }
}

describe("shared Inspector stream", () => {
  test("opens one stream for every subscriber of a tab", () => {
    const { shared, opened } = harness();
    const seen: string[] = [];
    shared.subscribe({ onEvent: (event) => seen.push(`a:${event.cursor}`) });
    shared.subscribe({ onEvent: (event) => seen.push(`b:${event.cursor}`) });
    shared.subscribe({});
    expect(opened).toHaveLength(1);
    expect(shared.subscribers).toBe(3);
    opened[0]!.emit("log.emitted", "1");
    expect(seen).toEqual(["a:1", "b:1"]);
  });

  test("tells a late subscriber the current state at once", () => {
    const { shared, opened } = harness();
    shared.subscribe({});
    opened[0]!.state({ state: "connected" });
    const states: string[] = [];
    shared.subscribe({ onStateChange: (snapshot) => states.push(snapshot.state) });
    expect(states).toEqual(["connected"]);
  });

  test("hands invalidations to each subscriber's own cache", () => {
    const { shared, opened } = harness();
    const a: string[][] = [];
    const b: string[][] = [];
    shared.subscribe({ cache: { invalidate: (tags) => a.push([...tags]) } });
    shared.subscribe({
      cache: { invalidate: (tags) => b.push([...tags]) },
      onInvalidate: (tags) => b.push(["notified", ...tags]),
    });
    opened[0]!.emit("generation.changed", "2");
    expect(a).toEqual([["graph"]]);
    expect(b).toEqual([["graph"], ["notified", "graph"]]);
  });

  test("closes the stream after the last subscriber leaves, not before", () => {
    const { shared, opened, flush } = harness();
    const leaveA = shared.subscribe({});
    const leaveB = shared.subscribe({});
    leaveA();
    flush();
    expect(opened[0]!.running).toBe(true);
    leaveB();
    expect(opened[0]!.running).toBe(true);
    flush();
    expect(opened[0]!.running).toBe(false);
    expect(shared.subscribers).toBe(0);
  });

  test("keeps the stream when a page remounts within the release delay", () => {
    const { shared, opened, flush } = harness();
    const leave = shared.subscribe({});
    leave();
    shared.subscribe({});
    flush();
    expect(opened).toHaveLength(1);
    expect(opened[0]!.stops).toBe(0);
  });

  test("opens a new stream after a release, and a stopped subscriber hears nothing", () => {
    const { shared, opened, flush } = harness();
    const seen: string[] = [];
    const leave = shared.subscribe({ onEvent: (event) => seen.push(event.cursor) });
    leave();
    leave();
    flush();
    shared.subscribe({});
    expect(opened).toHaveLength(2);
    opened[1]!.emit("log.emitted", "5");
    expect(seen).toEqual([]);
  });
});
