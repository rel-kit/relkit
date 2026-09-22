import { expect, test } from "bun:test";
import { z } from "@relkit/schema";
import {
  assertBoundedString,
  assertCanonicalScalarKey,
  assertFieldName,
  copyConcurrency,
  copyLogging,
  copyResources,
  copyTaskTags,
  memoryBytes,
  retryDelayMillis,
} from "./src/task-policy-validation.ts";
import { durationToMillis, isDurationInput } from "./src/duration.ts";
import { selectProfile, taskIdOf } from "./src/resolve-binding-support.ts";
import { JobBindingResolutionError, resolveTaskBinding } from "./src/resolve-binding.ts";
import { copyTriggerOptions, validateResultOptions } from "./src/trigger-validation.ts";
import type { JobDescriptorAny } from "./src/job-types.ts";
import type { TaskDescriptorAny } from "./src/task-types.ts";
import type { NormalizedTaskRetryPolicy } from "./src/task-types.ts";

const retry = {
  maxAttempts: 4,
  initialDelay: "1 second",
  maxDelay: "3 seconds",
  factor: 2,
  jitter: "none",
} as NormalizedTaskRetryPolicy;

const task = {
  ref: { kind: "task", id: "quality.task" },
  version: "1",
} as unknown as TaskDescriptorAny;

function job(
  id: string,
  selectedTask = task,
  options: {
    readonly service?: string;
    readonly profile?: string;
    readonly default?: boolean;
  } = {},
): JobDescriptorAny {
  return {
    id,
    name: id,
    ref: { kind: "job", id },
    task: selectedTask,
    client: { public: true, operations: [] },
    ...options,
  } as unknown as JobDescriptorAny;
}

test("covers readable duration and policy boundary conversions", () => {
  expect(isDurationInput("1 second")).toBe(true);
  expect(isDurationInput("1.1 unknown" as never)).toBe(false);
  expect(isDurationInput(1)).toBe(false);
  expect(durationToMillis("1.5 seconds")).toBe(1_500);
  expect(() => durationToMillis("1.1 milliseconds")).toThrow("exact millisecond");
  expect(() => durationToMillis("9007199254740992 milliseconds")).toThrow("safe");

  expect(() => assertBoundedString(undefined, "value")).toThrow();
  expect(() => assertBoundedString("", "value")).toThrow();
  expect(() => assertBoundedString("é", "value", 1)).toThrow();
  expect(() => assertFieldName("tenant.id")).toThrow();
  expect(() => assertFieldName("tenant id")).toThrow();
  expect(() => assertFieldName("tenantId")).not.toThrow();

  expect(memoryBytes("1 MiB")).toBe(1_048_576);
  expect(memoryBytes("1.5 GiB")).toBe(1_610_612_736);
  expect(() => memoryBytes("0 MiB")).toThrow("safe");
  expect(() => memoryBytes("0.1 bytes")).toThrow("decimal");
  expect(() => memoryBytes("1.1 MiB")).toThrow("exact byte");
  expect(() => memoryBytes(`${"1".repeat(129)} MiB`)).toThrow("decimal");
});

test("covers retry multiplication, jitter and policy copy boundaries", () => {
  expect(retryDelayMillis(retry, 1)).toBe(1_000);
  expect(retryDelayMillis(retry, 3, 10_000)).toBe(10_000);
  expect(retryDelayMillis({ ...retry, maxDelay: "2 seconds" }, 4)).toBe(2_000);
  expect(retryDelayMillis({ ...retry, jitter: "full" }, 2, 0, () => 0.5)).toBe(1_000);
  expect(retryDelayMillis({ ...retry, jitter: "full" }, 2, 0, () => -1)).toBe(0);
  expect(() => retryDelayMillis(retry, 0)).toThrow();
  expect(() => retryDelayMillis(retry, 1, -1)).toThrow();
  expect(() => retryDelayMillis({ ...retry, jitter: "full" }, 1, 0, () => Number.NaN)).toThrow();

  expect(copyTaskTags(undefined)).toBeUndefined();
  expect(copyTaskTags(["one", "two"])).toEqual(["one", "two"]);
  expect(() => copyTaskTags(["one", "one"])).toThrow("unique");
  expect(() => copyTaskTags("one")).toThrow();

  expect(copyResources(undefined)).toBeUndefined();
  expect(copyResources({ cpu: 1, memory: "1 MiB" })).toEqual({ cpu: 1, memory: "1 MiB" });
  expect(() => copyResources(null)).toThrow();
  expect(() => copyResources({ cpu: 0, memory: "1 MiB" })).toThrow();
  expect(() => copyResources({ cpu: 1, memory: 1 })).toThrow();

  expect(copyConcurrency(undefined)).toBeUndefined();
  expect(copyConcurrency({ limit: 1 })).toEqual({ limit: 1 });
  expect(
    copyConcurrency({ limit: 2, key: "tenantId" }, z.object({ tenantId: z.string() })),
  ).toEqual({ limit: 2, key: "tenantId" });
  expect(() => copyConcurrency(null)).toThrow();
  expect(() => copyConcurrency({ limit: 0 })).toThrow();
  expect(() =>
    copyConcurrency({ limit: 1, key: "missing" }, z.object({ tenantId: z.string() })),
  ).toThrow();
});

test("covers canonical field and logging validation", () => {
  expect(() =>
    assertCanonicalScalarKey(z.object({ tenantId: z.string() }), "tenantId", "key"),
  ).not.toThrow();
  expect(() => assertCanonicalScalarKey(z.object({ flag: z.boolean() }), "flag", "key")).toThrow();
  expect(() =>
    assertCanonicalScalarKey(z.object({ tenantId: z.string() }), "missing", "key"),
  ).toThrow();

  expect(copyLogging(undefined)).toBeUndefined();
  expect(copyLogging({})).toEqual({});
  expect(copyLogging({ level: "warn", redact: ["secret"] })).toEqual({
    level: "warn",
    redact: ["secret"],
  });
  expect(() => copyLogging(null)).toThrow();
  expect(() => copyLogging({ level: "verbose" })).toThrow();
  expect(() => copyLogging({ redact: "secret" })).toThrow();
  expect(() => copyLogging({ redact: ["secret", "secret"] })).toThrow("unique");
});

test("covers deterministic provider profile selection and binding errors", () => {
  expect(selectProfile(undefined, undefined, "job")).toBe("default");
  expect(selectProfile("custom", undefined, "job")).toBe("custom");
  expect(selectProfile(undefined, ["only"], "job")).toBe("only");
  expect(selectProfile(undefined, { default: {} }, "job")).toBe("default");
  expect(() => selectProfile(undefined, [], "job")).toThrow(JobBindingResolutionError);
  expect(() => selectProfile(undefined, ["one", "two"], "job")).toThrow("provider profile");
  expect(() => selectProfile("unknown", ["one"], "job")).toThrow("unknown profile");
  expect(taskIdOf(undefined)).toBe("");
  expect(taskIdOf({ ref: { kind: "job", id: "job" } } as never)).toBe("");

  expect(() => resolveTaskBinding({ task, profiles: ["default"] })).toThrow("explicit job name");
  expect(() => resolveTaskBinding({ task, implicitName: "not-valid" })).toThrow("invalid implicit");
  expect(() => resolveTaskBinding({ task, jobs: [job("same"), job("same")] })).toThrow("Duplicate");
  expect(() =>
    resolveTaskBinding({
      task,
      jobs: [job("one", task, { default: true }), job("two", task, { default: true })],
    }),
  ).toThrow("multiple default");
  expect(() => resolveTaskBinding({ task, jobs: [job("one"), job("two")] })).toThrow(
    "multiple jobs",
  );

  const otherTask = {
    ref: { kind: "task", id: "other" },
    version: "1",
  } as unknown as TaskDescriptorAny;
  expect(() =>
    resolveTaskBinding({
      task,
      jobs: [job("other", otherTask)],
      selector: { kind: "job", id: "missing" } as never,
    }),
  ).toThrow("does not belong");
  expect(() =>
    resolveTaskBinding({
      task,
      jobs: [job("other", otherTask)],
      selector: { ref: { kind: "job", id: "other" } } as never,
    }),
  ).toThrow("targets task");
  expect(() =>
    resolveTaskBinding({
      task,
      jobs: [job("other", otherTask)],
      selector: job("other", otherTask),
    }),
  ).toThrow("targets task");
  expect(() =>
    resolveTaskBinding({ task, jobs: [job("shared", otherTask)], selector: job("shared", task) }),
  ).toThrow("another task");

  const selected = resolveTaskBinding({
    task,
    jobs: [job("one", task, { service: "fast" })],
    selector: job("one", task),
    profiles: ["fast"],
  });
  expect(selected).toMatchObject({ jobId: "one", source: "explicit", service: "fast" });
});

test("covers trigger and result option boundaries", () => {
  const signal = new AbortController().signal;
  const descriptor = job("quality-job");
  expect(copyTriggerOptions({ operationId: "op", signal, job: descriptor })).toMatchObject({
    operationId: "op",
    signal,
    job: descriptor,
  });
  expect(validateResultOptions({ timeout: "1 second", signal })).toMatchObject({ signal });
  expect(() => copyTriggerOptions(null)).toThrow();
  expect(() => copyTriggerOptions({ unsupported: true })).toThrow();
  expect(() => copyTriggerOptions({ delay: "1 second", at: "2026-01-01T00:00:00Z" })).toThrow();
  expect(() => copyTriggerOptions({ at: "not-an-instant" })).toThrow();
  expect(() => copyTriggerOptions({ correlationId: "with whitespace" })).toThrow();
  expect(() => copyTriggerOptions({ signal: {} })).toThrow();
  expect(() => copyTriggerOptions({ job: { ref: { kind: "task", id: "bad" } } })).toThrow();
  expect(() => validateResultOptions({})).toThrow();
  expect(() => validateResultOptions({ timeout: "1 second", signal: {} })).toThrow();
});
