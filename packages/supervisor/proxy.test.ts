import { expect, test } from "bun:test";
import { createSupervisorDrain } from "./src/drain.js";
import { createSupervisorProxy } from "./src/proxy.js";

test("forwards request and SSE metadata without buffering the response", async () => {
  let forwarded: Request | undefined;
  const proxy = createSupervisorProxy({
    fetch: async (input, init) => {
      forwarded = new Request(input, init);
      return new Response("data: ready\n\n", {
        headers: { "cache-control": "no-cache", "content-type": "text/event-stream" },
      });
    },
  });
  const token = { sourceToken: 1, generationToken: 1 } as const;
  expect(proxy.compareAndSwitch(undefined, { token, port: 31_001 })).toBe(true);

  const response = await proxy.handle(
    new Request("http://stable.local/events", {
      headers: {
        accept: "text/event-stream",
        "last-event-id": "7",
        traceparent: "00-abc-def-01",
        "x-request-id": "request-1",
      },
    }),
  );

  expect(await response.text()).toBe("data: ready\n\n");
  expect(response.headers.get("content-type")).toContain("text/event-stream");
  expect(forwarded?.url).toBe("http://127.0.0.1:31001/events");
  expect(forwarded?.headers.get("accept")).toBe("text/event-stream");
  expect(forwarded?.headers.get("last-event-id")).toBe("7");
  expect(forwarded?.headers.get("traceparent")).toBe("00-abc-def-01");
  expect(forwarded?.headers.get("x-request-id")).toBe("request-1");
});

test("compare-and-switch rejects stale tokens and keeps the stable port", async () => {
  const proxy = createSupervisorProxy({
    port: 0,
    fetch: async (input) => new Response(input.toString()),
  });
  const first = { sourceToken: 1, generationToken: 1 } as const;
  const second = { sourceToken: 2, generationToken: 2 } as const;
  expect(proxy.compareAndSwitch(undefined, { token: first, port: 31_002 })).toBe(true);
  expect(proxy.compareAndSwitch(first, { token: second, port: 31_003 })).toBe(true);
  expect(
    proxy.compareAndSwitch(first, { token: { sourceToken: 3, generationToken: 3 }, port: 31_004 }),
  ).toBe(false);
  expect(proxy.activeTarget?.token).toEqual(second);
  expect(proxy.port).toBe(0);
  expect(await proxy.handle(new Request("http://stable.local/"))).toBeInstanceOf(Response);
});

test("new requests use the candidate while an admitted old request finishes", async () => {
  let releaseOld: ((response: Response) => void) | undefined;
  let oldStarted: (() => void) | undefined;
  const oldStartedPromise = new Promise<void>((resolve) => {
    oldStarted = resolve;
  });
  const old = Bun.serve({
    port: 0,
    fetch: (request) =>
      new URL(request.url).pathname === "/hold"
        ? new Promise<Response>((resolve) => {
            releaseOld = resolve;
            oldStarted?.();
          })
        : new Response("old"),
  });
  const next = Bun.serve({ port: 0, fetch: () => new Response("new") });
  const proxy = createSupervisorProxy({ port: 0 });

  try {
    await proxy.listen();
    const proxyUrl = proxy.url;
    if (proxyUrl === undefined) throw new Error("Proxy did not expose a stable URL.");
    const stablePort = proxy.port;
    const first = { sourceToken: 1, generationToken: 1 } as const;
    const second = { sourceToken: 2, generationToken: 2 } as const;
    expect(proxy.compareAndSwitch(undefined, { token: first, port: old.port })).toBe(true);
    const oldRequest = fetch(new URL("/hold", proxyUrl));
    await oldStartedPromise;

    expect(proxy.compareAndSwitch(first, { token: second, port: next.port })).toBe(true);
    expect(proxy.port).toBe(stablePort);
    expect(await (await fetch(new URL("/value", proxyUrl))).text()).toBe("new");
    releaseOld?.(new Response("old"));
    expect(await (await oldRequest).text()).toBe("old");
  } finally {
    releaseOld?.(new Response("cleanup"));
    await proxy.stop();
    await old.stop(true);
    await next.stop(true);
  }
});

test("drain leases abort old proxy work and reject retired traffic", async () => {
  const token = { sourceToken: 1, generationToken: 1 } as const;
  const drain = createSupervisorDrain({ token, deadlineMs: 5 });
  let forwardedSignal: AbortSignal | undefined;
  const proxy = createSupervisorProxy({
    port: 0,
    track: (candidateToken) => drain.track(candidateToken),
    fetch: (_input, init) =>
      new Promise<Response>((_, reject) => {
        forwardedSignal = init?.signal;
        forwardedSignal?.addEventListener(
          "abort",
          () => reject(forwardedSignal?.reason ?? new Error("aborted")),
          { once: true },
        );
      }),
  });

  expect(proxy.compareAndSwitch(undefined, { token, port: 31_005 })).toBe(true);
  const oldRequest = proxy.handle(new Request("http://stable.local/old"));
  expect(forwardedSignal).toBeDefined();
  const report = await drain.drain();

  expect(forwardedSignal?.aborted).toBe(true);
  expect(report).toMatchObject({
    interrupted: 1,
    completed: 1,
    remaining: 0,
    outcome: "timed-out",
  });
  await expect(oldRequest).rejects.toThrow();
  expect((await proxy.handle(new Request("http://stable.local/new"))).status).toBe(503);
});
