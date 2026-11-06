/**
 * Runs the published events conformance suite (`@relkit/testing/events-conformance`) against the
 * Postgres event provider on a real database, driving delivery with `deliverDue` as a worker
 * process would, and injecting a backend failure with a server that does not answer.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { runConformance } from "@relkit/testing/conformance";
import { createEventsConformanceHarness } from "@relkit/testing/events-conformance";
import { createPostgresEventProvider, type PostgresEventProvider } from "../src/runtime/index.js";
import { acquirePostgres, postgresAvailable } from "./postgres-harness.js";

const postgres = postgresAvailable ? await acquirePostgres() : undefined;
afterAll(async () => postgres?.close());

describe.skipIf(postgres === undefined)("Postgres events conformance", () => {
  test("passes every case of the published events suite", async () => {
    const report = await runConformance(
      createEventsConformanceHarness({
        create: (profile) =>
          createPostgresEventProvider({
            url: postgres!.url,
            profile,
            consumers: false,
            maxConnections: 3,
          }),
        deliver: async (provider) => (provider as PostgresEventProvider).deliverDue(),
        failing: () =>
          createPostgresEventProvider({
            url: "postgres://relkit@127.0.0.1:1/relkit",
            profile: "failing",
            consumers: false,
            maxConnections: 1,
          }),
      }),
    );
    expect(report.results.filter((result) => result.outcome !== "pass")).toEqual([]);
  }, 60_000);
});
