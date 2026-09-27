import { describe, expect, test } from "vitest";
import { Effect, Result } from "effect";
import type { JobDescriptorAny } from "../src/job.types.js";
import type { TaskDescriptorAny } from "../src/task-types.js";
import {
  JobBindingFailure,
  JobBindingResolutionError,
  resolveTaskBinding,
  resolveTaskBindingEffect,
} from "../src/resolve-binding.js";
import {
  JobBindingSupportFailure,
  selectProfile,
  selectProfileEffect,
  taskIdOf,
  taskIdOfEffect,
} from "../src/resolve-binding-support.js";
const task = {
  ref: { kind: "task", id: "billing.charge" },
  version: "1",
} as unknown as TaskDescriptorAny;
function job(
  id: string,
  name: string,
  service?: string,
  isDefault = false,
  selectedTask = task,
): JobDescriptorAny {
  return {
    id,
    name,
    ref: { kind: "job", id },
    task: selectedTask,
    ...(service === undefined ? {} : { service }),
    ...(isDefault ? { default: true } : {}),
    client: { public: true, operations: [] },
  } as unknown as JobDescriptorAny;
}
describe("resolveTaskBinding", () => {
  test("creates a private implicit binding and selects the sole profile", () => {
    const result = resolveTaskBinding({
      task,
      implicitName: "charge",
      profiles: ["primary"],
    });
    expect(result).toMatchObject({
      taskId: "billing.charge",
      jobId: "billing.charge",
      name: "charge",
      profile: "primary",
      source: "implicit",
      private: true,
    });
  });
  test("selects the designated default across service profiles", () => {
    const result = resolveTaskBinding({
      task,
      jobs: [job("charge-fast", "fast", "fast"), job("charge-safe", "safe", "safe", true)],
      profiles: ["fast", "safe"],
    });
    expect(result).toMatchObject({ jobId: "charge-safe", profile: "safe", source: "default" });
  });
  test("rejects ambiguous jobs and wrong-task selectors", () => {
    expect(() =>
      resolveTaskBinding({
        task,
        jobs: [job("charge-fast", "fast", "fast"), job("charge-safe", "safe", "safe")],
      }),
    ).toThrow(JobBindingResolutionError);
    expect(() =>
      resolveTaskBinding({
        task,
        jobs: [
          job("other", "other", "other", false, {
            ref: { kind: "task", id: "other" },
          } as TaskDescriptorAny),
        ],
        selector: job("other", "other", "other", false, {
          ref: { kind: "task", id: "other" },
        } as TaskDescriptorAny),
      }),
    ).toThrow(/targets task/);
  });
  test("Effect resolves the same binding and reports a tagged ambiguous failure", async () => {
    const options = { task, implicitName: "charge", profiles: ["primary"] };
    const binding = await Effect.runPromise(resolveTaskBindingEffect(options));
    expect(binding).toEqual(resolveTaskBinding(options));
    const invalid = await Effect.runPromise(
      Effect.result(
        resolveTaskBindingEffect({
          task,
          jobs: [job("charge-fast", "fast"), job("charge-safe", "safe")],
        }),
      ),
    );
    expect(Result.isFailure(invalid)).toBe(true);
    if (Result.isFailure(invalid)) {
      expect(invalid.failure).toBeInstanceOf(JobBindingFailure);
      expect(invalid.failure.code).toBe("AMBIGUOUS_JOB");
    }
  });
});
describe("binding helpers", () => {
  test("selects defaults and reads task references through Effect and compatibility APIs", async () => {
    expect(await Effect.runPromise(selectProfileEffect(undefined, undefined, "send"))).toBe(
      "default",
    );
    expect(await Effect.runPromise(selectProfileEffect(undefined, ["primary"], "send"))).toBe(
      "primary",
    );
    expect(selectProfile(undefined, ["default", "other"], "send")).toBe("default");
    expect(await Effect.runPromise(taskIdOfEffect(task))).toBe("billing.charge");
    expect(taskIdOf(undefined)).toBe("");
  });
  test("reports a tagged profile failure and preserves compatibility errors", async () => {
    const result = await Effect.runPromise(
      Effect.result(selectProfileEffect(undefined, ["first", "second"], "send")),
    );
    expect(Result.isFailure(result)).toBe(true);
    if (Result.isFailure(result)) {
      expect(result.failure).toBeInstanceOf(JobBindingSupportFailure);
      expect(result.failure.code).toBe("AMBIGUOUS_JOB_PROFILE");
      expect(result.failure.reason).toContain("requires a jobs provider profile");
    }
    expect(() => selectProfile("missing", ["first"], "send")).toThrow(JobBindingResolutionError);
  });
});
