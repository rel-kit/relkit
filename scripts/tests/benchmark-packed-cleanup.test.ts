import { access, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { expect, test, vi } from "vitest";
import { measurePackedSet } from "../dev-readiness/benchmark-packed-measure.js";
import { ReadinessBenchmark } from "../dev-readiness/benchmark.service.js";

vi.mock("../dev-readiness/packed-fixture.js", () => ({
  createPackedProject: (temporary: string, _registry: string, name: string) =>
    Effect.promise(async () => {
      const path = join(temporary, name);
      await mkdir(path);
      return path;
    }),
}));

vi.mock("../dev-readiness/packed-probe-contract.js", () => ({
  packedProbeContract: () =>
    Effect.succeed({
      url: "http://127.0.0.1:3000/hello",
      expectedStatus: 200,
      expectedBody: "ready",
    }),
}));

for (const cleanup of [false, true]) {
  test(`fresh cleanup=${cleanup} retains every sample and preserves the identity fixture`, async () => {
    const temporary = await mkdtemp(join(tmpdir(), "relkit-packed-cleanup-"));
    const projectRoot = join(temporary, "readiness-baseline");
    try {
      await mkdir(projectRoot);
      const measured: string[] = [];
      const result = await Effect.runPromise(
        measurePackedSet(
          {
            temporary,
            projectRoot,
            version: "9.9.9",
            registry: "http://127.0.0.1:1",
            examples: "examples",
            artifacts: [],
          },
          "fresh",
          3,
          3000,
          3210,
          cleanup,
        ).pipe(
          Effect.provideService(ReadinessBenchmark, {
            measure: (request) =>
              Effect.promise(async () => {
                await access(request.projectRoot);
                measured.push(request.projectRoot);
                return {
                  outcome: measured.length === 2 ? ("timeout" as const) : ("response" as const),
                  durationMs: 100,
                  exitCode: undefined,
                  output: "ready",
                };
              }),
          }),
        ),
      );
      expect(result.attempts.map((attempt) => attempt.projectRoot)).toEqual(measured);
      expect(result.attempts.map((attempt) => attempt.run)).toEqual([1, 2, 3]);
      expect(result.attempts.map((attempt) => attempt.sample?.outcome)).toEqual([
        "response",
        "timeout",
        "response",
      ]);
      await expect(access(projectRoot)).resolves.toBeUndefined();
      for (const path of measured.slice(1)) {
        if (cleanup) await expect(access(path)).rejects.toThrow();
        else await expect(access(path)).resolves.toBeUndefined();
      }
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });
}
