import { expect, test } from "bun:test";
import type { RunSnapshot, RunWatchFrame } from "@relkit/contracts/jobs";
import {
  JobWatchAbortedError,
  JobWatchReadTimeoutError,
  watchJobRun,
  watchJobStream,
} from "./src/jobs/index.ts";
import { JobStreamGapError, JobStreamOverflowError } from "./src/jobs/index.ts";

test("watch controllers stay idle until connect and share a first-snapshot promise", async () => {
  const stream = holdingIterator([frame("running", 1, "cursor-1")]);
  let watches = 0;
  const client = clientWith({
    watch: async () => {
      watches += 1;
      return stream;
    },
  });
  const controller = watchJobRun(client, "exports", { runId: "run-1" });
  const states: string[] = [];
  const unsubscribe = controller.subscribe((state) => {
    states.push(state.connection);
    if (state.connection === "connected") throw new Error("listener failure");
  });

  expect(states).toEqual(["idle"]);
  expect(watches).toBe(0);
  const first = controller.connect();
  expect(first).toBe(controller.connect());
  await first;
  expect(watches).toBe(1);
  expect(controller.getSnapshot()).toMatchObject({ connection: "connected", run: { runId: "run-1" } });
  expect(Object.isFrozen(controller.getSnapshot())).toBe(true);

  await controller.disconnect();
  expect(controller.getSnapshot().connection).toBe("disconnected");
  unsubscribe();
  await controller.dispose();
  expect(controller.getSnapshot().connection).toBe("disposed");
});

test("terminal watch frames require an authoritative terminal confirmation", async () => {
  const client = clientWith({
    watch: async () => holdingIterator([frame("completed", 1, "cursor-1")]),
    get: async () => run("running"),
  });
  const controller = watchJobRun(client, "exports", { runId: "run-1" });

  await controller.connect();
  expect(controller.getSnapshot()).toMatchObject({ connection: "connected", run: { status: "running" } });
  await controller.dispose();
});

test("EOF reconciles through authoritative reads and never fabricates completion", async () => {
  let reads = 0;
  const client = clientWith({
    watch: async () => finiteIterator([frame("running", 1, "cursor-1")]),
    get: async () => {
      reads += 1;
      return run(reads < 2 ? "running" : "completed");
    },
  });
  const controller = watchJobRun(client, "exports", {
    runId: "run-1",
    maxReconnectAttempts: 3,
    reconnectMinDelayMs: 1,
    reconnectMaxDelayMs: 1,
  });
  const connect = controller.connect();
  await connect;
  expect(controller.getSnapshot().connection).not.toBe("completed");
  await waitFor(() => controller.getSnapshot().connection === "completed");
  expect(reads).toBeGreaterThanOrEqual(2);
  expect(controller.getSnapshot().run?.status).toBe("completed");
  await controller.dispose();
});

test("proxy clients use get for EOF reconciliation", async () => {
  const client = proxyClient(
    clientWith({
      watch: async () => finiteIterator([frame("running", 1, "cursor-1")]),
      get: async () => run("completed"),
    }),
  );
  const controller = watchJobRun(client, "exports", { runId: "run-1" });

  await controller.connect();
  await waitFor(() => controller.getSnapshot().connection === "completed");
  expect(controller.getSnapshot()).toMatchObject({ connection: "completed", run: { status: "completed" } });
  await controller.dispose();
});

test("sequence and cursor duplicates are ignored while a shared lease survives another disconnect", async () => {
  const stream = holdingIterator([
    frame("running", 1, "cursor-1"),
    frame("running", 1, "cursor-1", "update"),
    frame("running", 2, "cursor-2", "update"),
  ]);
  let watches = 0;
  const client = clientWith({
    watch: async () => {
      watches += 1;
      return stream;
    },
  });
  const first = watchJobRun(client, "exports", { runId: "run-1" });
  const second = watchJobRun(client, "exports", { runId: "run-1" });
  await first.connect();
  await second.connect();
  expect(watches).toBe(1);
  await waitFor(() => second.getSnapshot().sequence === 2);
  expect(second.getSnapshot().sequence).toBe(2);
  await first.disconnect();
  expect(second.getSnapshot().connection).toBe("connected");
  await second.dispose();
  expect(stream.returned).toBe(true);
});

test("watch-only refetch closes its temporary iterator and remains disconnected", async () => {
  let returned = 0;
  const client = clientWith({
    watch: async () => {
      const iterator = finiteIterator([frame("running", 1, "cursor-1")]);
      const original = iterator.return;
      iterator.return = async () => {
        returned += 1;
        return original?.() ?? { done: true, value: undefined };
      };
      return iterator;
    },
  });
  const controller = watchJobRun(client, "exports", { runId: "run-1" });
  await controller.disconnect();
  await controller.refetch();
  expect(controller.getSnapshot()).toMatchObject({ connection: "disconnected", run: { runId: "run-1" } });
  expect(returned).toBe(1);
  await controller.dispose();
});

test("dispose settles an interrupted connect and ignores late frames", async () => {
  const stream = holdingIterator([]);
  const client = clientWith({ watch: async () => stream });
  const controller = watchJobRun(client, "exports", { runId: "run-1" });
  const connect = controller.connect();
  await Promise.resolve();
  await controller.dispose();
  await expect(connect).rejects.toBeInstanceOf(JobWatchAbortedError);
  expect(controller.getSnapshot().connection).toBe("disposed");
});

test("a reconnect waits for interrupted teardown before reusing a shared feed", async () => {
  let index = 0;
  const streams = [holdingIterator([]), finiteIterator([frame("completed", 1, "cursor-1")])];
  const controller = watchJobRun(
    clientWith({ watch: async () => streams[index++], get: async () => run("completed") }),
    "exports",
    { runId: "run-1" },
  );
  const first = controller.connect();
  await Promise.resolve();
  const disconnect = controller.disconnect();
  const second = controller.connect();
  await expect(first).rejects.toBeInstanceOf(JobWatchAbortedError);
  await disconnect;
  await second;
  expect(controller.getSnapshot().connection).toBe("completed");
  expect(index).toBe(2);
  await controller.dispose();
});

test("bounded reads surface timeout instead of leaving connect pending", async () => {
  const client = clientWith({
    watch: async () => ({
      next: () => new Promise<IteratorResult<unknown>>(() => undefined),
      return: async () => ({ done: true, value: undefined }),
    }),
  });
  const controller = watchJobRun(client, "exports", {
    runId: "run-1",
    readTimeoutMs: 1,
    maxReconnectAttempts: 1,
  });
  await expect(controller.connect()).rejects.toBeInstanceOf(JobWatchReadTimeoutError);
  expect(controller.getSnapshot().connection).toBe("error");
  await controller.dispose();
});

test("polling uses serialized authoritative reads and reports its source", async () => {
  let reads = 0;
  const client = clientWith({
    watch: async () => {
      throw new Error("polling must not open a push feed");
    },
    get: async () => {
      reads += 1;
      return run("completed");
    },
  });
  const controller = watchJobRun(client, "exports", { runId: "run-1", source: "polling" });
  await controller.connect();
  expect(controller.getSnapshot()).toMatchObject({
    connection: "completed",
    source: "polling",
    continuity: "state",
  });
  expect(reads).toBe(2);
  await controller.dispose();
});

test("authorization denial stops reconnects and clears the view", async () => {
  let attempts = 0;
  const denied = Object.assign(new Error("denied"), { code: "RELKIT_JOB_ACCESS_DENIED" });
  const client = clientWith({
    watch: async () => {
      attempts += 1;
      throw denied;
    },
  });
  const controller = watchJobRun(client, "exports", {
    runId: "run-1",
    reconnectMinDelayMs: 1,
    reconnectMaxDelayMs: 1,
  });
  await expect(controller.connect()).rejects.toBe(denied);
  expect(controller.getSnapshot()).toMatchObject({ connection: "unauthorized", isStale: false });
  await new Promise((resolve) => setTimeout(resolve, 5));
  expect(attempts).toBe(1);
  await controller.dispose();
});

test("manual disconnect requires an explicit reconnect to reach terminal state", async () => {
  let watchIndex = 0;
  const streams = [
    holdingIterator([frame("running", 1, "cursor-1")]),
    finiteIterator([frame("completed", 2, "cursor-2")]),
  ];
  const client = clientWith({
    watch: async () => streams[watchIndex++] ?? finiteIterator([]),
    get: async () => run("completed"),
  });
  const controller = watchJobRun(client, "exports", { runId: "run-1" });
  await controller.connect();
  await controller.disconnect();
  expect(controller.getSnapshot().connection).toBe("disconnected");
  await controller.connect();
  expect(controller.getSnapshot().connection).toBe("completed");
  expect(watchIndex).toBe(2);
  await controller.dispose();
});

test("completed feeds release their shared entry", async () => {
  let watches = 0;
  const client = clientWith({
    watch: async () => {
      watches += 1;
      return finiteIterator([frame("completed", 1, "cursor-1")]);
    },
    get: async () => run("completed"),
  });
  const first = watchJobRun(client, "exports", { runId: "run-1" });
  await first.connect();
  const second = watchJobRun(client, "exports", { runId: "run-1" });
  await second.connect();

  expect(watches).toBe(2);
  await first.dispose();
  await second.dispose();
});

test("stream establishment is bounded by the read timeout", async () => {
  let aborted = false;
  const client = {
    jobs: {
      exports: {
        runs: {
          stream: async (_input: unknown, options: { readonly signal?: AbortSignal }) => {
            options.signal?.addEventListener("abort", () => {
              aborted = true;
            });
            return new Promise<AsyncIterator<unknown>>(() => undefined);
          },
        },
      },
    },
  };

  await expect(watchJobStream(client, "exports", { runId: "run-1", name: "text", readTimeoutMs: 1 })).rejects.toBeInstanceOf(
    JobWatchReadTimeoutError,
  );
  expect(aborted).toBe(true);
});

test("named content resets its sequence per attempt and reports gaps or overflow explicitly", async () => {
  const client = {
    jobs: {
      exports: {
        runs: {
          stream: async () => finiteIterator([
            { kind: "start", runId: "run-1", name: "text", attempt: 1, generation: "g1", schemaVersion: "1" },
            { kind: "chunk", runId: "run-1", name: "text", attempt: 1, generation: "g1", schemaVersion: "1", sequence: 0, item: "a" },
            { kind: "start", runId: "run-1", name: "text", attempt: 2, generation: "g2", schemaVersion: "1" },
            { kind: "chunk", runId: "run-1", name: "text", attempt: 2, generation: "g2", schemaVersion: "1", sequence: 0, item: "b" },
            { kind: "end", runId: "run-1", name: "text", attempt: 2, generation: "g2", schemaVersion: "1" },
          ]),
        },
      },
    },
  };
  const stream = await watchJobStream<string>(client, "exports", { runId: "run-1", name: "text" });
  const frames: unknown[] = [];
  for await (const frame of stream) frames.push(frame);
  expect(frames.filter((frame) => (frame as { kind: string }).kind === "chunk")).toHaveLength(2);

  const boundedClient = {
    jobs: { exports: { runs: { stream: async () => finiteIterator([
      { kind: "start", runId: "run-1", name: "text", attempt: 1, generation: "g1", schemaVersion: "1" },
      { kind: "chunk", runId: "run-1", name: "text", attempt: 1, generation: "g1", schemaVersion: "1", sequence: 0, item: "a" },
      { kind: "start", runId: "run-1", name: "text", attempt: 2, generation: "g2", schemaVersion: "1" },
      { kind: "chunk", runId: "run-1", name: "text", attempt: 2, generation: "g2", schemaVersion: "1", sequence: 0, item: "b" },
    ]) } } },
  };
  const bounded = await watchJobStream<string>(boundedClient, "exports", {
    runId: "run-1",
    name: "text",
    maxFrames: 3,
  });
  await expect((async () => {
    for await (const _frame of bounded) {}
  })()).rejects.toBeInstanceOf(JobStreamOverflowError);

  const gapClient = {
    jobs: { exports: { runs: { stream: async () => finiteIterator([
      { kind: "start", runId: "run-1", name: "text", attempt: 1, generation: "g1", schemaVersion: "1" },
      { kind: "chunk", runId: "run-1", name: "text", attempt: 1, generation: "g1", schemaVersion: "1", sequence: 0, item: "ok" },
      { kind: "chunk", runId: "run-1", name: "text", attempt: 1, generation: "g1", schemaVersion: "1", sequence: 2, item: "gap" },
    ]) } } },
  };
  const gap = await watchJobStream<string>(gapClient, "exports", { runId: "run-1", name: "text" });
  await expect((async () => {
    for await (const _frame of gap) {}
  })()).rejects.toBeInstanceOf(JobStreamGapError);

  const overflowClient = {
    jobs: { exports: { runs: { stream: async () => finiteIterator([
      { kind: "start", runId: "run-1", name: "text", attempt: 1, generation: "g1", schemaVersion: "1" },
      { kind: "chunk", runId: "run-1", name: "text", attempt: 1, generation: "g1", schemaVersion: "1", sequence: 0, item: "too-large" },
    ]) } } },
  };
  const overflow = await watchJobStream<string>(overflowClient, "exports", {
    runId: "run-1",
    name: "text",
    maxItemBytes: 1,
  });
  await expect((async () => {
    for await (const _frame of overflow) {}
  })()).rejects.toBeInstanceOf(JobStreamOverflowError);
});

test("shared watch envelope keeps 100 unique feeds and 1,000 leases bounded", async () => {
  let watches = 0;
  let returns = 0;
  const client = {
    jobs: {
      exports: {
        runs: {
          watch: async (input: { readonly runId: string }) => {
            watches += 1;
            const iterator = holdingIterator([frameFor(input.runId)]);
            const original = iterator.return;
            iterator.return = async () => {
              returns += 1;
              return original?.() ?? { done: true, value: undefined };
            };
            return iterator;
          },
        },
      },
    },
  };
  const controllers = Array.from({ length: 1000 }, (_, index) =>
    watchJobRun(client, "exports", { runId: `run-${Math.floor(index / 10)}` }),
  );
  const started = performance.now();
  await Promise.all(controllers.map((controller) => controller.connect()));
  expect(watches).toBe(100);
  await Promise.all(controllers.map((controller) => controller.dispose()));
  expect(returns).toBe(100);
  for (let index = 0; index < 10_000; index += 1) {
    await watchJobRun(client, "exports", { runId: `cycle-${index}` }).dispose();
  }
  expect(performance.now() - started).toBeLessThan(5_000);
});

function clientWith(procedures: {
  readonly watch: (input: unknown, options: unknown) => Promise<AsyncIterator<unknown>>;
  readonly get?: (input: unknown, options: unknown) => Promise<RunSnapshot>;
}): unknown {
  const runs: Record<string, unknown> = { watch: procedures.watch };
  if (procedures.get !== undefined) runs.get = procedures.get;
  return { jobs: { exports: { runs } } };
}

function proxyClient(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  return new Proxy({}, {
    get: (_target, property) => typeof property === "string" ? proxyClient(record[property]) : undefined,
  });
}

function run(status: RunSnapshot["status"]): RunSnapshot {
  return {
    accepted: true,
    runId: "run-1",
    jobId: "job-1",
    taskId: "task-1",
    taskVersion: "1",
    acceptedAt: "2026-01-01T00:00:00.000Z",
    buildId: "build-1",
    service: "local",
    status,
    observedAt: new Date().toISOString(),
    resultAvailability: status === "completed" ? "available" : "pending",
    ...(status === "completed" ? { output: { ok: true } } : {}),
  } as RunSnapshot;
}

function frame(
  status: RunSnapshot["status"],
  sequence: number,
  cursor: string,
  kind: RunWatchFrame["kind"] = "update",
): RunWatchFrame {
  return {
    kind,
    run: run(status),
    observedAt: new Date().toISOString(),
    epoch: "epoch-1",
    sequence,
    cursor,
    ...(kind === "snapshot" ? { continuity: "state" as const } : {}),
  } as RunWatchFrame;
}

function frameFor(runId: string): RunWatchFrame {
  return {
    ...frame("running", 1, `cursor-${runId}`),
    run: { ...run("running"), runId },
  };
}

function finiteIterator(values: readonly unknown[]): AsyncIterator<unknown> & { returned?: boolean } {
  let index = 0;
  return {
    returned: false,
    next: async () =>
      index < values.length
        ? { done: false, value: values[index++] }
        : { done: true, value: undefined },
    return: async () => ({ done: true, value: undefined }),
  };
}

function holdingIterator(values: readonly unknown[]): AsyncIterator<unknown> & { returned: boolean } {
  let index = 0;
  let finish: ((result: IteratorResult<unknown>) => void) | undefined;
  const iterator: AsyncIterator<unknown> & { returned: boolean } = {
    returned: false,
    next: async () => {
      if (index < values.length) return { done: false, value: values[index++] };
      return new Promise<IteratorResult<unknown>>((resolve) => {
        finish = resolve;
      });
    },
    return: async () => {
      iterator.returned = true;
      finish?.({ done: true, value: undefined });
      return { done: true, value: undefined };
    },
  };
  return iterator;
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  throw new Error("condition did not settle");
}
