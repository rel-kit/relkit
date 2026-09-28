import { expect, test } from "vitest";
import { z } from "@relkit/schema";
import { Effect, Layer, Result } from "effect";
import {
  assertTaskDescriptorEffect,
  defineTaskEffect,
  isTaskDescriptorEffect,
  TaskDefinitionFailure,
} from "../src/define-task.ts";
import { JobsTelemetry } from "../src/jobs-observability.ts";
test("Effect task definition validates descriptors and records operations", async () => {
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
  const options = {
    id: "send",
    version: "1",
    input: z.string(),
    output: z.string(),
    handler: async (input: string) => input,
  };
  const task = Effect.runSync(Effect.provide(defineTaskEffect(options), layer));
  expect(Effect.runSync(Effect.provide(isTaskDescriptorEffect(task), layer))).toBe(true);
  Effect.runSync(Effect.provide(assertTaskDescriptorEffect(task), layer));
  const invalid = Effect.runSync(
    Effect.result(
      Effect.provide(defineTaskEffect({ ...options, handler: undefined } as never), layer),
    ),
  );
  expect(Result.isFailure(invalid)).toBe(true);
  if (Result.isFailure(invalid)) expect(invalid.failure).toBeInstanceOf(TaskDefinitionFailure);
  expect(seen).toContain("task.define");
  expect(seen).toContain("task.assertDescriptor");
});
