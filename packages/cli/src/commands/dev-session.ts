/** Owns development session state and its public synchronous/Promise facade over scoped native operations. */
import { resolve } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { Deferred, Effect, Layer, MutableRef, Ref } from "effect";
import type { RuntimeActivationFingerprint } from "@relkit/contracts";
import type { StartedCandidate, SupervisorCandidateToken } from "@relkit/supervisor";
import { runCliEffect } from "../cli-runtime.js";
import { createDevLogger } from "./dev-logger.js";
import type { DevOptions, DevLog } from "./dev.types.js";
import type { DevSessionEngine, DevSessionState } from "./dev-session.types.js";
import { createDevNativeSession } from "./dev-session-native.js";
import { ManualDevSessionOwner, ManualSessionEngine } from "./dev-session-owner.js";
/** Public Promise/synchronous facade over one native session owner. */
export class DevSession {
  readonly projectRoot: string;
  readonly options: DevOptions;
  readonly inspectionIdentity: { readonly sessionId: string; readonly token: string } | undefined;
  readonly abortController = new AbortController();
  readonly state = Ref.makeUnsafe<DevSessionState>({
    latestVersion: -1,
    started: false,
    stopping: false,
    active: undefined,
    fingerprint: undefined,
    inspector: undefined,
    signals: undefined,
    fingerprints: new Map(),
    drains: new Map(),
    controllers: new Set(),
    pending: [],
  });
  readonly log: DevLog;
  readonly observability;
  readonly stateMachine;
  readonly proxy;
  private engine: DevSessionEngine | undefined;
  private readonly owner: ManualDevSessionOwner<this>;
  /** Creates the synchronous public facade over an explicitly acquired session engine.
   * @param options - Explicit project, compiler, logging and lifetime policy.
   */
  constructor(options: DevOptions) {
    this.options = options;
    this.inspectionIdentity =
      (options.inspector && {
        sessionId: randomUUID(),
        token: randomBytes(32).toString("base64url"),
      }) ||
      undefined;
    this.projectRoot = resolve(options.projectRoot ?? process.cwd());
    this.log = createDevLogger(options);
    const native = createDevNativeSession(options, this.state, this.log);
    this.observability = native.observability;
    this.stateMachine = native.stateMachine;
    this.proxy = native.proxy;
    this.owner = new ManualDevSessionOwner(this);
  }
  /** Reads the stable proxy's current listening port. */
  get backendPort(): number {
    return this.proxy.port;
  }
  /** Reads the session-owned inspector's current listening port. */
  get inspectorPort(): number | undefined {
    const endpoint = Ref.getUnsafe(this.state).inspector?.descriptor.endpoint;
    return endpoint === undefined ? undefined : Number(new URL(endpoint).port);
  }
  /** Reads the stable proxy's published target. */
  get activeTarget() {
    return this.proxy.activeTarget;
  }
  /** Reads the captured engine, rejecting use before acquisition. */
  get nativeEngine(): DevSessionEngine {
    if (!this.engine) throw new Error("Development session has not been acquired.");
    return this.engine;
  }
  /** Captures the acquired engine for the public compatibility facade. @param engine - Scoped operations. */
  attach(engine: DevSessionEngine): void {
    this.engine = engine;
    this.owner.attach(engine);
  }
  /**
   * Acquires the manual public owner once; concurrent callers share startup.
   * @returns This session after the initial candidate becomes active.
   */
  start(): Promise<this> {
    return this.owner.start();
  }
  /** Joins one requested source activation through the captured engine.
   * @param version - Source version, defaulting to the next version.
   * @param files - Changed paths.
   * @returns Joined activation acceptance.
   */
  activate(version?: number, files: readonly string[] = []): Promise<boolean> {
    if (this.isStopping) return Promise.resolve(false);
    return this.owner.run(ManualSessionEngine.use((engine) => engine.activate(version, files)));
  }
  /** Forwards an explicit source version to the serialized activation owner.
   * @param version - Source version.
   * @param files - Changed paths.
   * @returns Joined activation acceptance.
   */
  notifySourceChange(version: number, files: readonly string[] = []): Promise<boolean> {
    return this.activate(version, files);
  }
  /** Joins the captured session's shared shutdown completion.
   * @returns Completion after all session cleanup has joined.
   */
  waitForShutdown(): Promise<void> {
    return this.engine
      ? runCliEffect(this.engine.wait, Layer.empty)
      : this.owner.run(ManualSessionEngine.use((engine) => engine.wait));
  }
  /** Closes the manual public owner and joins its shared release.
   * @param reason - Shutdown cause.
   * @returns The shared, joined manual release.
   */
  stop<Reason>(reason: Reason | Error = new Error("Development session stopped.")): Promise<void> {
    return this.owner.stop(reason);
  }
  /** Reads the last accepted backend generation. */
  get active() {
    return Ref.getUnsafe(this.state).active;
  }
  /** Publishes the retained synchronous backend generation assignment.
   * @param active - Existing synchronous compatibility assignment.
   */
  set active(active: StartedCandidate | undefined) {
    MutableRef.update(this.state.ref, (state) => ({ ...state, active }));
  }
  /** Reads the currently published activation identity. */
  get activeActivationFingerprint() {
    return Ref.getUnsafe(this.state).fingerprint;
  }
  /** Publishes the retained synchronous activation identity assignment.
   * @param fingerprint - Existing synchronous compatibility assignment.
   */
  set activeActivationFingerprint(fingerprint: RuntimeActivationFingerprint | undefined) {
    MutableRef.update(this.state.ref, (state) => ({ ...state, fingerprint }));
  }
  /** Reads whether session shutdown has closed admission. */
  get isStopping(): boolean {
    return Ref.getUnsafe(this.state).stopping;
  }
  /** Reads private server-side connection metadata after bridge acquisition. */
  get inspectionConnection() {
    return Ref.getUnsafe(this.state).inspector;
  }
  /** Reads the currently owned generation drain entries. */
  get drains() {
    return Ref.getUnsafe(this.state).drains;
  }
  /** Reads the currently owned candidate cancellation controllers. */
  get controllers() {
    return Ref.getUnsafe(this.state).controllers;
  }
  /** Reads the session-local generation identities retained by active owners. */
  get fingerprints() {
    return Ref.getUnsafe(this.state).fingerprints;
  }
  /** Joins a retired generation's drain through the captured engine.
   * @param previous - Old generation.
   * @param active - Active SDK token.
   * @returns Joined native drain.
   */
  drain(previous: StartedCandidate, active: SupervisorCandidateToken): Promise<void> {
    return this.owner.run(ManualSessionEngine.use((engine) => engine.drain(previous, active)));
  }
  /** Completes the retained synchronous compatibility shutdown latch. */
  resolveShutdownPromise(): void {
    this.engine?.finish();
  }
  /** Joins the activation requests currently admitted by this session. */
  get pendingActivations(): Promise<boolean> {
    return this.owner.run(
      Effect.forEach(
        Ref.getUnsafe(this.state).pending,
        (request) => Effect.exit(Deferred.await(request.result)),
        { concurrency: "unbounded" },
      ).pipe(Effect.as(true)),
    );
  }
  /** Closes the captured signal registration and its synchronous facade. */
  clearSignals(): void {
    Ref.getUnsafe(this.state).signals?.();
    MutableRef.update(this.state.ref, (state) => ({ ...state, signals: undefined }));
  }
  /** Closes synchronous startup and activation admission. */
  markStopping(): void {
    MutableRef.update(this.state.ref, (state) => ({ ...state, stopping: true }));
  }
  /**
   * Executes the retained synchronous watcher edge.
   * @typeParam A - Result.
   * @typeParam E - Failure.
   * @param effect - Captured native work.
   * @returns Its synchronous result.
   */
  runSynchronous<A, E>(effect: Effect.Effect<A, E>): A {
    return this.owner.runSync(effect);
  }
}
