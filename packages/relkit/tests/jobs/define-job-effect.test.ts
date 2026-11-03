import { expect, test } from "vitest";
import { z } from "../../src/schema/index.js";
import { Effect, Layer, Result } from "effect";
import {
  assertJobDescriptorEffect,
  defineJobEffect,
  isJobDescriptorEffect,
  JobDefinitionFailure,
} from "../../src/jobs/define-job.ts";
import { defineTask } from "../../src/jobs/define-task.ts";
import { JobsTelemetry } from "../../src/jobs/jobs-observability.ts";
test("Effect job definition validates descriptors and records operations", async () => {
  const task = defineTask({
    id: "send",
    version: "1",
    input: z.string(),
    output: z.string(),
    handler: async (input) => input,
  });
  const seen: string[] = [];
  const layer = Layer.succeed(
    JobsTelemetry,
    JobsTelemetry.of({
      observe: (operation, effect) => {
        seen.push(operation);
        return effect;
      },
    }),
  );
  const job = Effect.runSync(Effect.provide(defineJobEffect({ name: "send", task }), layer));
  expect(Effect.runSync(Effect.provide(isJobDescriptorEffect(job), layer))).toBe(true);
  Effect.runSync(Effect.provide(assertJobDescriptorEffect(job), layer));
  const invalid = Effect.runSync(
    Effect.result(Effect.provide(defineJobEffect({ name: "bad-name", task } as never), layer)),
  );
  expect(Result.isFailure(invalid)).toBe(true);
  if (Result.isFailure(invalid)) expect(invalid.failure).toBeInstanceOf(JobDefinitionFailure);
  expect(seen).toContain("job.define");
  expect(seen).toContain("job.assertDescriptor");
});
