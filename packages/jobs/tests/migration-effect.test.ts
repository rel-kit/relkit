import { expect, test } from "vitest";
import { Effect, Layer } from "effect";
import {
  diagnoseJobMigration,
  diagnoseJobMigrationEffect,
  diagnoseLegacyCompatibilityEffect,
} from "../src/migration.ts";
import { sameEffect } from "../src/migration-support.ts";
import { JobsTelemetry } from "../src/jobs-observability.ts";

const previous = {
  name: "sendEmail",
  id: "jobs.sendEmail",
  taskId: "tasks.email",
  taskVersion: "1",
  binding: "implicit",
} as const;

test("Effect migration path preserves diagnostics and ordering", async () => {
  const next = {
    ...previous,
    id: "jobs.sendEmailV2",
    taskVersion: "2",
    binding: "explicit",
  } as const;
  const effect = await Effect.runPromise(diagnoseJobMigrationEffect(previous, next));
  expect(effect).toEqual(diagnoseJobMigration(previous, next));
  expect(effect.map((item) => item.code)).toEqual([
    "DEFAULT_DERIVED_JOB_ID_RENAME",
    "IMPLICIT_TO_EXPLICIT_BINDING",
    "TASK_VERSION_CHANGED",
  ]);
  expect(Object.isFrozen(effect)).toBe(true);
  expect(await Effect.runPromise(sameEffect(undefined, []))).toBe(true);
  expect(await Effect.runPromise(sameEffect(["a"], ["b"]))).toBe(false);
});

test("legacy diagnostics and telemetry use the Effect path", async () => {
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
  const diagnostics = await Effect.runPromise(
    Effect.provide(
      diagnoseLegacyCompatibilityEffect({
        usesFunctionTarget: true,
        legacyJobsEnabled: false,
        legacyKeys: ["job"],
      }),
      layer,
    ),
  );
  expect(diagnostics.map((item) => item.code)).toEqual([
    "LEGACY_JOBS_DISABLED",
    "LEGACY_ALIAS_DEPRECATED",
  ]);
  expect(seen).toEqual(["migration.legacy"]);
});
