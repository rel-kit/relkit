import { resolve } from "node:path";
import type { RuntimeActivationFingerprint } from "@relkit/contracts";
import {
  createSupervisorObservability,
  createSupervisorProxy,
  createSupervisorStateMachine,
  type StartedCandidate,
  type SupervisorCandidateToken,
  type SupervisorGenerationDrain,
} from "@relkit/supervisor";
import { startInspector, type DevInspector } from "./dev-process.js";
import type { DevLog, DevOptions } from "./dev.js";
import { activateCandidate, drainCandidate } from "./dev-activation.js";
import { createDevLogger } from "./dev-logger.js";
import { installDevSignals } from "./dev-signals.js";
import { shutdownDev } from "./dev-shutdown.js";
import { logDevReady } from "./dev-ready.js";
import { assertPortAvailable } from "./port-availability.js";

/** Owns the stable development proxy and every child generation it starts. */
export class DevSession {
  readonly stateMachine;
  readonly proxy;
  readonly projectRoot: string;
  readonly options: DevOptions;
  readonly abortController = new AbortController();
  readonly fingerprints = new Map<number, RuntimeActivationFingerprint>();
  readonly drains = new Map<string, SupervisorGenerationDrain>();
  readonly controllers = new Set<AbortController>();
  readonly log: DevLog;
  readonly observability;
  private readonly shutdownPromise: Promise<void>;
  private resolveShutdown!: () => void;
  private activationTail: Promise<boolean> = Promise.resolve(true);
  private activeCandidate: StartedCandidate | undefined;
  private activeFingerprint: RuntimeActivationFingerprint | undefined;
  private inspector: DevInspector | undefined;
  private removeSignals: (() => void) | undefined;
  private latestVersion = -1;
  private stopPromise: Promise<void> | undefined;
  private started = false;
  private stopping = false;

  constructor(options: DevOptions) {
    this.options = options;
    this.projectRoot = resolve(options.projectRoot ?? process.cwd());
    this.log = createDevLogger(options);
    this.observability = createSupervisorObservability({
      ...(options.observability ?? {}),
      activationFingerprint: (token) =>
        this.fingerprints.get(token.generationToken) ?? this.activeFingerprint,
    });
    this.stateMachine = createSupervisorStateMachine({
      onTelemetry: (event) => {
        this.observability.emit(event);
        this.log({
          level: event.type === "outcome" && event.outcome.endsWith("failed") ? "error" : "info",
          event: `supervisor.${event.type}`,
          fields: {
            phase: event.type === "outcome" ? event.phase : event.from,
            state: event.type === "transition" ? event.to : event.outcome,
            sourceToken: event.sourceToken,
            generationToken: event.generationToken,
          },
        });
      },
    });
    this.proxy = createSupervisorProxy({
      ...(options.hostname === undefined ? {} : { hostname: options.hostname }),
      ...(options.stablePort === undefined ? {} : { port: options.stablePort }),
      track: (token) =>
        this.drains.get(`${token.sourceToken}:${token.generationToken}`)?.track(token),
    });
    this.shutdownPromise = new Promise((resolveShutdown) => {
      this.resolveShutdown = resolveShutdown;
    });
  }

  get backendPort(): number {
    return this.proxy.port;
  }
  get inspectorPort(): number | undefined {
    return this.inspector?.port;
  }
  get activeTarget() {
    return this.proxy.activeTarget;
  }

  async start(): Promise<this> {
    if (this.started) return this;
    if (this.options.signal?.aborted)
      throw this.options.signal.reason ?? new Error("Development startup was aborted.");
    this.started = true;
    this.removeSignals = installDevSignals(this.options, this.log, (reason) => this.stop(reason));
    try {
      await assertPortAvailable(this.backendPort, this.options.hostname ?? "127.0.0.1", "--port");
      await this.proxy.listen();
      if (this.options.inspector !== undefined && this.options.inspector !== false) {
        this.inspector = await startInspector(
          this.options.inspector,
          this.backendPort,
          this.log,
          this.options.spawn,
        );
        void this.inspector.process.exited.then((exitCode) => {
          if (!this.stopping) void this.stop(new Error(`Inspector exited with code ${exitCode}.`));
        });
      }
      if (!(await this.activate(0)))
        throw this.options.signal?.reason ?? new Error("Initial development candidate failed.");
      logDevReady(
        this.log,
        this.options.hostname ?? "127.0.0.1",
        this.backendPort,
        this.inspectorPort,
      );
      return this;
    } catch (error) {
      await this.stop(error);
      throw error;
    }
  }

  /** Queues one source version; newer versions obsolete queued work. */
  activate(
    version = this.latestVersion + 1,
    changedFiles: readonly string[] = [],
  ): Promise<boolean> {
    if (version < this.latestVersion) return Promise.resolve(false);
    this.latestVersion = version;
    for (const controller of this.controllers)
      controller.abort(new Error("A newer source version superseded this candidate."));
    const task = this.activationTail.then(
      () =>
        this.stopping || version !== this.latestVersion
          ? false
          : activateCandidate(this, version, changedFiles),
      () => false,
    );
    this.activationTail = task.catch(() => false);
    return task;
  }

  notifySourceChange(version: number, changedFiles: readonly string[] = []): Promise<boolean> {
    return this.activate(version, changedFiles);
  }

  waitForShutdown(): Promise<void> {
    return this.shutdownPromise;
  }

  stop(reason: unknown = new Error("Development session stopped.")): Promise<void> {
    if (this.stopPromise !== undefined) return this.stopPromise;
    this.stopPromise = shutdownDev(this, reason);
    return this.stopPromise;
  }

  async drain(previous: StartedCandidate, activeToken: SupervisorCandidateToken): Promise<void> {
    await drainCandidate(this, previous, activeToken);
  }

  get active(): StartedCandidate | undefined {
    return this.activeCandidate;
  }

  set active(candidate: StartedCandidate | undefined) {
    this.activeCandidate = candidate;
  }

  get activeActivationFingerprint(): RuntimeActivationFingerprint | undefined {
    return this.activeFingerprint;
  }

  set activeActivationFingerprint(value: RuntimeActivationFingerprint | undefined) {
    this.activeFingerprint = value;
  }

  get isStopping(): boolean {
    return this.stopping;
  }

  markStopping(): void {
    this.stopping = true;
  }
  get pendingActivations(): Promise<boolean> {
    return this.activationTail;
  }

  get inspectorChild(): DevInspector | undefined {
    return this.inspector;
  }
  clearSignals(): void {
    this.removeSignals?.();
    this.removeSignals = undefined;
  }

  resolveShutdownPromise(): void {
    this.resolveShutdown();
  }
}
