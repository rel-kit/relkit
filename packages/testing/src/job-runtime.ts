import { enqueueJob, jobWorkerControls } from "./job-runtime-controls.js";
import { admitOwnedWork, ownedLifecycle, runOwnedContext } from "./work-ownership.js";
import type { JobRuntimeState } from "./job-runtime.types.js";
import type { JobHarnessService } from "./job-harness.types.js";
import { Effect, Exit, Ref, Scope } from "effect";
import { join } from "node:path";
import { normalizeId, type JsonValue } from "@relkit/contracts";
import { observeExecution } from "@relkit/contracts/operation";
import { materializeJobs, type JobQueueHandle } from "@relkit/engine";
import { createJobClient, type JobClient, type JobProvider } from "@relkit/jobs/legacy";
import {
  createJobAdmin,
  createJobQueue,
  createJobStore,
  type JobAdmin,
  type JobQueue,
} from "@relkit/providers-local";
import type { InvocationRunner } from "@relkit/runtime-effect";
import { createDeterministicClock } from "./runtime-clock.js";
import { createTestStateRoot } from "./state-root.js";
import type { TestJobFake, TestJobOptions, TestJobCloseOptions } from "./jobs-types.js";
import {
  createFailures,
  createIdSource,
  createJobInvoker,
  createPlan,
  createRandom,
  defaultRetry,
} from "./jobs-utils.js";

/**
 * Acquires and composes the durable job owner's actual workflows.
 * @typeParam Input Input accepted by the native target schema.
 * @typeParam Output Output validated by the native target schema.
 * @param options Job declarations, retry bounds and deterministic native dependencies.
 * @returns Scoped harness workflows preserving the authoritative durable backend.
 */
export function createTestJobRuntime<Input = JsonValue, Output = unknown>(
  options: TestJobOptions<Input, Output>,
) {
  return Effect.gen(function* () {
    const jobId = normalizeId(options.jobId ?? options.target.id);
    const profile = normalizeId(options.profile ?? "default");
    const ownerId = normalizeId(options.ownerId ?? jobId);
    const retry = options.retry ?? defaultRetry;
    const deterministic = createDeterministicClock(options.startTimeMs ?? 0);
    const runner: InvocationRunner = {
      run: (effect, runOptions) => deterministic.run(effect, runOptions),
    };
    const failures = options.failures ?? createFailures();
    const random = createRandom(options.random, options.randomValues);
    const idSource = createIdSource();
    const plan = createPlan(jobId, options.target, retry, profile, options);
    // Register the worker scope before harness close: abort/join runs before fiber retirement.
    const scope = yield* Effect.acquireRelease(Scope.make(), (scope) =>
      Scope.close(scope, Exit.void),
    );
    const context = yield* Effect.context<never>();
    const owner = yield* Effect.acquireRelease(
      Effect.sync(() => createTestStateRoot(options.stateRoot)),
      (owner) => Effect.sync(() => owner.cleanup(true)),
    );
    const state = Ref.makeUnsafe<JobRuntimeState>({
      kind: "job",
      closed: false,
      controller: new AbortController(),
      pending: new Set<Promise<unknown>>(),
    });
    const current = Ref.getUnsafe(state);
    let generation = 0;
    let instanceSequence = 0;
    let store!: Awaited<ReturnType<typeof createJobStore>>;
    let queue!: JobQueue;
    let admin!: JobAdmin;
    let materialized!: Awaited<ReturnType<typeof materializeJobs>>;
    const invokeJob = createJobInvoker(
      options.target,
      failures,
      runner,
      idSource,
      deterministic.clock.currentTimeMs,
      options.env,
      options.clients,
      options.hooks,
      () => current.controller.signal,
    );

    /**
     * Bridges one native persistence/engine operation without owning its orchestration.
     * @typeParam A Native operation result.
     * @param work Lazily started native operation.
     * @returns Original native result or failure.
     */
    const native = <A>(work: () => Promise<A>) =>
      Effect.tryPromise({ try: work, catch: (cause) => cause });

    /**
     * Registers a complete Effect workflow with the acquired harness scope.
     * @typeParam A Domain workflow result.
     * @param work Ordered workflow containing actual decisions and native seams.
     * @returns An admitted effect whose real completion is joined by lifecycle changes.
     */
    const admitted = <A>(work: Effect.Effect<A, unknown>) =>
      admitOwnedWork(current, scope, context, work);

    const provider: JobProvider = {
      enqueue: (input, _request, callContext) =>
        runOwnedContext(
          context,
          observeExecution(
            "testing",
            "job.enqueue",
            admitted(
              enqueueJob(
                queue,
                {
                  input: input as JsonValue,
                  profile,
                  ...(callContext.propagation === undefined
                    ? {}
                    : { propagation: callContext.propagation }),
                },
                callContext.signal,
              ),
            ),
          ),
        ),
    };
    const client = createJobClient({
      ownerId,
      jobId,
      source: provider,
      inputSchema: options.target.input,
      profile,
    }) as JobClient<Input>;

    /**
     * Acquires the next native generation in dependency order and releases a failed prefix.
     * @returns Completion after store, queue and materialized worker are ready.
     */
    const open = Effect.fn("Testing.job.open")(function* () {
      const acquired = yield* native(() =>
        createJobStore(join(owner.path, "jobs", encodeURIComponent(jobId)), {
          now: deterministic.clock.currentTimeMs,
        }),
      );
      store = acquired;
      yield* Effect.gen(function* () {
        queue = createJobQueue(store, {
          now: deterministic.clock.currentTimeMs,
          ownerToken: `test-job-owner-${++generation}`,
          createInstanceId: () => `test-job-${jobId}-${++instanceSequence}`,
          ...(options.leaseDurationMs === undefined
            ? {}
            : { leaseDurationMs: options.leaseDurationMs }),
          ...(options.idempotency === undefined ? {} : { idempotency: options.idempotency }),
        });
        yield* native(() => queue.ready());
        admin = createJobAdmin(queue, {
          mode: "test",
          now: deterministic.clock.currentTimeMs,
          createActionId: () => `test-job-action-${jobId}-${generation}`,
        });
        const handle: JobQueueHandle = {
          ...queue,
          acquire: async (instanceId, leaseOptions) => {
            const leased = await queue.acquire(instanceId, leaseOptions);
            if (leased !== undefined) failures.check("job.after-lease");
            return leased;
          },
          transition: async (instanceId, nextState, transitionOptions) => {
            if (nextState === "completed") failures.check("job.after-handler-success-before-ack");
            return queue.transition(instanceId, nextState, transitionOptions);
          },
        };
        materialized = yield* native(() =>
          materializeJobs({
            plan,
            queues: new Map([[jobId, handle]]),
            engine: { invoke: (request) => invokeJob(request) },
            now: deterministic.clock.currentTimeMs,
            random,
            ...(options.consumerConcurrency === undefined
              ? {}
              : { consumerConcurrency: options.consumerConcurrency }),
          }),
        );
      }).pipe(
        Effect.onError(() => native(() => acquired.close()).pipe(Effect.exit, Effect.asVoid)),
      );
    });

    yield* Effect.acquireRelease(open(), () => native(() => store.close()).pipe(Effect.orDie));
    const lifecycle = ownedLifecycle(
      current,
      scope,
      context,
      Effect.suspend(() => native(() => store.close())),
      open(),
      (failed) => Effect.sync(() => owner.cleanup(failed)),
      "job.close",
    );
    const worker = jobWorkerControls({
      queue: () => queue,
      worker: () => materialized,
      jobId,
      now: deterministic.clock.currentTimeMs,
      isClosed: () => current.closed,
    });
    /**
     * Admits one complete worker workflow into the service's owned scope.
     * @param instanceId Optional explicit durable identity.
     * @returns The native result, retained independently of the waiting caller.
     */
    const runNext = (instanceId?: string) => admitted(worker.runNext(instanceId));
    const drain = admitted(worker.drain);
    const value = Object.freeze({
      ...client,
      id: jobId,
      client,
      provider,
      stateRoot: owner.path,
      clock: deterministic.clock,
      random,
      failures,
      get admin(): JobAdmin {
        return admin;
      },
      status: () => queue.counts(),
      get: (instanceId: string) => queue.get(instanceId),
      runNext: (id?: string) => runOwnedContext(context, runNext(id)),
      drain: () => runOwnedContext(context, drain),
      restart: () => runOwnedContext(context, lifecycle.restart),
      close: (closeOptions: TestJobCloseOptions = {}) =>
        runOwnedContext(context, lifecycle.close(closeOptions.failed === true)),
    }) as TestJobFake<Input, Output>;
    return {
      value: value as unknown as JobHarnessService["value"],
      runNext,
      drain,
      restart: lifecycle.restart,
      close: (closeOptions) => lifecycle.close(closeOptions?.failed === true),
    } satisfies JobHarnessService;
  });
}
