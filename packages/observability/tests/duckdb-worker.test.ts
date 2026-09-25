import { expect, test } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import type { LocalWorkerCommand, LocalWorkerResponse } from "../src/local/types.js";
test("worker message entrypoint opens, writes, queries, and closes a database", async () => {
  const root = await mkdtemp(join("/tmp", "relkit-worker-entry-"));
  const events = ["message", "disconnect", "SIGINT"] as const;
  const previous = new Map(events.map((event) => [event, new Set(process.listeners(event))]));
  const sendDescriptor = Object.getOwnPropertyDescriptor(process, "send");
  const disconnectDescriptor = Object.getOwnPropertyDescriptor(process, "disconnect");
  const replies = new Map<number, (reply: LocalWorkerResponse) => void>();
  Object.defineProperty(process, "send", {
    configurable: true,
    value: (reply: LocalWorkerResponse) => {
      replies.get(reply.id)?.(reply);
      return true;
    },
  });
  Object.defineProperty(process, "disconnect", { configurable: true, value: () => undefined });
  try {
    await import("../src/local/duckdb-worker.js");
    const handler = process
      .listeners("message")
      .find((listener) => !previous.get("message")?.has(listener));
    if (!handler) throw new Error("worker message handler was not registered");
    let id = 0;
    const call = (command: LocalWorkerCommand): Promise<LocalWorkerResponse> => {
      const current = ++id;
      const reply = new Promise<LocalWorkerResponse>((resolve) => replies.set(current, resolve));
      handler.call(process, { id: current, command });
      return reply;
    };
    expect((await call({ type: "open", root })).value).toEqual({ records: 0, malformed: 0 });
    const appended = await call({
      type: "append",
      records: [
        {
          key: "worker:1",
          origin: "application",
          record: {
            version: 2,
            signal: "log",
            timestamp: "2026-09-25T00:00:00.000Z",
            level: "info",
            component: "test",
            message: "worker entry",
          },
        },
      ],
    });
    expect(appended.error).toBeUndefined();
    const page = await call({ type: "query", kind: "logs", query: {} });
    expect(page.value).toMatchObject({ items: [{ message: "worker entry" }] });
    const invalid = await call({ type: "query", kind: "logs", query: { cursor: "invalid" } });
    expect(invalid.code).toBe("RELKIT_OBSERVABILITY_QUERY_INVALID");
    expect((await call({ type: "close" })).error).toBeUndefined();
    expect((await call({ type: "flush" })).error).toContain("Telemetry database is not open");
  } finally {
    for (const event of events)
      for (const listener of process.listeners(event))
        if (!previous.get(event)?.has(listener)) process.removeListener(event, listener);
    if (sendDescriptor) Object.defineProperty(process, "send", sendDescriptor);
    else Reflect.deleteProperty(process, "send");
    if (disconnectDescriptor) Object.defineProperty(process, "disconnect", disconnectDescriptor);
    else Reflect.deleteProperty(process, "disconnect");
    await rm(root, { recursive: true, force: true });
  }
});
