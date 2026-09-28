import { expect, test } from "vitest";
import type { JobDescriptorAny } from "../src/job.types.ts";
import { copyTriggerOptions, validateResultOptions } from "../src/trigger-validation.ts";

test("covers trigger and result option boundaries", () => {
  const signal = new AbortController().signal;
  const descriptor = {
    id: "quality-job",
    name: "quality-job",
    ref: { kind: "job", id: "quality-job" },
    task: { ref: { kind: "task", id: "quality-task" } },
  } as JobDescriptorAny;
  expect(copyTriggerOptions({ operationId: "op", signal, job: descriptor })).toMatchObject({
    operationId: "op",
    signal,
    job: descriptor,
  });
  expect(copyTriggerOptions({ tags: ["urgent"], correlationId: "request-1" })).toMatchObject({
    tags: ["urgent"],
    correlationId: "request-1",
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
