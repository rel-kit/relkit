/**
 * Exercises the CLI supervisor with real Bun candidates and temporary dotenv files.
 * Each case owns its children and directory; responses prove which environment
 * reached the candidate rather than merely observing a watcher notification.
 */
import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect, Schedule } from "effect";
import { cliPromise } from "../../src/cli-errors.js";
import { CliDevSupervisor, devSupervisorLayer } from "../../src/services/dev-supervisor.service.js";
import { isSnapshotEpochPathRelevant } from "../../src/dev-snapshot/snapshot-epoch-path.js";

/** Owns one native fixture root until all candidates close. */
const fixture = Effect.acquireRelease(
  cliPromise("test.environment.root", () => mkdtemp(join(tmpdir(), "relkit-dev-environment-"))),
  (root) => cliPromise("test.environment.remove", () => rm(root, { recursive: true, force: true })),
);

/**
 * Starts a candidate that exposes only controlled nonsecret fixture values.
 * @param root - Exclusively owned project root.
 * @param generation - Distinct native candidate identity.
 * @returns The environment observed through the live candidate HTTP boundary.
 */
const candidateEnvironment = Effect.fn("EnvironmentTest.candidate")(function* (
  root: string,
  generation: number,
) {
  const sdk = yield* CliDevSupervisor;
  const candidate = yield* Effect.acquireRelease(
    sdk.start({
      projectRoot: root,
      token: { sourceToken: generation, generationToken: generation },
      environment: { OVERRIDE_VALUE: "explicit" },
      compile: async ({ outputDirectory }) => {
        await writeFile(
          join(outputDirectory, "server.js"),
          "Bun.serve({port:Number(process.env.PORT),fetch:()=>Response.json({value:process.env.RECOVERY_VALUE??null,override:process.env.OVERRIDE_VALUE,token:process.env.RELKIT_SOURCE_TOKEN})});",
        );
        return { entrypoint: "server.js" };
      },
    }),
    (candidate) => sdk.dispose(candidate),
  );
  return yield* cliPromise("test.environment.http", async () => {
    const response = await fetch(`http://127.0.0.1:${candidate.port}`);
    return response.text();
  }).pipe(Effect.retry({ schedule: Schedule.spaced(10), times: 100 }));
});

test(
  "candidate generations read dotenv creation, changes and removal without a CLI restart",
  () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const root = yield* fixture;
          const inherited = process.env.RECOVERY_VALUE;
          expect(JSON.parse(yield* candidateEnvironment(root, 1)).value).toBe(inherited ?? null);
          yield* cliPromise("test.environment.create", () =>
            writeFile(join(root, ".env"), "RECOVERY_VALUE=first\nOVERRIDE_VALUE=file\n"),
          );
          expect(JSON.parse(yield* candidateEnvironment(root, 2))).toEqual({
            value: "first",
            override: "explicit",
            token: "2",
          });
          yield* cliPromise("test.environment.edit", () =>
            writeFile(join(root, ".env"), "RECOVERY_VALUE=latest\n"),
          );
          expect(JSON.parse(yield* candidateEnvironment(root, 3)).value).toBe("latest");
          yield* cliPromise("test.environment.delete", () => rm(join(root, ".env")));
          expect(JSON.parse(yield* candidateEnvironment(root, 4)).value).toBeNull();
          expect(process.env.RECOVERY_VALUE === inherited).toBe(true);
        }),
      ).pipe(Effect.provide(devSupervisorLayer)),
    ),
  15_000,
);

test("prepared epochs observe runtime dotenv repairs but ignore examples and generated state", () => {
  for (const path of [
    ".env",
    ".env.local",
    ".env.development",
    ".env.production",
    ".env.test",
    ".env.development.local",
    ".env.production.local",
    ".env.test.local",
  ])
    expect(isSnapshotEpochPathRelevant(path), path).toBe(true);
  for (const path of [".env.example", ".env.sample", ".relkit/state/file", ".git/index"])
    expect(isSnapshotEpochPathRelevant(path), path).toBe(false);
});

test("application preloads execute once in the candidate and never in the dotenv helper", () =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const root = yield* fixture;
        yield* cliPromise("test.preload.setup", async () => {
          await writeFile(join(root, ".env"), "RECOVERY_VALUE=with-preload\n");
          await writeFile(join(root, "bunfig.toml"), 'preload=["./preload.ts"]\n');
          await writeFile(
            join(root, "preload.ts"),
            `
            import {appendFileSync} from "node:fs";
            appendFileSync(${JSON.stringify(join(root, "preload-runs.txt"))}, "run\\n");
            console.log("Application preload");
          `,
          );
        });
        expect(JSON.parse(yield* candidateEnvironment(root, 1)).value).toBe("with-preload");
        expect(
          yield* cliPromise("test.preload.readback", () =>
            readFile(join(root, "preload-runs.txt"), "utf8"),
          ),
        ).toBe("run\n");
      }),
    ).pipe(Effect.provide(devSupervisorLayer)),
  ));
