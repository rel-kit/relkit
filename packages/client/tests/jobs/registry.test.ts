import { expect, it } from "@effect/vitest";
import { Effect, Layer, ManagedRuntime } from "effect";
import { runExecutionPromise, runExecutionSync } from "@relkit/contracts/operation";
import { JobFeedRegistry, JobFeedRegistryLive } from "../../src/jobs/feed-registry.service.js";
import { JobControllers, JobControllersLive } from "../../src/jobs/controller.service.js";
import { watchJobRun } from "../../src/jobs/controller.js";
import { frame } from "./quality-fixture.js";
import { JobWatchAbortedError } from "../../src/jobs/types.js";

it.effect("reentrant connecting publication cannot acquire after view retirement", () =>
  Effect.promise(async () => {
    for (const retiring of ["disconnect", "dispose"] as const) {
      let opened = 0;
      let closing: Promise<void> | undefined;
      const controller = watchJobRun(
        {
          jobs: {
            job: {
              runs: {
                watch: async () => {
                  opened++;
                  return { next: async () => ({ done: false, value: frame("running") }) };
                },
              },
            },
          },
        },
        "job",
        { runId: "run" },
      );
      const unsubscribe = controller.subscribe((state) => {
        if (state.connection === "connecting") closing = controller[retiring]();
      });
      try {
        expect(await controller.connect().catch((error) => error)).toBeInstanceOf(
          JobWatchAbortedError,
        );
        await closing;
        expect(opened).toBe(0);
        expect(controller.getSnapshot().connection).toBe(
          retiring === "dispose" ? "disposed" : "disconnected",
        );
      } finally {
        unsubscribe();
        await controller.dispose();
      }
    }
  }),
);

it.effect("a substituted registry preserves passive state and original lookup failure", () =>
  Effect.promise(async () => {
    const original = new Error("registry lookup");
    let lookups = 0;
    const failLookup = (): never => {
      lookups++;
      throw original;
    };
    const owner = ManagedRuntime.make(
      JobControllersLive.pipe(
        Layer.provide(
          Layer.succeed(
            JobFeedRegistry,
            JobFeedRegistry.of({
              borrowView: failLookup,
              borrow: Effect.fn("TestRegistry.borrow")(() => Effect.die(original)),
            }),
          ),
        ),
      ),
    );
    try {
      const factory = runExecutionSync(owner, JobControllers);
      const passive = factory.view({}, "job", { runId: "run" });
      try {
        expect(passive.snapshot().connection).toBe("idle");
        expect(lookups).toBe(0);
        expect(() => passive.connect()).toThrow(original);
        expect(lookups).toBe(1);
        expect(passive.snapshot().connection).toBe("connecting");
      } finally {
        await passive.dispose();
      }
    } finally {
      await owner.dispose();
    }
  }),
);

it.effect("complete-key groups isolate transports and identity while retaining other views", () =>
  Effect.promise(async () => {
    let opened = 0;
    let returned = 0;
    const makeClient = () => ({
      jobs: {
        job: {
          runs: {
            watch: async () => {
              opened++;
              const pending = Promise.withResolvers<IteratorResult<unknown>>();
              let emitted = false;
              return {
                next: async () =>
                  emitted
                    ? pending.promise
                    : ((emitted = true), { done: false, value: frame("running") }),
                return: async () => {
                  returned++;
                  pending.resolve({ done: true, value: undefined });
                  return { done: true, value: undefined };
                },
              };
            },
          },
        },
      },
    });
    const firstClient = makeClient();
    const controllers = [
      watchJobRun(firstClient, "job", { runId: "run", identityKey: "tenant-a" }),
      watchJobRun(firstClient, "job", { runId: "run", identityKey: "tenant-a" }),
      watchJobRun(firstClient, "job", { runId: "run", identityKey: "tenant-b" }),
      watchJobRun(makeClient(), "job", { runId: "run", identityKey: "tenant-a" }),
    ];
    try {
      const first = controllers[0]!.connect();
      expect(controllers[0]!.connect()).toBe(first);
      await Promise.all([first, ...controllers.slice(1).map((controller) => controller.connect())]);
      expect(opened).toBe(3);
      await controllers[0]!.dispose();
      expect(returned).toBe(0);
      expect(controllers[1]!.getSnapshot().connection).toBe("connected");
    } finally {
      await Promise.all(controllers.map((controller) => controller.dispose()));
    }
    expect(returned).toBe(3);
  }),
);

it.effect(
  "registry owner closure interrupts a borrowed native feed and settles pending observation",
  () =>
    Effect.promise(async () => {
      let returned = 0;
      const pending = Promise.withResolvers<IteratorResult<unknown>>();
      const started = Promise.withResolvers<void>();
      const client = {
        jobs: {
          job: {
            runs: {
              watch: async () => ({
                next: () => {
                  started.resolve();
                  return pending.promise;
                },
                return: async () => {
                  returned++;
                  pending.resolve({ done: true, value: undefined });
                  return { done: true, value: undefined };
                },
              }),
            },
          },
        },
      };
      const owner = ManagedRuntime.make(JobFeedRegistryLive.pipe(Layer.provide(Layer.empty)));
      try {
        const borrow = await runExecutionPromise(
          owner,
          Effect.flatMap(JobFeedRegistry, (registry) =>
            registry.borrow(client, "job", { runId: "run" }),
          ),
        );
        const first = borrow.feed.addLease("owned-view", () => undefined).catch((error) => error);
        await started.promise;
        await owner.dispose();
        expect(await first).toBeInstanceOf(Error);
        expect(returned).toBe(1);
        await Effect.runPromise(borrow.release);
        expect(returned).toBe(1);
      } finally {
        await owner.dispose();
      }
    }),
);
