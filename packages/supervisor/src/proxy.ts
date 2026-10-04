import { Cause, Effect, Exit, Layer, ManagedRuntime, Metric, Scope } from "effect";
import { observeExecution, runExecutionSync } from "@relkit/contracts/operation";
import { createLoggerLayer } from "@relkit/runtime-effect/logger";
import { drainResponse } from "./proxy-forward.js";
import { createProxyLayer, SupervisorProxyOwner } from "./proxy-service.js";
import { validateHostname, validatePort } from "./proxy-validation.js";
import { proxyWebSocketHandler, upgradeProxyWebSocket } from "./proxy-websocket.js";
import { joinStoppedProxyListener } from "./proxy-listener-native.js";
import type { ProxySocketData } from "./proxy-websocket.js";
import type { SupervisorCandidateToken } from "./state-machine.types.js";
import type {
  SupervisorProxyOptions,
  SupervisorProxyService,
  SupervisorProxyTarget,
} from "./proxy.types.js";

export type {
  SupervisorProxyTarget,
  ActiveSupervisorProxyTarget,
  SupervisorProxyOptions,
} from "./proxy.types.js";
export { forwardProxyRequest } from "./proxy-forward.js";
export const DEFAULT_SUPERVISOR_HOSTNAME = "127.0.0.1";
export const DEFAULT_SUPERVISOR_PORT = 3_000;

/** Stable native listener over one atomically owned generation service. */
export class SupervisorProxy {
  private readonly hostname: string;
  private readonly configuredPort: number;
  private readonly owner;
  private readonly service: SupervisorProxyService;
  private server: Bun.Server<ProxySocketData> | undefined;
  private stopping: Promise<void> | undefined;
  private readonly nativeSockets = new Set<Bun.ServerWebSocket<ProxySocketData>>();

  /** Acquires a service without listening. @param options - Native capabilities and listener policy. */
  constructor(options: SupervisorProxyOptions = {}) {
    this.hostname = options.hostname ?? DEFAULT_SUPERVISOR_HOSTNAME;
    this.configuredPort = validatePort(options.port ?? DEFAULT_SUPERVISOR_PORT, true);
    const targetHostname = options.targetHostname ?? DEFAULT_SUPERVISOR_HOSTNAME;
    validateHostname(this.hostname, "hostname");
    validateHostname(targetHostname, "targetHostname");
    this.owner = ManagedRuntime.make(
      Layer.mergeAll(
        createProxyLayer(options, targetHostname),
        createLoggerLayer({ component: "supervisor", ...options.logger }),
        Layer.succeed(Metric.MetricRegistry, new Map()),
      ),
    );
    this.service = runExecutionSync(this.owner, SupervisorProxyOwner);
  }

  /** Bound port, or the requested port before listening. */
  get port(): number {
    return this.server?.port ?? this.configuredPort;
  }
  /** Native listener authority when listening. */
  get url(): URL | undefined {
    return this.server?.url;
  }
  /** Immutable generation selected for new admission. */
  get activeTarget() {
    return runExecutionSync(this.owner, this.service.target);
  }

  /** Opens or reopens the stable listener. @returns This proxy once listening. */
  async listen(): Promise<this> {
    if (this.server !== undefined) return this;
    if (this.stopping !== undefined) await this.stopping;
    this.server = Bun.serve({
      hostname: this.hostname,
      port: this.configuredPort,
      websocket: {
        ...proxyWebSocketHandler,
        open: (socket) => {
          this.nativeSockets.add(socket);
          proxyWebSocketHandler.open!(socket);
        },
        close: (socket, code, reason) => {
          this.nativeSockets.delete(socket);
          proxyWebSocketHandler.close!(socket, code, reason);
        },
      },
      fetch: (request, server) =>
        request.headers.get("upgrade")?.toLowerCase() === "websocket"
          ? this.upgrade(request, server)
          : this.handle(request),
    });
    return this;
  }

  /** Pins admission before native handshake. @param request - Upgrade request. @param server - Owned listener.
   * @returns Upstream acceptance or drain rejection. */
  private upgrade(request: Request, server: Bun.Server<ProxySocketData>): Promise<Response> {
    const admitted = runExecutionSync(this.owner, this.service.admit);
    if (admitted === undefined) return Promise.resolve(drainResponse());
    return this.unwrap(upgradeProxyWebSocket(request, server, admitted));
  }

  /** Atomically selects a newer generation. @param expected - CAS witness. @param next - Next target.
   * @returns Whether the active reference was replaced.
   */
  compareAndSwitch(
    expected: SupervisorCandidateToken | undefined,
    next: SupervisorProxyTarget,
  ): boolean {
    return runExecutionSync(this.owner, this.service.compareAndSwitch(expected, next));
  }

  /** Selects a newer target against the current witness. @param next - Next generation.
   * @param expected - Optional explicit witness. @returns Whether switching succeeded.
   */
  switchTarget(next: SupervisorProxyTarget, expected = this.activeTarget?.token): boolean {
    return this.compareAndSwitch(expected, next);
  }

  /** Admits synchronously before awaiting native I/O. @param request - Incoming native request.
   * @returns Upstream headers with a body that retains its generation lease until termination.
   */
  handle(request: Request): Promise<Response> {
    return this.unwrap(this.service.handle(request));
  }

  /** Stops admission, closes owned requests and sockets, and joins the listener. @returns Shared cleanup. */
  stop(): Promise<void> {
    if (this.stopping !== undefined) return this.stopping;
    const scope = runExecutionSync(this.owner, this.service.stopAdmission);
    const server = this.server;
    const service = this.service;
    const sockets = this.nativeSockets;
    this.server = undefined;
    this.stopping = this.unwrap(
      observeExecution(
        "supervisor",
        "proxy.stop",
        Effect.gen(function* () {
          // Force native listener shutdown before tunnel finalizers attempt close handshakes.
          const stopped = server?.stop(true);
          yield* Scope.close(scope, Exit.interrupt());
          if (stopped !== undefined)
            yield* Effect.tryPromise({
              try: () => joinStoppedProxyListener(server!, stopped, sockets),
              catch: (error) => error,
            });
          yield* service.finishStop;
        }),
        () => ({ listeners: server === undefined ? 0 : 1 }),
      ),
    ).finally(() => {
      this.stopping = undefined;
    });
    return this.stopping;
  }

  /** Bridges one public Promise without a new runtime. @typeParam A - Native public result.
   * @param effect - Owned service work. @returns Original result or squashed original failure. */
  private async unwrap<A>(effect: Effect.Effect<A, unknown>): Promise<A> {
    const exit = await this.owner.runPromiseExit(effect);
    if (Exit.isFailure(exit)) throw Cause.squash(exit.cause);
    return exit.value;
  }
}

/**
 * Creates a synchronously ready stable proxy.
 * @param options - Listener configuration, native dependencies and bounded telemetry sinks.
 * @returns The proxy; stop joins every admitted connection before reopening is allowed.
 * @example
 * ```ts
 * import { createSupervisorProxy } from "@relkit/supervisor";
 * export async function serveGeneration(): Promise<void> {
 * const proxy = createSupervisorProxy({ port: 0, logger: { human: false, json: false } });
 * try { await proxy.listen(); }
 * finally { await proxy.stop(); }
 * }
 * ```
 */
export function createSupervisorProxy(options: SupervisorProxyOptions = {}): SupervisorProxy {
  return new SupervisorProxy(options);
}
