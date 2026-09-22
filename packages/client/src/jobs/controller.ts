import type { RunSnapshot } from "@relkit/contracts/jobs";
import {
  JobWatchAbortedError,
  JobWatchDisposedError,
  type JobWatchController,
  type JobWatchListener,
  type JobWatchOptions,
  type JobWatchState,
} from "./types.js";
import {
  releaseSharedWatchFeed,
  sharedWatchFeed,
  type FeedEvent,
  type SharedWatchFeed,
} from "./watch.js";
import { freeze, notify, reconnectAfterTeardown, resumedOptions } from "./controller-support.js";
import type { JobRunFor } from "./job-registry-derived.js";
import { stateFromFeedEvent } from "./controller-state.js";
let nextControllerId = 1;
export class JobRunWatchController<Run = RunSnapshot> implements JobWatchController<Run> {
  private readonly id = `watch-${nextControllerId++}`;
  private readonly listeners = new Set<JobWatchListener<Run>>();
  private state: JobWatchState<Run> = freeze({ connection: "idle", isStale: false });
  private feed: SharedWatchFeed<Run> | undefined;
  private leaseId: string | undefined;
  private connectPromise: Promise<void> | undefined;
  private refetchAbort: AbortController | undefined;
  private activeOptions: JobWatchOptions | undefined;
  private epoch = 0;
  private manuallyDisconnected = false;
  private disposed = false;
  private disconnectPending: Promise<void> | undefined;
  constructor(
    private readonly client: unknown,
    private readonly name: string,
    private readonly options: JobWatchOptions,
  ) {}
  getSnapshot(): JobWatchState<Run> {
    return this.state;
  }
  subscribe(listener: JobWatchListener<Run>): () => void {
    this.listeners.add(listener);
    notify(listener, this.state);
    return () => this.listeners.delete(listener);
  }
  connect(): Promise<void> {
    this.assertLive();
    if (this.connectPromise !== undefined && !this.manuallyDisconnected) return this.connectPromise;
    const previous = this.connectPromise;
    this.manuallyDisconnected = false;
    const pending = reconnectAfterTeardown(previous, this.disconnectPending, () =>
      this.connectInternal(),
    );
    const shared = pending.finally(() => {
      if (this.connectPromise === shared) this.connectPromise = undefined;
    });
    this.connectPromise = shared;
    return shared;
  }
  async disconnect(): Promise<void> {
    if (this.disposed) return;
    if (this.disconnectPending !== undefined) return this.disconnectPending;
    this.manuallyDisconnected = true;
    this.epoch += 1;
    this.refetchAbort?.abort();
    this.setState({
      ...this.state,
      connection: "disconnected",
      isStale: false,
      connectionError: undefined,
    });
    const pending = this.releaseLease(new JobWatchAbortedError());
    this.disconnectPending = pending;
    await pending.finally(() => {
      if (this.disconnectPending === pending) this.disconnectPending = undefined;
    });
  }
  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.epoch += 1;
    this.refetchAbort?.abort();
    await this.releaseLease(new JobWatchAbortedError());
    this.setState({ connection: "disposed", isStale: false });
    this.listeners.clear();
  }
  async refetch(): Promise<void> {
    this.assertLive();
    this.refetchAbort?.abort();
    const controller = new AbortController();
    this.refetchAbort = controller;
    const previousConnection = this.state.connection;
    const temporary = this.feed === undefined;
    const feedOptions = this.activeOptions ?? resumedOptions(this.options, this.state);
    const feed = this.feed ?? sharedWatchFeed<Run>(this.client, this.name, feedOptions);
    try {
      const frame = await feed.refetch(controller.signal);
      if (frame === undefined || controller.signal.aborted || this.disposed) return;
      this.receive({ kind: "frame", frame }, this.epoch);
      if (this.manuallyDisconnected && previousConnection === "disconnected") {
        this.setState({ ...this.state, connection: "disconnected" });
      }
    } finally {
      if (temporary)
        releaseSharedWatchFeed(
          this.client,
          this.name,
          feedOptions,
          feed as SharedWatchFeed<unknown>,
        );
      if (this.refetchAbort === controller) this.refetchAbort = undefined;
    }
  }
  private async connectInternal(): Promise<void> {
    const requestedEpoch = this.epoch;
    if (
      this.state.connection === "connected" ||
      this.state.connection === "connecting" ||
      this.state.connection === "reconnecting"
    )
      return;
    if (this.state.connection === "completed") {
      await this.refetch();
      if (requestedEpoch !== this.epoch || this.disposed) return;
    }
    if (this.state.connection === "completed") return;
    if (requestedEpoch !== this.epoch || this.disposed) return;
    if (this.feed !== undefined) await this.releaseLease(new JobWatchAbortedError());
    if (requestedEpoch !== this.epoch || this.disposed) return;
    this.manuallyDisconnected = false;
    await this.startConnection();
  }
  private async startConnection(): Promise<void> {
    const epoch = ++this.epoch;
    this.manuallyDisconnected = false;
    this.setState({
      ...this.state,
      connection: "connecting",
      isStale: false,
      connectionError: undefined,
    });
    const options = resumedOptions(this.options, this.state);
    const feed = sharedWatchFeed<Run>(this.client, this.name, options);
    const leaseId = `${this.id}:${epoch}`;
    this.feed = feed;
    this.leaseId = leaseId;
    this.activeOptions = options;
    try {
      await feed.addLease(leaseId, (event) => this.receive(event, epoch));
    } catch (error) {
      if (epoch !== this.epoch || this.disposed || this.manuallyDisconnected) throw error;
      if (this.state.connection !== "unauthorized") {
        this.setState({
          ...this.state,
          connection: "error",
          isStale: false,
          connectionError: error,
        });
      }
      throw error;
    }
  }
  private receive(event: FeedEvent<Run>, epoch: number): void {
    if (epoch !== this.epoch || this.disposed) return;
    this.setState(stateFromFeedEvent(this.state, event, this.options.source));
  }
  private async releaseLease(error: unknown): Promise<void> {
    const feed = this.feed;
    const leaseId = this.leaseId;
    this.feed = undefined;
    this.leaseId = undefined;
    const options = this.activeOptions ?? this.options;
    this.activeOptions = undefined;
    if (feed === undefined || leaseId === undefined) return;
    await feed.removeLease(leaseId, error);
    releaseSharedWatchFeed(this.client, this.name, options, feed as SharedWatchFeed<unknown>);
  }
  private setState(value: JobWatchState<Run>): void {
    this.state = freeze(value);
    for (const listener of this.listeners) notify(listener, this.state);
  }
  private assertLive(): void {
    if (this.disposed) throw new JobWatchDisposedError();
  }
}
export function watchJobRun<Name extends string>(
  client: unknown,
  name: Name,
  options: JobWatchOptions,
): JobWatchController<JobRunFor<Name>> {
  return new JobRunWatchController(client, name, options) as JobWatchController<JobRunFor<Name>>;
}
