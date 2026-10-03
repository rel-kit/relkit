import { isIndex, isCheckpoint } from "./store-validation.js";
import type {
  JobStoreBoundary,
  JobStoreOptions,
  JobRecordInput,
  JobRecord,
  JobIndexEntry,
  JobStoreIndex,
  JobStoreCheckpoint,
  JobStoreSnapshot,
  JobStore,
  JobStoreEffects,
} from "./store.types.js";
import { Clock, Context, Effect, Layer, Ref, Semaphore } from "effect";
import {
  localOperation,
  localPromise,
  localSync,
  runLocal,
  runLocalSync,
} from "../local-effect.js";
import { canonicalJson } from "@relkit/contracts";
import {
  createJobStorePaths,
  ensureJobRoot,
  makeMetadata,
  parseJobRecord,
  readJobMetadata,
  recoverJobRecords,
  writeJobMetadata,
  appendDurably,
  STORE_VERSION,
} from "./store-files.js";

export type {
  JobStoreBoundary,
  JobStoreOptions,
  JobRecordInput,
  JobRecord,
  JobIndexEntry,
  JobStoreIndex,
  JobStoreCheckpoint,
  JobStoreSnapshot,
  JobStore,
  JobStoreEffects,
} from "./store.types.js";

export { STORE_VERSION } from "./store-files.js";

/** Preserves the public job store state error identity and stable error code. */
export class JobStoreStateError extends Error {
  readonly code = "RELKIT_JOB_STORE_STATE_INVALID" as const;

  constructor(message: string) {
    super(message);
    this.name = "JobStoreStateError";
  }
}

/** A durable journal whose serialization and lifecycle have one owner. */
export class LocalJobStoreService extends Context.Service<LocalJobStoreService, JobStoreEffects>()(
  "@relkit/providers-local/JobStore",
) {}

/**
 * Opens the journal through the established Promise interface.
 * @param requestedRoot - Owned journal directory.
 * @param options - Clock, validation and durable-boundary hooks.
 * @returns A store preserving append acknowledgement and synchronous snapshots.
 */
export async function createJobStore(
  requestedRoot: string,
  options: JobStoreOptions = {},
): Promise<JobStore> {
  const store = await runLocal(makeJobStore(requestedRoot, options));
  return Object.freeze({
    root: store.root,
    paths: store.paths,
    append: (input: JobRecordInput) => runLocal(store.append(input)),
    snapshot: () => runLocalSync(store.snapshot()),
    close: () => runLocal(store.close()),
  });
}

/**
 * Supplies and closes a durable journal through a scope-owned layer.
 * @param root - Owned journal directory.
 * @param options - Durable boundary configuration.
 * @returns A substitutable scoped journal layer.
 * @example
 * ```ts
 * import { Effect } from "effect";
 * import { LocalJobStoreService, jobStoreLayer } from "./store.js";
 *
 * const program = Effect.gen(function* () {
 *   const journal = yield* LocalJobStoreService;
 *     return yield* journal.snapshot();
 * });
 * await Effect.runPromise(program.pipe(Effect.provide(jobStoreLayer("/tmp/example-journal"))));
 * ```
 */
export function jobStoreLayer(root: string, options: JobStoreOptions = {}) {
  return Layer.effect(
    LocalJobStoreService,
    Effect.acquireRelease(makeJobStore(root, options), (store) => store.close()),
  );
}

/**
 * Recovers a journal before exposing serialized append operations.
 * @param requestedRoot - Owned journal directory.
 * @param options - Clock, semantic decoder and fault-injection hooks.
 * @returns A lazy acquisition effect yielding the owning service.
 * @remarks Each append commits record, index and checkpoint before acknowledgement.
 */
export const makeJobStore = Effect.fn("JobStore.open")(
  function* (requestedRoot: string, options: JobStoreOptions = {}) {
    const root = yield* localSync(() => ensureJobRoot(requestedRoot));
    const paths = createJobStorePaths(root);
    const records = yield* localPromise(() =>
      recoverJobRecords(paths.records, root, options.validateData),
    );
    const current = makeMetadata(records);
    const storedIndex = yield* localPromise(() => readJobMetadata(paths.index, root, isIndex));
    const storedCheckpoint = yield* localPromise(() =>
      readJobMetadata(paths.checkpoint, root, isCheckpoint),
    );
    if (
      storedIndex === undefined ||
      storedCheckpoint === undefined ||
      canonicalJson(storedIndex) !== canonicalJson(current.index) ||
      canonicalJson(storedCheckpoint) !== canonicalJson(current.checkpoint)
    ) {
      yield* localPromise(() =>
        writeJobMetadata(paths.index, paths.checkpoint, current.index, current.checkpoint),
      );
    }
    const state = yield* Ref.make(makeSnapshot(records, current));
    const closing = yield* Ref.make(false);
    const lock = yield* Semaphore.make(1);
    /**
     * Validates and appends a journal record before acknowledging its durable commit.
     * @param input - Caller operation input.
     * @returns The accepted immutable journal record.
     */
    const append = Effect.fn("JobStore.append")(
      function* (input: JobRecordInput) {
        if (yield* Ref.get(closing))
          return yield* localSync(() => {
            throw new JobStoreStateError("Job store is closed");
          });
        return yield* lock.withPermits(1)(
          Effect.gen(function* () {
            const snapshot = yield* Ref.get(state);
            const now = options.now?.() ?? (yield* Clock.currentTimeMillis);
            const record = yield* localSync(() =>
              makeRecord(input, snapshot.checkpoint.sequence + 1, () => now),
            );
            // Once a record is appended, finish the existing durable acknowledgement sequence.
            return yield* Effect.gen(function* () {
              yield* localPromise(() => appendDurably(paths.records, `${canonicalJson(record)}\n`));
              yield* localPromise(async () => {
                await options.onBoundary?.("record-fsynced");
              });
              const nextRecords = [...snapshot.records, record];
              const next = makeMetadata(nextRecords);
              yield* Ref.set(state, makeSnapshot(nextRecords, next));
              yield* localPromise(() =>
                writeJobMetadata(
                  paths.index,
                  paths.checkpoint,
                  next.index,
                  next.checkpoint,
                  async () => options.onBoundary?.("index-committed"),
                  async () => options.onBoundary?.("checkpoint-committed"),
                ),
              );
              return record;
            }).pipe(Effect.uninterruptible);
          }),
        );
      },
      (effect) => localOperation("JobStore.append", effect),
    );
    /**
     * Stops new admission and joins the owner resource finalization boundary.
     * @returns The close operation completing after its owned durable work has settled.
     */
    const close = Effect.fn("JobStore.close")(
      function* () {
        yield* Ref.set(closing, true);
        yield* lock.withPermits(1)(Effect.void);
      },
      (effect) => localOperation("JobStore.close", effect),
    );
    return LocalJobStoreService.of({
      root,
      paths,
      append,
      close,
      snapshot: () => localOperation("JobStore.snapshot", Ref.get(state)),
    });
  },
  (effect) => localOperation("JobStore.open", effect),
);

/** Builds the versioned audit record with prior/next state and a bounded rejection code.
 * @param input - Caller-provided domain input.
 * @param sequence - Monotonic durable record position.
 * @param now - Current clock time in milliseconds.
 * @returns The validated immutable durable or audit record.
 */
function makeRecord(
  input: JobRecordInput,
  sequence: number,
  now: (() => number) | undefined,
): JobRecord {
  const timestamp = input.timestamp ?? now?.() ?? Date.now();
  if (!Number.isSafeInteger(timestamp) || timestamp < 0) {
    throw new JobStoreStateError("Job record timestamp is invalid");
  }
  return parseJobRecord({
    version: STORE_VERSION,
    sequence,
    instanceId: input.instanceId,
    kind: input.kind,
    timestamp,
    data: JSON.parse(canonicalJson(input.data)),
  });
}

/** Copies records and recovered metadata into an immutable journal snapshot.
 * @param records - Ordered retained durable records.
 * @param current - Current persisted or projected state.
 * @returns The immutable state snapshot.
 */
function makeSnapshot(
  records: readonly JobRecord[],
  current: ReturnType<typeof makeMetadata>,
): JobStoreSnapshot {
  return Object.freeze({
    records: Object.freeze([...records]),
    index: current.index,
    checkpoint: current.checkpoint,
  });
}
