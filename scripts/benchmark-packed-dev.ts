/**
 * Captures a fresh packed default-project candidate after runtime edits.
 * Packages and the generated application install outside the workspace; a finite
 * registry scope owns setup, and measured starts own separate process groups.
 * Evidence retains fixture identities and every attempt; historical baseline
 * evidence is preserved separately and restart sets remain explicitly diagnostic.
 */
import { resolve } from "node:path";
import { Effect, Layer } from "effect";
import { createPackedProject, preparePackedFixture } from "./dev-readiness/packed-fixture.js";
import { benchmarkNativeLive, BenchmarkNative } from "./dev-readiness/benchmark-native.service.js";
import { readinessBenchmarkLive, ReadinessBenchmark } from "./dev-readiness/benchmark.service.js";
import { benchmarkReportEffect } from "./dev-readiness/benchmark-report.js";
import { packedReadinessIdentity } from "./dev-readiness/benchmark-identity.js";
import { benchmarkHostIdentity } from "./dev-readiness/benchmark-host.js";
import { packedProbeContract } from "./dev-readiness/packed-probe-contract.js";
import { runBenchmarkMain } from "./dev-readiness/benchmark-main.js";
import { candidateSummary } from "./dev-readiness/benchmark-packed-summary.js";
import type { StartRequest } from "./dev-readiness/benchmark.types.js";

/**
 * Allocates an available loopback port before the measurement clock starts.
 * @returns The freed ephemeral port used by one isolated fixture.
 */
const allocatePort = Effect.fn("ReadinessBenchmark.allocatePort")(() =>
  Effect.scoped(
    Effect.gen(function* () {
      const server = yield* Effect.acquireRelease(
        Effect.sync(() =>
          Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() }),
        ),
        (server) => Effect.promise(() => server.stop(true)),
      );
      if (server.port === undefined)
        return yield* Effect.die(new Error("Probe did not allocate a port"));
      return server.port;
    }),
  ),
);

/**
 * Installs a packed candidate and records the requested sequential command launches.
 * @returns Completion after measurement scopes, report I/O and registry shutdown.
 */
const main = Effect.fn("ReadinessBenchmark.packedCandidate")(function* () {
  const repository = resolve(import.meta.dir, "..");
  const count = Number(option("--runs", "5"));
  if (!Number.isSafeInteger(count) || count < 1 || count > 100)
    return yield* Effect.die(new Error("--runs must be between 1 and 100"));
  const set = option("--set", "diagnostic");
  if (set !== "diagnostic" && set !== "fresh" && set !== "restart")
    return yield* Effect.die(new Error("--set must be diagnostic, fresh, or restart"));
  const backendPort = yield* allocatePort();
  const inspectorPort = yield* allocatePort();
  yield* Effect.logInfo("Packing and installing the candidate fixture");
  const fixture = yield* preparePackedFixture(
    repository,
    process.argv.includes("--no-examples") ? "no-examples" : "examples",
  );
  const benchmark = yield* ReadinessBenchmark;
  const requestFor = Effect.fn("ReadinessBenchmark.requestFor")(function* (projectRoot: string) {
    return {
      projectRoot,
      environment: {
        ...process.env,
        PORT: String(backendPort),
        RELKIT_INSPECTOR_PORT: String(inspectorPort),
      },
      ...(yield* packedProbeContract(projectRoot, backendPort)),
      deadlineMs: 30_000,
    } satisfies StartRequest;
  });
  const request = yield* requestFor(fixture.projectRoot);
  const preparationAttempt =
    set === "restart" ? yield* benchmarkReportEffect(benchmark, request, 0) : undefined;
  const attempts = yield* Effect.forEach(
    Array.from({ length: count }, (_, index) => index + 1),
    (run) =>
      Effect.gen(function* () {
        const projectRoot =
          set !== "fresh" || run === 1
            ? fixture.projectRoot
            : yield* createPackedProject(
                fixture.temporary,
                fixture.registry,
                `readiness-fresh-${run}`,
                fixture.examples,
              );
        const attempt = yield* benchmarkReportEffect(
          benchmark,
          yield* requestFor(projectRoot),
          run,
        );
        return { ...attempt, projectRoot };
      }),
    { concurrency: 1 },
  );
  const report = packedReport(
    fixture,
    request,
    attempts,
    yield* packedReadinessIdentity(fixture.projectRoot, fixture.artifacts),
    set,
    preparationAttempt,
  );
  const path = resolve(
    repository,
    option(
      "--output",
      `openspec/changes/fast-generated-dev-readiness/evidence/candidate-packed${fixture.examples === "no-examples" ? "-no-examples" : ""}.json`,
    ),
  );
  yield* (yield* BenchmarkNative).report(path, JSON.stringify(report, null, 2) + "\n");
  yield* Effect.logInfo("Packed candidate recorded", { path, summary: report.summary });
});

/**
 * Reads a driver setting without changing the measured command or project.
 * @param name - Literal driver flag.
 * @param fallback - Explicit default when the flag is omitted.
 * @returns Supplied option value or the documented default.
 */
function option(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : (process.argv[index + 1] ?? fallback);
}

/**
 * Builds diagnostic evidence without changing or omitting any measured attempt.
 * @param fixture - Actual outside-workspace packed installation identity.
 * @param request - Complete response contract used by every measured launch.
 * @param attempts - All launched attempts, including failed acquisition or cleanup.
 * @param identity - Captured executable and package identities of the installed candidate.
 * @returns Serializable report whose statistics retain strict per-run failure policy.
 */
function packedReport(
  fixture: Effect.Success<ReturnType<typeof preparePackedFixture>>,
  request: StartRequest,
  attempts: readonly (Effect.Success<ReturnType<typeof benchmarkReportEffect>> & {
    readonly projectRoot: string;
  })[],
  identity: Effect.Success<ReturnType<typeof packedReadinessIdentity>>,
  set: "diagnostic" | "fresh" | "restart",
  preparationAttempt?: Effect.Success<ReturnType<typeof benchmarkReportEffect>>,
) {
  return {
    protocol: "relkit.dev-readiness",
    version: 1,
    mode: set === "diagnostic" ? "candidate-diagnostic" : "candidate-certification",
    set,
    command: "bun dev",
    environment: benchmarkHostIdentity(),
    fixture,
    identity,
    request: {
      projectRoot: request.projectRoot,
      url: request.url,
      expectedBody: request.expectedBody,
    },
    attempts,
    ...(preparationAttempt === undefined ? {} : { preparationAttempt }),
    summary: candidateSummary(attempts, preparationAttempt),
  };
}

if (import.meta.main)
  await runBenchmarkMain(
    Effect.scoped(main()).pipe(
      Effect.provide(readinessBenchmarkLive.pipe(Layer.provideMerge(benchmarkNativeLive))),
    ),
  );
