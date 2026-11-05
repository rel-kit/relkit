/**
 * Runs the shared jobs conformance suite from `@relkit/testing` against the
 * Postgres adapter on a real database: every fixture, with the ambiguous-write
 * fixture exercised through the adapter's lost-response fault. Also checks
 * that a resubmission with the same idempotency key recovers the committed run.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { JOBS_CONFORMANCE_FIXTURES, runJobsConformance } from "@relkit/testing";
import { assertJobsAdapterRuntime } from "relkit/jobs/adapter";
import { createPostgresJobsRuntime } from "../src/runtime/index.js";
import { contextFor, submission } from "./jobs-fixtures.js";
import { acquirePostgres, postgresAvailable } from "./postgres-harness.js";

const postgres = postgresAvailable ? await acquirePostgres() : undefined;
afterAll(async () => postgres?.close());

describe.skipIf(postgres === undefined)("Postgres jobs conformance", () => {
  test("passes every shared jobs conformance fixture", async () => {
    const adapter = createPostgresJobsRuntime({ url: postgres!.url, service: "conformance" });
    const lossy = createPostgresJobsRuntime({
      url: postgres!.url,
      service: "conformance",
      faults: { loseSubmitResponse: true },
    });
    try {
      assertJobsAdapterRuntime(adapter);
      const ids = JOBS_CONFORMANCE_FIXTURES.map((fixture) => fixture.id);
      const regular = ids.filter((id) => id !== "unknown-acknowledgement");
      expect(await runJobsConformance(adapter, regular)).toEqual(regular);
      expect(await runJobsConformance(lossy, ["unknown-acknowledgement"])).toEqual([
        "unknown-acknowledgement",
      ]);
    } finally {
      await adapter.close();
      await lossy.close();
    }
  });

  test("recovers a lost submission response by resubmitting the same key", async () => {
    const lossy = createPostgresJobsRuntime({
      url: postgres!.url,
      service: "recovery",
      faults: { loseSubmitResponse: true },
    });
    const adapter = createPostgresJobsRuntime({ url: postgres!.url, service: "recovery" });
    try {
      const context = contextFor("recovery");
      const request = submission({ order: 1 }, { idempotencyKey: "order-1" });
      const unknown = await lossy.submit(request, context);
      expect(unknown).toMatchObject({
        outcome: "unknown",
        recovery: { action: "retry-with-same-key" },
      });
      const recovered = await adapter.submit({ ...request, operationId: "op-again" }, context);
      expect(recovered).toMatchObject({ accepted: true, duplicate: true });
      const page = await adapter.list({}, context);
      expect(page.items).toHaveLength(1);
    } finally {
      await lossy.close();
      await adapter.close();
    }
  });
});
