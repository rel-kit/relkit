/** Captures original packed response contracts and retains every sequential native measurement and separate restart preparation. */
import { Effect } from "effect";
import { rm } from "node:fs/promises";
import { ownedNativePromise } from "@relkit/cli/internal/tooling";
import { createPackedProject, type preparePackedFixture } from "./packed-fixture.js";
import { ReadinessBenchmark } from "./benchmark.service.js";
import { benchmarkReportEffect } from "./benchmark-report.js";
import { packedProbeContract } from "./packed-probe-contract.js";
import type { StartRequest } from "./benchmark.types.js";

/** Captures the same actual response contract and ports before each measured native launch.
 * @param projectRoot - Actual outside-workspace packed project.
 * @param backendPort - Freed loopback backend port allocated before measurement.
 * @param inspectorPort - Freed loopback inspector port allocated before measurement.
 * @returns Original native start request, retaining its thirty-second terminal deadline.
 */
export const packedStartRequest = Effect.fn("ReadinessBenchmark.requestFor")(function* (
  projectRoot: string,
  backendPort: number,
  inspectorPort: number,
) {
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

/** Measures every sequential launch without dropping setup, preparation or failed attempts.
 * @param fixture - Original packed closure, registry and installed default-project identity.
 * @param set - Explicit diagnostic, fresh or restart policy.
 * @param count - Validated number of retained measured attempts.
 * @param backendPort - Original freed loopback backend port.
 * @param inspectorPort - Original freed loopback inspector port.
 * @param cleanup - Release completed fresh fixtures after retaining their measured result.
 * @returns All measured attempts and the separate original restart preparation.
 */
export const measurePackedSet = Effect.fn("ReadinessBenchmark.measurePackedSet")(function* (
  fixture: Effect.Success<ReturnType<typeof preparePackedFixture>>,
  set: "diagnostic" | "fresh" | "restart",
  count: number,
  backendPort: number,
  inspectorPort: number,
  cleanup = false,
) {
  const benchmark = yield* ReadinessBenchmark;
  const request = yield* packedStartRequest(fixture.projectRoot, backendPort, inspectorPort);
  let preparationAttempt: Effect.Success<ReturnType<typeof benchmarkReportEffect>> | undefined;
  if (set === "restart") preparationAttempt = yield* benchmarkReportEffect(benchmark, request, 0);
  const attempts = yield* Effect.forEach(
    Array.from({ length: count }, (_, index) => index + 1),
    (run) =>
      Effect.gen(function* () {
        let projectRoot = fixture.projectRoot;
        if (set === "fresh" && run !== 1)
          projectRoot = yield* createPackedProject(
            fixture.temporary,
            fixture.registry,
            `readiness-fresh-${run}`,
            fixture.examples,
          );
        const attempt = yield* benchmarkReportEffect(
          benchmark,
          yield* packedStartRequest(projectRoot, backendPort, inspectorPort),
          run,
        );
        if (cleanup && set === "fresh" && run !== 1)
          yield* ownedNativePromise("benchmark.cleanupFreshProject", () =>
            rm(projectRoot, { recursive: true, force: true }),
          );
        return { ...attempt, projectRoot };
      }),
    { concurrency: 1 },
  );
  return { attempts, preparationAttempt };
});
