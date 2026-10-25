/** Checks IPC error codes, cancellation, send/timeouts and scoped worker release through Effect and Promise adapters. */
import { ChildProcess, fork } from "node:child_process";
import { EventEmitter } from "node:events";
import { Effect, Fiber, Layer } from "effect";
import { beforeEach, expect, test, vi } from "vitest";
import { LocalWorkerError } from "@relkit/observability/local/worker-contract";
import { startLocalWorkerEffect } from "../src/local/worker-client-effect.js";
import { LocalWorkerService, localWorkerLayer } from "../src/local/worker-client-service.js";
import { startLocalWorker } from "../src/local/worker-client.js";
import { ObservabilityQueryError } from "@relkit/observability";

vi.mock("node:child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:child_process")>()),
  fork: vi.fn(),
}));

function fakeWorker() {
  const child = Object.assign(new ChildProcess(), {
    pid: 9001,
    stderr: new EventEmitter(),
    connected: true,
    send: vi.fn(),
    disconnect: vi.fn(),
    kill: vi.fn(),
  });
  child.disconnect.mockImplementation(() => {
    child.connected = false;
  });
  child.kill.mockImplementation(() => {
    queueMicrotask(() => {
      child.connected = false;
      child.emit("close", 0);
    });
    return true;
  });
  vi.mocked(fork).mockReturnValue(child);
  return child;
}

beforeEach(() => {
  vi.mocked(fork).mockReset();
});

test("Effect worker maps response codes and closed calls to tagged errors", async () => {
  const child = fakeWorker();
  const worker = Effect.runSync(startLocalWorkerEffect());
  const response = Effect.runPromise(Effect.flip(worker.call({ type: "flush" })));
  await vi.waitFor(() => expect(child.send).toHaveBeenCalledOnce());
  const id = child.send.mock.calls[0]![0].id as number;
  child.emit("message", {
    id,
    error: "invalid query",
    code: "RELKIT_OBSERVABILITY_QUERY_INVALID",
  });
  const error = await response;
  expect(error).toBeInstanceOf(LocalWorkerError);
  expect(error.reason).toBe("response");
  expect(error.code).toBe("RELKIT_OBSERVABILITY_QUERY_INVALID");
  await Effect.runPromise(worker.close());
  const closed = await Effect.runPromise(Effect.flip(worker.call({ type: "flush" })));
  expect(closed.reason).toBe("closed");
  expect(child.kill).toHaveBeenCalledOnce();
});

test("interrupting one call preserves the shared worker and unrelated replies", async () => {
  const child = fakeWorker();
  const failures: Error[] = [];
  const worker = Effect.runSync(startLocalWorkerEffect((error) => failures.push(error)));
  const fiber = Effect.runFork(worker.call({ type: "flush" }));
  await vi.waitFor(() => expect(child.send).toHaveBeenCalledOnce());
  const sibling = Effect.runPromise(worker.call({ type: "query", kind: "logs", query: {} }));
  await vi.waitFor(() => expect(child.send).toHaveBeenCalledTimes(2));
  await Effect.runPromise(Fiber.interrupt(fiber));
  expect(child.kill).not.toHaveBeenCalled();
  expect(child.connected).toBe(true);
  expect(failures).toEqual([]);
  child.emit("message", { id: child.send.mock.calls[0]![0].id, value: null });
  child.emit("message", { id: child.send.mock.calls[1]![0].id, value: { items: [] } });
  await expect(sibling).resolves.toEqual({ items: [] });
  await Effect.runPromise(worker.close());
  expect(child.kill).toHaveBeenCalledOnce();
});

test("IPC send failures use a tagged reason and release the worker", async () => {
  const child = fakeWorker();
  child.send.mockImplementation((_packet, callback) => callback(new Error("pipe closed")));
  const worker = Effect.runSync(startLocalWorkerEffect());
  const error = await Effect.runPromise(Effect.flip(worker.call({ type: "flush" })));
  expect(error.reason).toBe("send");
  expect(error.message).toBe("pipe closed");
  const later = await Effect.runPromise(Effect.flip(worker.call({ type: "flush" })));
  expect(later.reason).toBe("send");
  expect(later.message).toBe("pipe closed");
  await Effect.runPromise(worker.close());
  expect(child.kill).toHaveBeenCalledOnce();
});

test.each([false, true])(
  "IPC deadlines still release stalled workers after cancellation=%s",
  async (cancel) => {
    vi.useFakeTimers();
    try {
      const child = fakeWorker();
      const worker = Effect.runSync(startLocalWorkerEffect());
      const fiber = Effect.runFork(worker.call({ type: "flush" }));
      await vi.waitFor(() => expect(child.send).toHaveBeenCalledOnce());
      if (cancel) await Effect.runPromise(Fiber.interrupt(fiber));
      await vi.advanceTimersByTimeAsync(15_000);
      const error = await Effect.runPromise(Effect.flip(worker.call({ type: "flush" })));
      expect(error.reason).toBe("timeout");
      expect(child.kill).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  },
);

test("worker Layer releases its process when the supplied effect finishes", async () => {
  const child = fakeWorker();
  const pid = await Effect.runPromise(
    Effect.gen(function* () {
      const worker = yield* LocalWorkerService;
      return worker.pid;
    }).pipe(Effect.provide(localWorkerLayer())),
  );
  expect(pid).toBe(9001);
  expect(child.kill).toHaveBeenCalledOnce();
});

test("worker service can be replaced with a deterministic Layer", async () => {
  const program = Effect.gen(function* () {
    const worker = yield* LocalWorkerService;
    return yield* worker.call({ type: "flush" });
  });
  const result = await Effect.runPromise(
    program.pipe(
      Effect.provide(
        Layer.succeed(LocalWorkerService, {
          pid: 7,
          call: () => Effect.succeed("stored"),
          close: () => Effect.void,
        }),
      ),
    ),
  );
  expect(result).toBe("stored");
  expect(fork).not.toHaveBeenCalled();
});

test("Promise adapter calls through the Effect worker", async () => {
  const child = fakeWorker();
  const worker = startLocalWorker();
  const response = worker.call<number>({ type: "flush" });
  await vi.waitFor(() => expect(child.send).toHaveBeenCalledOnce());
  child.emit("message", { id: child.send.mock.calls[0]![0].id, value: 12 });
  await expect(response).resolves.toBe(12);
  await worker.close();
  expect(child.kill).toHaveBeenCalledOnce();
});

test("Promise adapter preserves query error names and codes", async () => {
  const child = fakeWorker();
  const worker = startLocalWorker();
  const response = worker.call({ type: "query", kind: "logs", query: {} });
  await vi.waitFor(() => expect(child.send).toHaveBeenCalledOnce());
  child.emit("message", {
    id: child.send.mock.calls[0]![0].id,
    error: "unsupported query version",
    code: "RELKIT_OBSERVABILITY_QUERY_PROTOCOL_MISMATCH",
  });
  await expect(response).rejects.toBeInstanceOf(ObservabilityQueryError);
  await expect(response).rejects.toMatchObject({
    name: "ObservabilityQueryError",
    code: "RELKIT_OBSERVABILITY_QUERY_PROTOCOL_MISMATCH",
  });
  await worker.close();
});

test("Promise adapter preserves synchronous process start errors", () => {
  vi.mocked(fork).mockImplementation(() => {
    throw new Error("spawn blocked");
  });
  expect(() => startLocalWorker()).toThrow("spawn blocked");
});
