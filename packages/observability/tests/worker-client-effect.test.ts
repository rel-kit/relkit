import { fork } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { Effect, Fiber, Layer } from "effect";
import { beforeEach, expect, test, vi } from "vitest";
import { LocalWorkerError } from "../src/local/worker-client-error.js";
import { startLocalWorkerEffect } from "../src/local/worker-client-effect.js";
import { LocalWorkerService, localWorkerLayer } from "../src/local/worker-client-service.js";
import { startLocalWorker } from "../src/local/worker-client.js";
import { ObservabilityQueryError } from "../src/query-types.js";

vi.mock("node:child_process", () => ({ fork: vi.fn() }));

function fakeWorker() {
  const child = Object.assign(new EventEmitter(), {
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
  vi.mocked(fork).mockReturnValue(child as unknown as ChildProcess);
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

test("interrupting the exported call aborts IPC and kills its worker", async () => {
  const child = fakeWorker();
  const failures: Error[] = [];
  const worker = Effect.runSync(startLocalWorkerEffect((error) => failures.push(error)));
  const fiber = Effect.runFork(worker.call({ type: "flush" }));
  await vi.waitFor(() => expect(child.send).toHaveBeenCalledOnce());
  await Effect.runPromise(Fiber.interrupt(fiber));
  expect(child.kill).toHaveBeenCalledOnce();
  expect(child.connected).toBe(false);
  expect(failures[0]?.message).toBe("Telemetry worker interrupted");
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

test("IPC timeouts fail pending work and release the worker", async () => {
  vi.useFakeTimers();
  try {
    const child = fakeWorker();
    const worker = Effect.runSync(startLocalWorkerEffect());
    const errorPromise = Effect.runPromise(Effect.flip(worker.call({ type: "flush" })));
    await vi.advanceTimersByTimeAsync(15_000);
    const error = await errorPromise;
    expect(error.reason).toBe("timeout");
    expect(child.kill).toHaveBeenCalledOnce();
  } finally {
    vi.useRealTimers();
  }
});

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
