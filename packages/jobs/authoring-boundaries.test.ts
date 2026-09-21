import { expect, test } from "bun:test";
import { z } from "@relkit/schema";
import {
  defineJob,
  defineTask,
  durationToMillis,
  isJobName,
  JOB_NAME_RESERVED,
} from "./src/index.js";

const task = defineTask({
  id: "email",
  version: "1",
  input: z.string(),
  output: z.string(),
  execution: "retryable",
  handler: async (input) => input,
});

test("task and job descriptors preserve the new authoring boundaries", () => {
  const job = defineJob({ name: "sendEmail", task, profile: "local" });
  expect(task.execution).toBe("retryable");
  expect(Object.isFrozen(task)).toBe(true);
  expect(job).toMatchObject({ name: "sendEmail", id: "sendEmail", service: "local" });
  expect(job.profile).toBe("local");
  expect(() => defineJob({ name: "bad-name", task })).toThrow();
  expect(() => defineJob({ name: "functionTarget", task: (() => undefined) as never })).toThrow();
});

test("job names and durations reject unsafe spellings", () => {
  expect(JOB_NAME_RESERVED.every((name) => !isJobName(name))).toBe(true);
  expect(durationToMillis("1.5 seconds")).toBe(1_500);
  expect(durationToMillis("0 seconds")).toBe(0);
  expect(() => durationToMillis("0.0001 seconds")).toThrow();
  expect(() => durationToMillis("-1 second" as never)).toThrow();
});
