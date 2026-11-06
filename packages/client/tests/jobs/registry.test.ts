import { expect, it } from "vitest";
import { createJobFeedRegistry } from "../../src/jobs/feed-registry.service.js";
import { createJobControllers } from "../../src/jobs/controller.service.js";
import { watchJobRun } from "../../src/jobs/controller.js";
import { frame } from "./quality-fixture.js";
import { JobWatchAbortedError } from "../../src/jobs/types.js";

it("reentrant connecting publication cannot acquire after view retirement", async () => {
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
});

it("a substituted registry preserves passive state and original lookup failure", async () => {
  const original = new Error("registry lookup");
  let lookups = 0;
  const failLookup = (): never => {
    lookups++;
    throw original;
  };
  const factory = createJobControllers({ borrowView: failLookup, close: async () => undefined });
  const passive = factory.view({}, "job", { runId: "run" });
  try {
    expect(passive.snapshot().connection).toBe("idle");
    expect(lookups).toBe(0);
    expect(() => passive.connect()).toThrow(original);
    expect(lookups).toBe(1);
    expect(passive.snapshot().connection).toBe("connecting");
    await expect(passive.refetch()).rejects.toBe(original);
    expect(lookups).toBe(2);
  } finally {
    await passive.dispose();
  }
});

it("complete-key groups isolate transports and identity while retaining other views", async () => {
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
});

it("registry closure aborts a borrowed native feed and settles pending observation", async () => {
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
  const registry = createJobFeedRegistry();
  try {
    const borrow = registry.borrowView(client, "job", { runId: "run" });
    const first = borrow.feed.addLease("owned-view", () => undefined).catch((error) => error);
    await started.promise;
    await registry.close();
    expect(await first).toBeInstanceOf(Error);
    expect(returned).toBe(1);
    await borrow.releaseView();
    expect(returned).toBe(1);
    expect(() => registry.borrowView(client, "job", { runId: "run" })).toThrow(
      JobWatchAbortedError,
    );
  } finally {
    await registry.close();
  }
});

it("a temporary refetch borrow keeps a shared feed restartable for a later view", async () => {
  let opened = 0;
  const read = Promise.withResolvers<unknown>();
  const client = {
    jobs: {
      job: {
        runs: {
          get: () => read.promise,
          watch: async () => {
            opened++;
            const held = Promise.withResolvers<IteratorResult<unknown>>();
            let emitted = false;
            return {
              next: async () =>
                emitted
                  ? held.promise
                  : ((emitted = true), { done: false, value: frame("running") }),
              return: async () => {
                held.resolve({ done: true, value: undefined });
                return { done: true, value: undefined };
              },
            };
          },
        },
      },
    },
  };
  const registry = createJobFeedRegistry();
  const factory = createJobControllers(registry);
  const first = factory.view(client, "job", { runId: "run" });
  const idle = factory.view(client, "job", { runId: "run" });
  const later = factory.view(client, "job", { runId: "run" });
  try {
    await first.connect();
    const refetch = idle.refetch();
    await first.disconnect();
    await later.connect();
    for (let tick = 0; tick < 100 && later.snapshot().connection !== "connected"; tick++)
      await new Promise((resolve) => setTimeout(resolve, 1));
    expect(later.snapshot().connection).toBe("connected");
    expect(opened).toBe(2);
    read.resolve(frame("running").run);
    await refetch;
  } finally {
    await Promise.all([first.dispose(), idle.dispose(), later.dispose()]);
    await registry.close();
  }
});

it("a superseded refetch rejects while the latest read publishes its frame", async () => {
  const reads: ReturnType<typeof Promise.withResolvers<unknown>>[] = [];
  const client = {
    jobs: {
      job: {
        runs: {
          get: () => {
            const read = Promise.withResolvers<unknown>();
            reads.push(read);
            return read.promise;
          },
        },
      },
    },
  };
  const registry = createJobFeedRegistry();
  const view = createJobControllers(registry).view(client, "job", { runId: "run" });
  try {
    const earlier = view.refetch().catch((error) => error);
    const latest = view.refetch();
    expect(await earlier).toBeInstanceOf(Error);
    reads.at(-1)!.resolve(frame("running").run);
    await latest;
    expect(view.snapshot()).toMatchObject({ connection: "connected", run: { status: "running" } });
  } finally {
    await view.dispose();
    await registry.close();
  }
  expect(() => view.refetch()).toThrow();
});

it("connect after a failure releases the failed lease and opens a new watch", async () => {
  let opened = 0;
  const down = new Error("down");
  const client = {
    jobs: {
      job: {
        runs: {
          watch: async () => {
            opened++;
            throw down;
          },
        },
      },
    },
  };
  const registry = createJobFeedRegistry();
  const view = createJobControllers(registry).view(client, "job", {
    runId: "run",
    maxReconnectAttempts: 1,
  });
  try {
    await expect(view.connect()).rejects.toBe(down);
    expect(view.snapshot()).toMatchObject({ connection: "error", connectionError: down });
    await expect(view.connect()).rejects.toBe(down);
    expect(opened).toBe(2);
  } finally {
    await view.dispose();
    await registry.close();
  }
});

it("connect after completion re-reads authoritative state without reopening a watch", async () => {
  let opened = 0;
  let reads = 0;
  const client = {
    jobs: {
      job: {
        runs: {
          get: async () => {
            reads++;
            return frame("completed").run;
          },
          watch: async () => {
            opened++;
            let emitted = false;
            return {
              next: async () =>
                emitted
                  ? { done: true, value: undefined }
                  : ((emitted = true), { done: false, value: frame("completed") }),
            };
          },
        },
      },
    },
  };
  const registry = createJobFeedRegistry();
  const view = createJobControllers(registry).view(client, "job", { runId: "run" });
  try {
    await view.connect();
    expect(view.snapshot().connection).toBe("completed");
    const before = reads;
    await view.connect();
    expect(reads).toBe(before + 1);
    expect(opened).toBe(1);
    expect(view.snapshot().connection).toBe("completed");
  } finally {
    await view.dispose();
    await registry.close();
  }
});
