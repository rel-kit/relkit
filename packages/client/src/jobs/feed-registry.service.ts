import { Context, Effect, Exit, Layer, MutableRef, RcMap, Ref, Scope } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { runClient, runClientSync } from "../client-runtime.js";
import { SharedWatchFeed } from "./watch-feed.js";
import { WatchFeedKey } from "./watch-key.js";
import type {
  JobFeedRegistryService,
  WatchFeedBorrow,
  WatchFeedGroup,
} from "./feed-registry.types.js";
import type { JobWatchOptions } from "./types.js";

/** Reference-counted native observation ownership, independent of controller state. */
export class JobFeedRegistry extends Context.Service<JobFeedRegistry, JobFeedRegistryService>()(
  "@relkit/client/JobFeedRegistry",
) {}

/**
 * Provides reference-counted feed sharing within complete security/protocol keys.
 * @remarks The default zero idle TTL closes each entry after its final borrow.
 * Terminal invalidation removes lookup authority immediately while outstanding
 * borrows retain their old scope until they join cleanup.
 * @returns A scoped registry Layer whose finalization joins every retained native feed.
 * @example
 * ```ts
 * import { Effect, ManagedRuntime } from "effect";
 * import { runExecutionSync } from "@relkit/contracts/operation";
 * import { JobFeedRegistry, JobFeedRegistryLive } from "./feed-registry.service.js";
 * export async function borrowJobFeed(client: unknown): Promise<void> {
 *   const owner = ManagedRuntime.make(JobFeedRegistryLive);
 *   try {
 *     const registry = runExecutionSync(owner, JobFeedRegistry);
 *     const borrow = await owner.runPromise(registry.borrow(client, "job", { runId: "run" }));
 *     try { await borrow.feed.addLease("view", () => undefined); }
 *     finally { await Effect.runPromise(borrow.release); }
 *   } finally { await owner.dispose(); }
 * }
 * ```
 * @see tests/jobs/registry.test.ts for checked scoped native cleanup.
 */
export const JobFeedRegistryLive = Layer.effect(
  JobFeedRegistry,
  Effect.gen(function* () {
    const groups = new Map<string, WatchFeedGroup>();
    const feeds = yield* RcMap.make({
      lookup: (key: WatchFeedKey) =>
        Effect.acquireRelease(
          Effect.sync(() => {
            const feed: SharedWatchFeed<unknown> = new SharedWatchFeed(
              key.client,
              key.name,
              key.options,
              () => {
                if (groups.get(key.value)?.feed !== feed) return;
                groups.delete(key.value);
                runClientSync(RcMap.invalidate(feeds, key));
              },
            );
            return feed;
          }),
          (feed) => Effect.promise(() => feed.close()),
        ),
    });
    yield* Effect.addFinalizer(() => Effect.sync(() => groups.clear()));
    /** Registers a passive view over a synchronously acquired native group.
     * @param client - Borrowed transport identity.
     * @param name - Declared job identity.
     * @param options - Complete security and protocol authority.
     * @returns A view reference whose final release joins the physical feed. */
    const borrowView = (
      client: unknown,
      name: string,
      options: JobWatchOptions,
    ): WatchFeedBorrow => {
      const key = new WatchFeedKey(client, name, options);
      let group = groups.get(key.value);
      if (group === undefined) {
        const scope = Scope.makeUnsafe();
        const feed = runClientSync(
          RcMap.get(feeds, key).pipe(
            Effect.provideService(Scope.Scope, scope),
            Effect.catchCause((cause) =>
              Scope.close(scope, Exit.failCause(cause)).pipe(
                Effect.andThen(Effect.failCause(cause)),
              ),
            ),
          ),
        );
        group = { feed, scope, references: Ref.makeUnsafe(0) };
        groups.set(key.value, group);
      }
      const entry = group;
      MutableRef.update(entry.references.ref, (count) => count + 1);
      let retired = false;
      let closing: Promise<void> | undefined;
      const retireView = (): void => {
        if (retired) return;
        retired = true;
        MutableRef.update(entry.references.ref, (count) => count - 1);
        if (Ref.getUnsafe(entry.references) !== 0 || groups.get(key.value) !== entry) return;
        groups.delete(key.value);
        runClientSync(RcMap.invalidate(feeds, key));
      };
      const releaseView = (): Promise<void> => {
        retireView();
        return (closing ??=
          Ref.getUnsafe(entry.references) === 0
            ? runClient(Scope.close(entry.scope, Exit.void))
            : Promise.resolve());
      };
      return {
        feed: entry.feed,
        retireView,
        releaseView,
        retire: Effect.sync(retireView),
        release: Effect.promise(releaseView),
      };
    };
    return JobFeedRegistry.of({
      borrowView,
      /** Acquires an explicitly releasable borrow, including partial lookup cleanup.
       * @param client - Borrowed generated transport identity.
       * @param name - Declared job name.
       * @param options - Complete request, scope, cursor and retry key authority.
       * @returns The shared feed and once-only joined release Effect. */
      borrow: Effect.fn("JobFeedRegistry.borrow")(
        (client: unknown, name: string, options: JobWatchOptions) =>
          observeExecution(
            "client",
            "jobs.feed.borrow",
            Effect.sync(() => borrowView(client, name, options)),
          ),
      ),
    });
  }),
);
