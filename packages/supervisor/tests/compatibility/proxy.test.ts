import { mockFetch } from "../fixtures/fetch.ts";
import { expect, test } from "bun:test";
import { createSupervisorDrain } from "../../src/drain.js";
import { createSupervisorProxy } from "../../src/proxy.js";
import { Cause, Effect, Exit, Scope } from "effect";
import { createLoggerLayer } from "@relkit/runtime-effect/logger";
import { proxyWebSocketHandler, upgradeProxyWebSocket } from "../../src/proxy-websocket.js";
import type { ProxySocketData } from "../../src/proxy-websocket.types.js";
import { joinStoppedProxyListener } from "../../src/proxy-listener-native.js";

const echoSockets = new WeakMap<Bun.Server<undefined>, Set<Bun.ServerWebSocket<undefined>>>();

test("native WebSocket construction failure releases its admitted generation prefix", async () => {
  const parent = Effect.runSync(Scope.make());
  const server = Bun.serve<ProxySocketData>({
    port: 0,
    fetch: () => new Response(),
    websocket: proxyWebSocketHandler,
  });
  let releases = 0;
  try {
    const exit = await Effect.runPromiseExit(
      upgradeProxyWebSocket(
        new Request("http://public.test/rpc", {
          headers: { "sec-websocket-protocol": "same,same" },
        }),
        server,
        {
          target: {
            token: { sourceToken: 1, generationToken: 1 },
            hostname: "127.0.0.1",
            port: 31001,
          },
          scope: parent,
          lease: {
            token: { sourceToken: 1, generationToken: 1 },
            signal: new AbortController().signal,
            release: () => {
              releases++;
            },
          },
        },
      ).pipe(Effect.provide(createLoggerLayer({ human: false, json: false }))),
    );
    expect(Exit.isFailure(exit) && Cause.squash(exit.cause)).toBeInstanceOf(SyntaxError);
    expect(releases).toBe(1);
  } finally {
    await Effect.runPromise(Scope.close(parent, Exit.void));
    await server.stop(true);
  }
  expect(releases).toBe(1);
});

test("forwards request and SSE metadata without buffering the response", async () => {
  let forwarded: Request | undefined;
  const proxy = createSupervisorProxy({
    fetch: mockFetch(async (input, init) => {
      forwarded =
        input instanceof Request ? new Request(input, init) : new Request(input.toString(), init);
      return new Response("data: ready\n\n", {
        headers: { "cache-control": "no-cache", "content-type": "text/event-stream" },
      });
    }),
  });
  const token = { sourceToken: 1, generationToken: 1 } as const;
  try {
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
  } finally {
    await proxy.stop();
  }
});

test("compare-and-switch rejects stale tokens and keeps the stable port", async () => {
  const proxy = createSupervisorProxy({
    port: 0,
    fetch: mockFetch(async (input) => new Response(input.toString())),
  });
  const first = { sourceToken: 1, generationToken: 1 } as const;
  const second = { sourceToken: 2, generationToken: 2 } as const;
  try {
    expect(proxy.compareAndSwitch(undefined, { token: first, port: 31_002 })).toBe(true);
    expect(proxy.compareAndSwitch(first, { token: second, port: 31_003 })).toBe(true);
    expect(
      proxy.compareAndSwitch(first, {
        token: { sourceToken: 3, generationToken: 3 },
        port: 31_004,
      }),
    ).toBe(false);
    expect(proxy.activeTarget?.token).toEqual(second);
    expect(proxy.port).toBe(0);
    expect(await proxy.handle(new Request("http://stable.local/"))).toBeInstanceOf(Response);
  } finally {
    await proxy.stop();
  }
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
    expect(proxy.compareAndSwitch(undefined, { token: first, port: old.port! })).toBe(true);
    const oldRequest = fetch(new URL("/hold", proxyUrl));
    await oldStartedPromise;

    expect(proxy.compareAndSwitch(first, { token: second, port: next.port! })).toBe(true);
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
    fetch: mockFetch(
      (_input, init) =>
        new Promise<Response>((_, reject) => {
          forwardedSignal = init?.signal ?? undefined;
          forwardedSignal?.addEventListener(
            "abort",
            () => reject(forwardedSignal?.reason ?? new Error("aborted")),
            { once: true },
          );
        }),
    ),
  });

  try {
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
  } finally {
    await proxy.stop();
    await drain.close();
  }
});

test("WebSocket tunnels remain pinned to the generation selected at upgrade", async () => {
  const old = echoServer("old");
  const next = echoServer("new");
  const proxy = createSupervisorProxy({ port: 0 });
  try {
    await proxy.listen();
    const first = { sourceToken: 1, generationToken: 1 } as const;
    const second = { sourceToken: 2, generationToken: 2 } as const;
    expect(proxy.compareAndSwitch(undefined, { token: first, port: old.port! })).toBe(true);
    const oldSocket = await connectSocket(proxy.port);
    expect(await roundTrip(oldSocket, "one")).toBe("old:one");
    expect(proxy.compareAndSwitch(first, { token: second, port: next.port! })).toBe(true);
    const nextSocket = await connectSocket(proxy.port);
    expect(await roundTrip(oldSocket, "two")).toBe("old:two");
    expect(await roundTrip(nextSocket, "three")).toBe("new:three");
    const closed = new Promise<CloseEvent>((resolve) => {
      oldSocket.addEventListener("close", resolve, { once: true });
    });
    oldSocket.send("close-fixture");
    expect(await closed).toMatchObject({ code: 4321, reason: "fixture close" });
    oldSocket.close();
    nextSocket.close();
    const stablePort = proxy.port;
    await proxy.stop();
    const proof = Bun.serve({
      hostname: "127.0.0.1",
      port: stablePort,
      reusePort: false,
      fetch: () => new Response("released"),
    });
    try {
      expect(await (await fetch(proof.url)).text()).toBe("released");
    } finally {
      await proof.stop(true);
    }
  } finally {
    await proxy.stop();
    await stopEcho(old);
    await stopEcho(next);
  }
}, 15_000);

/** Opens the native generation echo fixture. @param label - Distinguishable backend identity.
 * @returns The listener; the test stops it in finally. */
function echoServer(label: string): Bun.Server<undefined> {
  const sockets = new Set<Bun.ServerWebSocket<undefined>>();
  const server = Bun.serve<undefined>({
    port: 0,
    fetch: (request, server) =>
      server.upgrade(request)
        ? new Response(null)
        : new Response("upgrade required", { status: 426 }),
    websocket: {
      open: (socket) => {
        sockets.add(socket);
      },
      close: (socket) => {
        sockets.delete(socket);
      },
      message: (socket, message) => {
        if (message === "close-fixture") socket.close(4321, "fixture close");
        else socket.send(`${label}:${String(message)}`);
      },
    },
  });
  echoSockets.set(server, sockets);
  return server;
}

/** Releases an owned native echo backend despite the pinned Bun counter defect.
 * @param server - Echo fixture with actual close acknowledgements. @returns Verified native release. */
async function stopEcho(server: Bun.Server<undefined>): Promise<void> {
  const sockets = echoSockets.get(server);
  if (sockets === undefined) throw new Error("Unknown native echo fixture owner.");
  await joinStoppedProxyListener(server, server.stop(true), sockets);
}

/** Connects to the stable proxy. @param port - Fixture listener port. @returns The accepted native socket. */
function connectSocket(port: number): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/rpc`, {
      headers: { origin: `http://127.0.0.1:${port}` },
    });
    socket.addEventListener("open", () => resolve(socket), { once: true });
    socket.addEventListener("error", () => reject(new Error("WebSocket failed.")), { once: true });
  });
}

/** Checks a pinned native tunnel. @param socket - Accepted connection. @param message - Fixture payload.
 * @returns Its next generation-labelled message. */
function roundTrip(socket: WebSocket, message: string): Promise<string> {
  return new Promise((resolve) => {
    socket.addEventListener("message", (event) => resolve(String(event.data)), { once: true });
    socket.send(message);
  });
}
