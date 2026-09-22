import type { RunWatchFrame } from "@relkit/contracts/jobs";
import { authoritativeFrame, closeIterator } from "./reconcile.js";
import { isTerminalRun, type JobWatchOptions } from "./types.js";
import { deferred, withAfter, type Pending } from "./watch-feed-support.js";
import { runWatchFeed } from "./watch-feed-loop.js";
import { acceptWatchFrame, emptyWatchFeedState, type WatchFeedState } from "./watch-feed-state.js";
import type { FeedEvent, FeedObserver } from "./watch-feed-types.js";
import { refetchSharedWatchFeed } from "./watch-feed-refetch.js";
import {
  emitObservers,
  rejectObserverFirsts,
  releaseWatchFeedTerminal,
  resolveObserverFirsts,
} from "./watch-feed-observers.js";
export type { FeedEvent, FeedStatus } from "./watch-feed-types.js";

export class SharedWatchFeed<Run> {
  private readonly observers = new Map<
    string,
    { readonly observer: FeedObserver<Run>; readonly first: Pending }
  >();
  private runTask: Promise<void> | undefined;
  private teardownPending: Promise<void> | undefined;
  private abort: AbortController | undefined;
  private iterator: AsyncIterator<unknown> | undefined;
  private generation = 0;
  private failures = 0;
  private frameState: WatchFeedState<Run> = emptyWatchFeedState();

  constructor(
    private readonly client: unknown,
    private readonly name: string,
    private readonly options: JobWatchOptions,
    private readonly onEmpty: () => void = () => undefined,
  ) {}

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
    const closing =
      this.iterator === undefined
        ? Promise.resolve()
        : closeIterator(this.iterator).catch(() => undefined);
    const running = this.runTask?.catch(() => undefined) ?? Promise.resolve();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const teardown = Promise.race([
      Promise.all([closing, running]).then(() => undefined),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, 5_000);
      }),
    ]);
    this.teardownPending = teardown;
    try {
      await teardown;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      this.runTask = undefined;
      this.abort = undefined;
      this.iterator = undefined;
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

  async refetch(signal?: AbortSignal): Promise<RunWatchFrame<Run> | undefined> {
    return refetchSharedWatchFeed(
      this.client,
      this.name,
      this.options,
      this.frameState.lastCursor,
      signal,
    );
  }

  get hasLeases(): boolean {
    return this.observers.size > 0;
  }

  private ensureRunning(): void {
    if (
      this.teardownPending !== undefined ||
      this.runTask !== undefined ||
      this.observers.size === 0
    )
      return;
    this.failures = 0;
    const task = this.consume();
    const managed = task.finally(() => {
      if (this.runTask !== managed) return;
      this.runTask = undefined;
      this.abort = undefined;
      this.iterator = undefined;
    });
    this.runTask = managed;
    void managed.catch(() => undefined);
  }

  private async consume(): Promise<void> {
    const generation = ++this.generation;
    await runWatchFeed(this.loop(generation), generation);
  }

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
      setIterator: (iterator: AsyncIterator<unknown> | undefined): void => {
        if (generation === this.generation) this.iterator = iterator;
      },
      acceptFrame: (value: unknown): RunWatchFrame<Run> | undefined => this.acceptFrame(value),
      emit: (event: FeedEvent<Run>): void => this.emit(event),
      verifyTerminal: (
        frame: RunWatchFrame<Run>,
        signal: AbortSignal,
      ): Promise<boolean | undefined> => this.verifyTerminal(frame, signal),
      releaseTerminal: (): void => this.releaseTerminal(),
      resolveFirsts: (): void => resolveObserverFirsts(this.observers),
      rejectFirsts: (error: unknown): void => rejectObserverFirsts(this.observers, error),
      failureCount: (): number => this.failures,
      setFailureCount: (value: number): void => {
        this.failures = value;
      },
    };
  }

  private async verifyTerminal(
    frame: RunWatchFrame<Run>,
    signal: AbortSignal,
  ): Promise<boolean | undefined> {
    const verified = await authoritativeFrame(
      this.client,
      this.name,
      withAfter(this.options, frame.cursor),
      signal,
    );
    if (verified === undefined) return undefined;
    const accepted = this.acceptFrame(verified);
    if (accepted !== undefined) this.emit({ kind: "frame", frame: accepted });
    else if (isTerminalRun(verified.run))
      this.emit({ kind: "frame", frame: verified as RunWatchFrame<Run> });
    return isTerminalRun(verified.run);
  }

  private releaseTerminal(): void {
    this.generation += 1;
    releaseWatchFeedTerminal(this.observers, this.abort, this.onEmpty);
    this.abort = undefined;
    this.iterator = undefined;
    this.onEmpty();
  }

  private acceptFrame(value: unknown): RunWatchFrame<Run> | undefined {
    const accepted = acceptWatchFrame(this.frameState, value);
    this.frameState = accepted.state;
    return accepted.frame;
  }

  private emit(event: FeedEvent<Run>): void {
    emitObservers(this.observers, event);
  }
}
