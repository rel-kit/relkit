import { describe, expect, test } from "bun:test";
import type { JobDescriptorAny } from "./src/job-types.js";
import type { TaskDescriptorAny } from "./src/task-types.js";
import { JobBindingResolutionError, resolveTaskBinding } from "./src/resolve-binding.js";

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
});
