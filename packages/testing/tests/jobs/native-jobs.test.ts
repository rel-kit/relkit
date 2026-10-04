import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import type { NativeSubmission, OperationContext } from "@relkit/jobs/adapter";
import { createDeterministicJobsAdapter } from "../../src/test-jobs-adapter.js";

const context: OperationContext = {
  signal: new AbortController().signal,
  application: "test",
  environment: "test",
  scope: "test",
  service: "test-jobs",
  serviceGeneration: "test",
};
const request: NativeSubmission = {
  jobId: "job.test",
  taskId: "task.test",
  taskVersion: "1",
  buildId: "build.test",
  input: {},
  canonicalInput: { version: 1, kind: "json", value: {} },
  operationId: "submit",
};

it.effect("publishes deterministic snapshots and terminal observations without polling", () =>
  Effect.gen(function* () {
    const adapter = createDeterministicJobsAdapter({ startTimeMs: 1_000 });
    try {
      const accepted = yield* Effect.promise(() => adapter.submit(request, context));
      if (!("runId" in accepted)) throw new Error("Expected accepted run");
      const iterator = adapter.observe!({ runId: accepted.runId }, context)[Symbol.asyncIterator]();
      const first = yield* Effect.promise(() => iterator.next());
      expect(first.value?.kind).toBe("snapshot");
      expect(first.value?.run.observedAt).toBe("1970-01-01T00:00:01.000Z");
      const work = yield* Effect.promise(() => adapter.worker!.next(context));
      expect(work?.binding.run.runId).toBe(accepted.runId);
      expect(adapter.snapshot(accepted.runId).startedAt).toBe("1970-01-01T00:00:01.000Z");
      const changed = yield* Effect.promise(() => iterator.next());
      expect(changed.value?.run.status).toBe("running");
      yield* Effect.promise(() => adapter.clock.advance(25));
      const pending = iterator.next();
      yield* Effect.promise(() =>
        adapter.worker!.complete(accepted.runId, { done: true }, context),
      );
      const terminal = yield* Effect.promise(() => pending);
      expect(terminal.value?.run.completedAt).toBe("1970-01-01T00:00:01.025Z");
      expect(terminal.value?.run.status).toBe("completed");
      expect((yield* Effect.promise(() => iterator.next())).done).toBe(true);
    } finally {
      yield* Effect.promise(() => adapter.close());
    }
  }),
);

it.effect("close aborts admitted workers and settles blocked observation pulls", () =>
  Effect.gen(function* () {
    const adapter = createDeterministicJobsAdapter();
    try {
      const accepted = yield* Effect.promise(() => adapter.submit(request, context));
      if (!("runId" in accepted)) throw new Error("Expected accepted run");
      const iterator = adapter.observe!({ runId: accepted.runId }, context)[Symbol.asyncIterator]();
      yield* Effect.promise(() => iterator.next());
      const work = yield* Effect.promise(() => adapter.worker!.next(context));
      yield* Effect.promise(() => iterator.next());
      const waiting = iterator.next();
      yield* Effect.promise(() => adapter.close());
      expect(work?.binding.signal.aborted).toBe(true);
      expect((yield* Effect.promise(() => waiting)).done).toBe(true);
    } finally {
      yield* Effect.promise(() => adapter.close());
    }
  }),
);
