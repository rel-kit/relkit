import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { expect, test, vi } from "vitest";
import { measurePackedSet } from "../dev-readiness/benchmark-packed-measure.js";
import { ReadinessBenchmark } from "../dev-readiness/benchmark.service.js";
import { createPackedProject } from "../dev-readiness/packed-fixture.js";

vi.mock("../dev-readiness/packed-fixture.js", () => ({
  createPackedProject: vi.fn((temporary: string, _registry: string, name: string) =>
    Effect.promise(async () => {
      const path = join(temporary, name);
      await mkdir(path);
      return path;
    }),
  ),
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

test("checkpoints survive a later project-creation failure", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "relkit-packed-checkpoint-"));
  const projectRoot = join(temporary, "readiness-baseline");
  const path = join(temporary, "progress.json");
  const create = vi.mocked(createPackedProject);
  const previous = create.getMockImplementation()!;
  create.mockImplementation((...args) =>
    args[2] === "readiness-fresh-3"
      ? Effect.promise(async () => {
          throw new Error("creation failed");
        })
      : previous(...args),
  );
  try {
    await mkdir(projectRoot);
    const program = measurePackedSet(
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
      true,
      (attempts) => Effect.promise(() => writeFile(path, JSON.stringify(attempts))),
    ).pipe(
      Effect.provideService(ReadinessBenchmark, {
        measure: () =>
          Effect.succeed({
            outcome: "response" as const,
            durationMs: 100,
            exitCode: undefined,
            output: "ready",
          }),
      }),
    );
    await expect(Effect.runPromise(program)).rejects.toThrow("creation failed");
    const retained = JSON.parse(await readFile(path, "utf8"));
    expect(retained.map((attempt: { run: number }) => attempt.run)).toEqual([1, 2]);
    expect(
      retained.every(
        (attempt: { sample: { outcome: string } }) => attempt.sample.outcome === "response",
      ),
    ).toBe(true);
  } finally {
    create.mockImplementation(previous);
    await rm(temporary, { recursive: true, force: true });
  }
});
