import { describe, expect, test } from "bun:test";
import {
  STREAM_PROTOCOL,
  STREAM_VERSION,
  createInspectorStream,
  type CursorStorage,
} from "./stream";

function storage(initial?: string): CursorStorage {
  let value = initial ?? null;
  return {
    getItem: () => value,
    setItem: (_key, next) => {
      value = next;
    },
    removeItem: () => {
      value = null;
    },
  };
}

function event(cursor: number, type = "log.emitted"): string {
  return [
    `id: ${cursor}`,
    `event: ${type}`,
    `data: ${JSON.stringify({ protocol: STREAM_PROTOCOL, version: STREAM_VERSION, cursor: String(cursor), type, data: {} })}`,
    "",
    "",
  ].join("\n");
}

function response(body: string): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(body));
      controller.close();
    },
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream" } });
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100 && !predicate(); attempt += 1) await Bun.sleep(1);
}

describe("inspector SSE client", () => {
  test("persists cursors, counts gaps, and invalidates affected caches", async () => {
    const saved = storage();
    const invalidations: readonly string[][] = [];
    const client = createInspectorStream({
      storage: saved,
      reconnectDelayMs: 0,
      maxReconnectAttempts: 0,
      fetch: async () => response(`${event(1)}${event(3)}`),
      onInvalidate: (tags) => invalidations.push(tags),
    });
    client.start();
    await waitFor(() => client.snapshot.cursor === "3");
    client.stop();
    expect(client.snapshot.droppedEvents).toBe(1);
    expect(saved.getItem("relkit.inspector.stream.cursor")).toBe("3");
    expect(invalidations).toContainEqual(["logs", "signals"]);
  });

  test("clears expired and future cursors before replay", async () => {
    for (const error of [
      "RELKIT_OBSERVABILITY_STREAM_CURSOR_EXPIRED",
      "RELKIT_OBSERVABILITY_STREAM_CURSOR_FUTURE",
    ]) {
      const saved = storage("9");
      const urls: string[] = [];
      const states: string[] = [];
      let calls = 0;
      const client = createInspectorStream({
        storage: saved,
        reconnectDelayMs: 0,
        maxReconnectAttempts: 0,
        onStateChange: (snapshot) => states.push(snapshot.state),
        onInvalidate: (tags) => {
          if (tags.length === 0) states.push("cursor-reset");
        },
        fetch: async (url) => {
          urls.push(String(url));
          calls += 1;
          return calls === 1
            ? new Response(JSON.stringify({ protocol: "relkit.inspector", version: 1, error }), {
                status: 400,
                headers: { "content-type": "application/json" },
              })
            : response("");
        },
      });
      client.start();
      await waitFor(() => calls === 2);
      client.stop();
      expect(urls[0]).toContain("cursor=9");
      expect(urls[1]).not.toContain("cursor=");
      expect(saved.getItem("relkit.inspector.stream.cursor")).toBeNull();
      expect(states).toContain("reconnecting");
      expect(states).toContain("cursor-reset");
    }
  });
});
