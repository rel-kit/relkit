import type { RunSnapshot } from "@relkit/contracts/jobs";
import { Layer, ManagedRuntime } from "effect";
import { runExecutionSync } from "@relkit/contracts/operation";
import { reconnectAfterTeardown } from "./controller-support.js";
import { JobControllers, JobControllersLive } from "./controller.service.js";
import { JobFeedRegistryDefault } from "./watch.js";
import type { JobRunFor } from "./job-registry-derived.types.js";
import type {
  JobWatchController,
  JobWatchListener,
  JobWatchOptions,
  JobWatchState,
} from "./types.js";

const factoryOwner = ManagedRuntime.make(
  JobControllersLive.pipe(Layer.provide(JobFeedRegistryDefault)),
);
const factory = runExecutionSync(factoryOwner, JobControllers);

/**
 * Passive synchronous external-store facade over scoped physical feed services.
 * @typeParam Run - Observed job run payload retained in external-store snapshots.
 */
export class JobRunWatchController<Run = RunSnapshot> implements JobWatchController<Run> {
  private readonly service;
  private connecting: Promise<void> | undefined;
  private disconnecting: Promise<void> | undefined;
  private closing: Promise<void> | undefined;

  /**
   * Acquires controller state once; native observation begins only at connect.
   * @param client - Borrowed generated client.
   * @param name - Declared job identity.
   * @param options - Full identity scope and observation policy.
   * @returns An idle passive external-store view with no native requests.
   */
  constructor(client: unknown, name: string, options: JobWatchOptions) {
    this.service = factory.view(client, name, options);
  }

  /** @returns The existing frozen external-store snapshot synchronously. */
  getSnapshot(): JobWatchState<Run> {
    return this.service.snapshot() as JobWatchState<Run>;
  }

  /**
   * Borrows controller state publication without acquiring native work.
   * @param listener - Isolated external-store callback.
   * @returns Idempotent synchronous unsubscribe.
   */
  subscribe(listener: JobWatchListener<Run>): () => void {
    return this.service.subscribe(listener as JobWatchListener<unknown>);
  }

  /** @returns The same first-snapshot Promise for concurrent connect calls. */
  connect(): Promise<void> {
    this.service.assertLive();
    if (this.connecting !== undefined && !this.service.isDisconnected()) return this.connecting;
    const pending = reconnectAfterTeardown(this.connecting, this.disconnecting, async () => {
      await this.service.connect();
    });
    const shared = pending.finally(() => {
      if (this.connecting === shared) this.connecting = undefined;
    });
    this.connecting = shared;
    return shared;
  }

  /** @returns Joined lease cleanup without retiring the reusable controller. */
  disconnect(): Promise<void> {
    if (this.closing !== undefined) return Promise.resolve();
    if (this.disconnecting !== undefined) return this.disconnecting;
    const pending = this.service.disconnect();
    const joined = pending.finally(() => {
      if (this.disconnecting === joined) this.disconnecting = undefined;
    });
    this.disconnecting = joined;
    return joined;
  }

  /** @returns Joined final owner cleanup, including pending native observation. */
  dispose(): Promise<void> {
    if (this.closing !== undefined) return this.closing;
    return (this.closing = this.service.dispose());
  }

  /** @returns One authoritative read without resuming a manually disconnected watch. */
  refetch(): Promise<void> {
    this.service.assertLive();
    return this.service.refetch();
  }
}

/**
 * Creates an idle, independently disposable external-store watch owner.
 * @typeParam Name - Declared job name.
 * @param client - Generated client.
 * @param name - Declared job.
 * @param options - Full request authority and observation policy.
 * @returns A synchronous public controller with existing inferred run payload.
 */
export function watchJobRun<Name extends string>(
  client: unknown,
  name: Name,
  options: JobWatchOptions,
): JobWatchController<JobRunFor<Name>> {
  return new JobRunWatchController(client, name, options) as JobWatchController<JobRunFor<Name>>;
}
