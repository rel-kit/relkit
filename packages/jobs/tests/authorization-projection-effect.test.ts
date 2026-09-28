import { Effect, Layer } from "effect";
import { expect, test } from "vitest";
import type { RunPage, RunSnapshot } from "@relkit/contracts/jobs";
import {
  projectRunPage,
  projectRunPageEffect,
  projectRunSnapshot,
  projectRunSnapshotEffect,
} from "../src/authorization-projection.ts";
import { JobsTelemetry } from "../src/jobs-observability.ts";
const run = {
  accepted: true,
  runId: "run-1",
  jobId: "job-1",
  taskId: "task-1",
  taskVersion: "1",
  acceptedAt: "2026-01-01T00:00:00.000Z",
  buildId: "build-1",
  service: "local",
  status: "succeeded",
  observedAt: "2026-01-01T00:00:01.000Z",
  resultAvailability: "available",
  output: { ok: true },
  input: { secret: "hidden" },
} as const satisfies RunSnapshot;
test("Effect snapshot projection redacts ungranted fields and matches the sync adapter", async () => {
  const projected = await Effect.runPromise(projectRunSnapshotEffect(run, ["output"]));
  expect(projected.output).toEqual({ ok: true });
  expect(projected).not.toHaveProperty("input");
  expect(projected).toEqual(projectRunSnapshot(run, ["output"]));
});
test("Effect page projection observes one page operation and preserves order", async () => {
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
  const page: RunPage<RunSnapshot> = {
    items: [run, { ...run, runId: "run-2" }],
    hasMore: false,
    availability: [],
  };
  const projected = await Effect.runPromise(Effect.provide(projectRunPageEffect(page), layer));
  expect(projected.items.map((item) => item.runId)).toEqual(["run-1", "run-2"]);
  expect(projected.items[0]).not.toHaveProperty("output");
  expect(projected).toEqual(projectRunPage(page));
  expect(seen).toEqual(["authorization.projectPage"]);
});
