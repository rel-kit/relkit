import type { StartedCandidate } from "./candidate-types.js";
import type { SupervisorDrainLease } from "./drain-types.js";
import { drainResponse, forwardProxyRequest } from "./proxy-forward.js";
import { validateSupervisorToken } from "./state-machine-telemetry.js";
import type { SupervisorCandidateToken } from "./state-machine-types.js";

export { forwardProxyRequest } from "./proxy-forward.js";

export const DEFAULT_SUPERVISOR_HOSTNAME = "127.0.0.1";
export const DEFAULT_SUPERVISOR_PORT = 3_000;

export type SupervisorProxyTarget = Pick<StartedCandidate, "token" | "port"> & {
  readonly hostname?: string;
};

export interface ActiveSupervisorProxyTarget {
  readonly token: SupervisorCandidateToken;
  readonly hostname: string;
  readonly port: number;
}

export interface SupervisorProxyOptions {
  readonly hostname?: string;
  readonly port?: number;
  readonly targetHostname?: string;
  readonly fetch?: typeof fetch;
  readonly track?: (token: SupervisorCandidateToken) => SupervisorDrainLease | undefined;
}

/** Stable development listener that synchronously selects one active target per request. */
export class SupervisorProxy {
  private readonly hostname: string;
  private readonly configuredPort: number;
  private readonly targetHostname: string;
  private readonly fetcher: typeof fetch;
  private readonly track: SupervisorProxyOptions["track"];
  private server: Bun.Server<undefined> | undefined;
  private stopping: Promise<void> | undefined;
  private target: ActiveSupervisorProxyTarget | undefined;

  constructor(options: SupervisorProxyOptions = {}) {
    this.hostname = options.hostname ?? DEFAULT_SUPERVISOR_HOSTNAME;
    this.configuredPort = validatePort(options.port ?? DEFAULT_SUPERVISOR_PORT, true);
    this.targetHostname = options.targetHostname ?? DEFAULT_SUPERVISOR_HOSTNAME;
    validateHostname(this.hostname, "hostname");
    validateHostname(this.targetHostname, "targetHostname");
    this.fetcher = options.fetch ?? fetch;
    this.track = options.track;
  }

  get port(): number {
    return this.server?.port ?? this.configuredPort;
  }

  get url(): URL | undefined {
    return this.server?.url;
  }

  get activeTarget(): ActiveSupervisorProxyTarget | undefined {
    return this.target;
  }

  async listen(): Promise<this> {
    if (this.server !== undefined) return this;
    if (this.stopping !== undefined) await this.stopping;
    this.server = Bun.serve({
      hostname: this.hostname,
      port: this.configuredPort,
      fetch: (request) => this.handle(request),
    });
    return this;
  }

  /** Replaces the target only when the expected active token still matches. */
  compareAndSwitch(
    expected: SupervisorCandidateToken | undefined,
    next: SupervisorProxyTarget,
  ): boolean {
    if (this.stopping !== undefined) return false;
    const current = this.target;
    if (!sameToken(current?.token, expected)) return false;
    const normalized = normalizeTarget(next, this.targetHostname);
    if (
      current !== undefined &&
      (normalized.token.sourceToken <= current.token.sourceToken ||
        normalized.token.generationToken <= current.token.generationToken)
    )
      return false;
    this.target = normalized;
    return true;
  }

  switchTarget(next: SupervisorProxyTarget, expected = this.target?.token): boolean {
    return this.compareAndSwitch(expected, next);
  }

  /** Reads the active reference before awaiting, so switched traffic cannot select a retired target. */
  handle(request: Request): Promise<Response> {
    const target = this.target;
    if (target === undefined)
      return Promise.resolve(
        new Response(JSON.stringify({ error: "No active ZSys generation." }), {
          status: 503,
          headers: { "cache-control": "no-store", "content-type": "application/json" },
        }),
      );
    const lease = this.track?.(target.token);
    if (this.track !== undefined && lease === undefined) return Promise.resolve(drainResponse());
    try {
      return forwardProxyRequest(request, target, this.fetcher, lease).finally(() =>
        lease?.release(),
      );
    } catch (error) {
      lease?.release();
      return Promise.reject(error);
    }
  }

  stop(): Promise<void> {
    this.target = undefined;
    const server = this.server;
    this.server = undefined;
    if (server === undefined) return this.stopping ?? Promise.resolve();
    this.stopping = server.stop().finally(() => {
      this.stopping = undefined;
    });
    return this.stopping;
  }
}

export function createSupervisorProxy(options: SupervisorProxyOptions = {}): SupervisorProxy {
  return new SupervisorProxy(options);
}

function normalizeTarget(
  target: SupervisorProxyTarget,
  defaultHostname: string,
): ActiveSupervisorProxyTarget {
  validateSupervisorToken(target.token);
  const port = validatePort(target.port, false);
  const hostname = target.hostname ?? defaultHostname;
  validateHostname(hostname, "target hostname");
  return Object.freeze({
    token: Object.freeze({ ...target.token }),
    hostname,
    port,
  });
}

function sameToken(
  current: SupervisorCandidateToken | undefined,
  expected: SupervisorCandidateToken | undefined,
): boolean {
  return current === undefined
    ? expected === undefined
    : expected !== undefined &&
        current.sourceToken === expected.sourceToken &&
        current.generationToken === expected.generationToken;
}

function validatePort(port: number, allowZero: boolean): number {
  if (!Number.isSafeInteger(port) || port < (allowZero ? 0 : 1) || port > 65_535)
    throw new RangeError("Supervisor proxy ports must be between 1 and 65535.");
  return port;
}

function validateHostname(hostname: string, name: string): void {
  if (hostname.trim() === "" || /[\s/:]/.test(hostname))
    throw new TypeError(`Supervisor proxy ${name} must be a hostname.`);
}
