import { observeExecution } from "@relkit/contracts/operation";
import { Deferred, Effect, Exit, Ref, Scope } from "effect";
import type { ProxyAdmission } from "./proxy.types.js";
import type { ProxySocketData, ProxySocketState } from "./proxy-websocket.types.js";

import {
  awaitUpstream,
  websocketHeaders,
  protocols,
  closeDownstream,
} from "./proxy-websocket-native.js";

export type { ProxySocketData } from "./proxy-websocket.types.js";

/** Native Bun callbacks delegate to one owned tunnel. */
export const proxyWebSocketHandler: Bun.WebSocketHandler<ProxySocketData> = {
  /** Transfers accepted downstream ownership. @param socket - Native downstream. @returns After pending frames transfer. */
  open(socket) {
    socket.data.open(socket);
  },
  /** Forwards one frame while upstream remains open. @param socket - Native downstream. @param message - Frame. @returns After forwarding. */
  message(socket, message) {
    if (socket.data.upstream.readyState === WebSocket.OPEN) socket.data.upstream.send(message);
  },
  /** Propagates downstream closure. @param socket - Native downstream. @param code - Close code. @param reason - Close reason. @returns After release. */
  close(socket, code, reason) {
    socket.data.upstream.close(code, reason);
    socket.data.release();
  },
};

/**
 * Keeps one generation lease until its native socket closes.
 * @param request - Upgrade request, including forwarded browser origin.
 * @param server - Stable native listener.
 * @param admission - Generation chosen before awaiting the handshake.
 * @returns Upgrade response only after the upstream accepts the connection.
 */
export const upgradeProxyWebSocket = Effect.fn("SupervisorProxy.websocket")(function* (
  request: Request,
  server: Bun.Server<ProxySocketData>,
  admission: ProxyAdmission,
) {
  const scope = yield* Scope.fork(admission.scope);
  yield* Scope.addFinalizer(
    scope,
    Effect.sync(() => admission.lease?.release()),
  );
  return yield* Effect.gen(function* () {
    const headers = yield* Deferred.make<Response>();
    const closed = yield* Deferred.make<void>();
    const state = yield* Ref.make<ProxySocketState>({
      downstream: undefined,
      pending: [],
      bytes: 0,
    });
    const targetUrl = new URL(request.url);
    targetUrl.protocol = "ws:";
    targetUrl.hostname = admission.target.hostname;
    targetUrl.port = String(admission.target.port);
    const upstream = yield* Effect.acquireRelease(
      Effect.try({
        try: () =>
          new WebSocket(targetUrl, {
            headers: { ...websocketHeaders(request.headers), host: new URL(request.url).host },
            protocols: protocols(request.headers.get("sec-websocket-protocol")),
          }),
        catch: (error) => error,
      }),
      (socket) => Effect.sync(() => socket.terminate()),
    ).pipe(Effect.provideService(Scope.Scope, scope));
    /** Completes this tunnel's close latch idempotently. @returns After native close publication. */
    const release = (): void => {
      Effect.runSync(Deferred.succeed(closed, undefined));
    };
    /** Retires both native socket directions. @returns After requesting close and completing the latch. */
    const abort = (): void => {
      upstream.terminate();
      closeDownstream(Ref.getUnsafe(state).downstream);
      release();
    };
    const signal = AbortSignal.any([
      request.signal,
      ...(admission.lease === undefined ? [] : [admission.lease.signal]),
    ]);
    signal.addEventListener("abort", abort, { once: true });
    /** Forwards or bounds a pre-handoff frame. @param event - Upstream frame. @returns After forwarding, buffering or retirement. */
    const onMessage = (event: MessageEvent<string | Uint8Array>): void => {
      const current = Ref.getUnsafe(state);
      if (current.downstream !== undefined) {
        current.downstream.send(event.data);
        return;
      }
      const bytes =
        typeof event.data === "string" ? Buffer.byteLength(event.data) : event.data.byteLength;
      if (current.bytes + bytes > 4 * 1024 * 1024) {
        abort();
        return;
      }
      Effect.runSync(
        Ref.set(state, {
          ...current,
          pending: [...current.pending, event.data],
          bytes: current.bytes + bytes,
        }),
      );
    };
    /** Preserves upstream close metadata. @param event - Native closure. @returns After downstream retirement. */
    const onClose = (event: CloseEvent): void => {
      closeDownstream(Ref.getUnsafe(state).downstream, event.code, event.reason);
      release();
    };
    /** Retires a failed native upstream. @returns After downstream close and latch completion. */
    const onError = (): void => {
      closeDownstream(Ref.getUnsafe(state).downstream, 1011, "Upstream WebSocket failed.");
      release();
    };
    upstream.addEventListener("message", onMessage);
    upstream.addEventListener("close", onClose);
    upstream.addEventListener("error", onError);
    yield* Scope.addFinalizer(
      scope,
      Effect.sync(() => {
        signal.removeEventListener("abort", abort);
        upstream.removeEventListener("message", onMessage);
        upstream.removeEventListener("close", onClose);
        upstream.removeEventListener("error", onError);
        closeDownstream(Ref.getUnsafe(state).downstream);
      }),
    );
    const data: ProxySocketData = {
      upstream,
      release,
      /** Transfers bounded handshake frames to the accepted socket. @param socket - Native downstream. @returns After ordered transfer. */
      open(socket) {
        const current = Ref.getUnsafe(state);
        Effect.runSync(Ref.set(state, { downstream: socket, pending: [], bytes: 0 }));
        for (const message of current.pending) socket.send(message);
      },
    };
    const operation = observeExecution(
      "supervisor",
      "proxy.websocket",
      Effect.gen(function* () {
        yield* awaitUpstream(upstream);
        if (signal.aborted) return yield* Effect.interrupt;
        if (!server.upgrade(request, { data }))
          return yield* Effect.fail(new Error("Proxy upgrade failed."));
        yield* Deferred.succeed(headers, new Response(null));
        yield* Deferred.await(closed);
      }),
      () => ({ connections: 1 }),
    );
    yield* Effect.forkIn(
      operation.pipe(
        Effect.interruptible,
        Effect.onExit((exit) =>
          Effect.gen(function* () {
            if (Exit.isFailure(exit))
              yield* Deferred.succeed(
                headers,
                new Response("WebSocket upgrade failed.", { status: 502 }),
              );
            yield* Scope.close(scope, exit);
          }),
        ),
      ),
      scope,
      { startImmediately: true },
    );
    if (signal.aborted) abort();
    return yield* Effect.interruptible(Deferred.await(headers));
  }).pipe(Effect.onExit((exit) => (Exit.isFailure(exit) ? Scope.close(scope, exit) : Effect.void)));
}, Effect.uninterruptible);
