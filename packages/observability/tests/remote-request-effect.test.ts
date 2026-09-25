import { afterEach, expect, test, vi } from "vitest";
import { Effect, Fiber, Metric } from "effect";
import {
  RemoteFetchService,
  remoteFetchLayer,
  remoteRequestEffect,
} from "../src/remote-request-effect.js";
const remote = { url: "https://telemetry.example", token: "test-token" };
afterEach(() => vi.unstubAllGlobals());
test("remote request uses a substitutable transport and bounded metrics", async () => {
  const registry = new Map();
  const calls: { url: string; authorization: string | null }[] = [];
  const client = RemoteFetchService.of({
    execute: (url, init) =>
      Effect.sync(() => {
        calls.push({ url, authorization: new Headers(init.headers).get("authorization") });
        return new Response(JSON.stringify({ items: ["ok"] }), { status: 200 });
      }),
  });
  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const page = yield* remoteRequestEffect<{ items: string[] }>(remote, "/logs");
      const count = yield* Metric.value(
        Metric.counter("relkit_observability_remote_requests_total", {
          attributes: { outcome: "success" },
        }),
      );
      return { page, count };
    }).pipe(
      Effect.provideService(RemoteFetchService, client),
      Effect.provideService(Metric.MetricRegistry, registry),
    ),
  );
  expect(result.page).toEqual({ items: ["ok"] });
  expect(result.count.count).toBe(1);
  expect(calls).toEqual([
    { url: "https://telemetry.example/logs", authorization: "Bearer test-token" },
  ]);
});
test("remote request classifies non-success status in a tagged channel", async () => {
  const client = RemoteFetchService.of({
    execute: () => Effect.succeed(new Response("failed", { status: 503 })),
  });
  const error = await Effect.runPromise(
    remoteRequestEffect(remote, "/logs").pipe(
      Effect.flip,
      Effect.provideService(RemoteFetchService, client),
    ),
  );
  expect(error).toMatchObject({ _tag: "RemoteRequestError", reason: "status", status: 503 });
});
test("response decode failures have a tagged error and failure metric", async () => {
  const registry = new Map();
  const client = RemoteFetchService.of({
    execute: () => Effect.succeed(new Response("invalid json", { status: 200 })),
  });
  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const error = yield* remoteRequestEffect(remote, "/logs").pipe(Effect.flip);
      const metric = yield* Metric.value(
        Metric.counter("relkit_observability_remote_requests_total", {
          attributes: { outcome: "failure" },
        }),
      );
      return { error, metric };
    }).pipe(
      Effect.provideService(RemoteFetchService, client),
      Effect.provideService(Metric.MetricRegistry, registry),
    ),
  );
  expect(result.error).toMatchObject({ _tag: "RemoteRequestError", reason: "decode" });
  expect(result.metric.count).toBe(1);
});
test("interrupting the exported request aborts the underlying fetch", async () => {
  let started!: () => void;
  const waiting = new Promise<void>((resolve) => {
    started = resolve;
  });
  let aborted = false;
  vi.stubGlobal(
    "fetch",
    (_url: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener(
          "abort",
          () => {
            aborted = true;
            reject(new Error("aborted"));
          },
          { once: true },
        );
        started();
      }),
  );
  const fiber = Effect.runFork(
    remoteRequestEffect(remote, "/logs").pipe(Effect.provide(remoteFetchLayer)),
  );
  await waiting;
  await Effect.runPromise(Fiber.interrupt(fiber));
  expect(aborted).toBe(true);
});
test("interrupting response parsing aborts the underlying fetch", async () => {
  let parsing!: () => void;
  const started = new Promise<void>((resolve) => {
    parsing = resolve;
  });
  let aborted = false;
  vi.stubGlobal("fetch", (_url: string, init: RequestInit) => {
    init.signal?.addEventListener(
      "abort",
      () => {
        aborted = true;
      },
      { once: true },
    );
    return Promise.resolve({
      ok: true,
      json: () => {
        parsing();
        return new Promise(() => undefined);
      },
    });
  });
  const fiber = Effect.runFork(
    remoteRequestEffect(remote, "/logs").pipe(Effect.provide(remoteFetchLayer)),
  );
  await started;
  await Effect.runPromise(Fiber.interrupt(fiber));
  expect(aborted).toBe(true);
});
