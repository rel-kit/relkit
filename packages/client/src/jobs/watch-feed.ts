import type { RunWatchFrame } from "@relkit/contracts/jobs";
import { acquireClientOwner } from "../client-owner.js";
import { verifyWatchTerminal } from "./watch-feed-terminal.js";
import { isTerminalRun, JobWatchAbortedError, type JobWatchOptions } from "./types.js";
import { deferred, type Pending } from "./watch-feed-support.js";
import { JobObservation, JobObservationLive } from "./observation.service.js";
import { acceptWatchFrame, emptyWatchFeedState, type WatchFeedState } from "./watch-feed-state.js";
import type { FeedEvent, FeedObserver } from "./watch-feed.types.js";
import { refetchSharedWatchFeed } from "./watch-feed-refetch.js";
import { joinFeedTeardown } from "./watch-feed-teardown.js";
import {
  emitObservers,
  rejectObserverFirsts,
  releaseWatchFeedTerminal,
  resolveObserverFirsts,
} from "./watch-feed-observers.js";
export type { FeedEvent, FeedStatus } from "./watch-feed.types.js";

/**
 * Scoped physical native observation shared by independently retired view leases.
 * @typeParam Run - Application-specific run payload retained by authoritative frames.
 */
export class SharedWatchFeed<Run> {
  private readonly owner = acquireClientOwner(JobObservationLive, JobObservation);
  private readonly observation = this.owner.service;
  private readonly observers = new Map<
    string,
    { readonly observer: FeedObserver<Run>; readonly first: Pending }
  >();
  private runTask: Promise<void> | undefined;
  private teardownPending: Promise<void> | undefined;
  private abort: AbortController | undefined;
  private generation = 0;
  private failures = 0;
  private closing: Promise<void> | undefined;
  private frameState: WatchFeedState<Run> = emptyWatchFeedState();

  /**
   * Creates SharedWatchFeed with its existing public state and failure contract.
   * @param client - Borrowed generated procedure client.
   * @param name - Declared resource or selector identity.
   * @param options - Existing public configuration and authority.
   * @param onEmpty - Sharing-registry invalidation callback.
   * @returns An idle physical observation owner with no native requests.
   */
  constructor(
    private readonly client: unknown,
    private readonly name: string,
    private readonly options: JobWatchOptions,
    private readonly onEmpty: () => void = () => undefined,
  ) {}

  /**
   * Registers one observer and its first-snapshot Promise without duplicating shared native work.
   * @param id - Existing observer or item identity.
   * @param observer - Borrowed observer callback.
   * @returns A Promise for the existing result, preserving original rejected values.
   */
  addLease(id: string, observer: FeedObserver<Run>): Promise<void> {
    const first = deferred();
    this.observers.set(id, { observer, first });
    if (this.frameState.lastFrame !== undefined) {
      observer({ kind: "frame", frame: this.frameState.lastFrame });
      first.resolve();
      if (!isTerminalRun(this.frameState.lastFrame.run)) this.ensureRunning();
    } else {
      this.ensureRunning();
    }
    return first.promise;
  }

  /**
   * Releases one observer and joins bounded native teardown only for the final observer.
   * @param id - Existing observer or item identity.
   * @param error - Original public failure object.
   * @returns A Promise for the existing result, preserving original rejected values.
   */
  async removeLease(
    id: string,
    error: unknown = new Error("Job watch disconnected"),
  ): Promise<void> {
    const entry = this.observers.get(id);
    if (entry !== undefined) entry.first.reject(error);
    this.observers.delete(id);
    if (this.observers.size > 0) return;
    if (this.teardownPending !== undefined) return this.teardownPending;
    this.generation += 1;
    this.abort?.abort();
    const closing = this.owner.close();
    const running = this.runTask?.catch(() => undefined) ?? Promise.resolve();
    const teardown = joinFeedTeardown(closing, running);
    this.teardownPending = teardown;
    try {
      await teardown;
    } finally {
      this.runTask = undefined;
      this.abort = undefined;
      if (this.teardownPending === teardown) {
        this.teardownPending = undefined;
        if (
          this.observers.size > 0 &&
          (this.frameState.lastFrame === undefined || !isTerminalRun(this.frameState.lastFrame.run))
        ) {
          this.ensureRunning();
        }
      }
    }
  }

  /**
   * Reads authoritative evidence without changing observation lease ownership.
   * @param signal - Borrowed caller cancellation signal.
   * @returns A Promise for the existing result, preserving original rejected values.
   */
  async refetch(signal?: AbortSignal): Promise<RunWatchFrame<Run> | undefined> {
    return refetchSharedWatchFeed(
      this.client,
      this.name,
      this.options,
      this.frameState.lastCursor,
      signal,
    );
  }

  /** @returns Whether any passive view still borrows this physical observation. */
  get hasLeases(): boolean {
    return this.observers.size > 0;
  }

  /**
   * Closes the service owner after the sharing registry removes its final entry.
   * @returns Joined scoped cleanup; callers must first release every observer.
   */
  close(): Promise<void> {
    if (this.closing !== undefined) return this.closing;
    this.generation++;
    this.abort?.abort();
    rejectObserverFirsts(this.observers, new JobWatchAbortedError());
    this.observers.clear();
    return (this.closing = Promise.all([
      this.owner.close(),
      this.runTask?.catch(() => undefined) ?? Promise.resolve(),
    ]).then(() => undefined));
  }

  /**
   * Starts one supervised observation worker only when live observers require it.
   * @returns Nothing; the existing owned state or publication is updated.
   */
  private ensureRunning(): void {
    if (
      this.teardownPending !== undefined ||
      this.runTask !== undefined ||
      this.observers.size === 0
    )
      return;
    this.failures = 0;
    const generation = ++this.generation;
    const task = this.owner
      .run(this.observation.consume(this.loop(generation), generation))
      .catch(() => undefined);
    const managed = task.finally(() => {
      if (this.runTask !== managed) return;
      this.runTask = undefined;
      this.abort = undefined;
    });
    this.runTask = managed;
    void managed.catch(() => undefined);
  }

  /**
   * Projects the facade's observer and epoch authority into the owned observation workflow.
   * @param generation - Current owner epoch used to ignore retired workers.
   * @returns Callbacks binding this worker to the current observer and epoch authority.
   */
  private loop(generation: number) {
    return {
      client: this.client,
      name: this.name,
      options: this.options,
      isActive: (generation: number): boolean =>
        this.observers.size > 0 && generation === this.generation,
      lastCursor: (): string | undefined => this.frameState.lastCursor,
      setAbort: (controller: AbortController | undefined): void => {
        if (generation === this.generation) this.abort = controller;
      },
      setIterator: (): void => undefined,
      acceptFrame: (value: unknown): RunWatchFrame<Run> | undefined => this.acceptFrame(value),
      emit: (event: FeedEvent<Run>): void => this.emit(event),
      verifyTerminal: (
        frame: RunWatchFrame<Run>,
        signal: AbortSignal,
      ): Promise<boolean | undefined> =>
        verifyWatchTerminal(
          this.client,
          this.name,
          this.options,
          frame,
          signal,
          (value) => this.acceptFrame(value),
          (event) => this.emit(event),
        ),
      releaseTerminal: (): void => this.releaseTerminal(),
      resolveFirsts: (): void => resolveObserverFirsts(this.observers),
      rejectFirsts: (error: unknown): void => rejectObserverFirsts(this.observers, error),
      failureCount: (): number => this.failures,
      setFailureCount: (value: number): void => {
        this.failures = value;
      },
    };
  }

  /**
   * Retires terminal observer authority and invalidates the shared registry entry.
   * @returns Nothing; the existing owned state or publication is updated.
   */
  private releaseTerminal(): void {
    this.generation += 1;
    releaseWatchFeedTerminal(this.observers, this.abort, this.onEmpty);
    this.abort = undefined;
    this.onEmpty();
  }

  /**
   * Applies epoch, sequence and cursor duplicate rules to the cached observer snapshot.
   * @param value - Original input or payload; its identity is retained where required.
   * @returns The accepted frame, or undefined for a duplicate or retired epoch.
   */
  private acceptFrame(value: unknown): RunWatchFrame<Run> | undefined {
    const accepted = acceptWatchFrame(this.frameState, value);
    this.frameState = accepted.state;
    return accepted.frame;
  }

  /**
   * Publishes an observation without allowing one callback to fail another observer.
   * @param event - Canonical observation event.
   * @returns Nothing; the existing owned state or publication is updated.
   */
  private emit(event: FeedEvent<Run>): void {
    emitObservers(this.observers, event);
  }
}
