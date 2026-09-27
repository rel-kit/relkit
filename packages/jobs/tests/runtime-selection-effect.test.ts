import type { TaskRefAny } from "@relkit/contracts/jobs";
import { Effect, Result } from "effect";
import { expect, test } from "vitest";
import {
  resolveBinding,
  resolveBindingEffect,
  RuntimeBindingFailure,
} from "../src/runtime-selection.ts";
const task = { ref: { kind: "task", id: "orders.submit" }, version: "1" } as TaskRefAny;
test("Effect selects a manifest job and matches the sync adapter", async () => {
  const options = {
    manifest: { jobs: [{ id: "job-1", name: "submit", taskId: "orders.submit" }] },
  };
  const binding = await Effect.runPromise(resolveBindingEffect(task, undefined, options));
  expect(binding.jobId).toBe("job-1");
  expect(binding).toEqual(resolveBinding(task, undefined, options));
});
test("ambiguous manifest bindings fail with a tagged error", async () => {
  const options = {
    manifest: {
      jobs: [
        { id: "job-1", name: "first", taskId: "orders.submit" },
        { id: "job-2", name: "second", taskId: "orders.submit" },
      ],
    },
  };
  const result = await Effect.runPromise(
    Effect.result(resolveBindingEffect(task, undefined, options)),
  );
  expect(Result.isFailure(result)).toBe(true);
  if (Result.isFailure(result)) expect(result.failure).toBeInstanceOf(RuntimeBindingFailure);
  expect(() => resolveBinding(task, undefined, options)).toThrow(TypeError);
});
