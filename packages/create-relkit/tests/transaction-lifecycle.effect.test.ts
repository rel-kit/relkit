import { expect, it } from "@effect/vitest";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Cause, Effect, Exit, Layer, Logger } from "effect";
import {
  applyScaffoldPlan,
  applyScaffoldPlanEffect,
  scaffoldTransactionLive,
} from "../src/add-transaction.js";
import { normalizeAddRequest } from "../src/add-options.js";
import { ADD_FAILURE_CODES, AddScaffoldError, type ScaffoldPlan } from "../src/add-types.js";
import { GeneratorFileSystem } from "../src/generator-filesystem.js";
import { GeneratorProcess } from "../src/generator-process.js";
import { GeneratorIoError, GeneratorProcessError, publicFailure } from "../src/generator-errors.js";
import { generatorCleanupFailures } from "../src/generator-cleanup.js";
import { memoryFileSystem } from "./generator-services.fixture.js";
import { restoreFilesEffect } from "../src/add-transaction-files.js";

it.effect("settles every failed restoration and retains directory cleanup evidence", () =>
  Effect.gen(function* () {
    const fixture = yield* memoryFileSystem({});
    const attempted: string[] = [];
    const first = new Error("First restoration failed.");
    const second = new Error("Second restoration failed.");
    const directory = Object.assign(new Error("Owned directory cannot be removed."), {
      code: "EACCES",
    });
    const service = Layer.succeed(GeneratorFileSystem, {
      ...fixture.service,
      rename: (_from: string, to: string) => {
        attempted.push(to);
        const cause = to.endsWith("b.ts") ? first : second;
        return Effect.fail(
          new GeneratorIoError({ operation: "rename", cause, message: cause.message }),
        );
      },
      removeDirectory: (path: string) => {
        const cause = path.endsWith("absent")
          ? Object.assign(new Error("Absent"), { code: "ENOENT" })
          : path.endsWith("nonempty")
            ? Object.assign(new Error("Nonempty"), { code: "ENOTEMPTY" })
            : directory;
        return Effect.fail(
          new GeneratorIoError({ operation: "removeDirectory", cause, message: cause.message }),
        );
      },
    });
    const exit = yield* Effect.exit(
      restoreFilesEffect(
        [
          { path: "/memory/a.ts", content: new Uint8Array([1]) },
          { path: "/memory/b.ts", content: new Uint8Array([2]) },
        ],
        new Set(["/memory/absent", "/memory/nonempty", "/memory/denied"]),
      ),
    ).pipe(Effect.provide(service), Effect.provide(Logger.layer([])));
    expect(attempted).toEqual(["/memory/b.ts", "/memory/a.ts"]);
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) expect(publicFailure(Cause.squash(exit.cause))).toBe(first);
    expect(generatorCleanupFailures(first).map((failure) => failure.cause)).toEqual([
      second,
      directory,
    ]);
  }),
);

it.effect("retains primary error identity and exposes rollback failure separately", () =>
  Effect.gen(function* () {
    const root = "/memory/rollback";
    const fixture = yield* memoryFileSystem({ [root + "/value.ts"]: "original" });
    let renames = 0;
    const secondary = new Error("Restoration rename failed.");
    const fs = Layer.succeed(GeneratorFileSystem, {
      ...fixture.service,
      rename: (from: string, to: string) =>
        ++renames === 2
          ? Effect.fail(
              new GeneratorIoError({
                operation: "rename",
                cause: secondary,
                message: secondary.message,
              }),
            )
          : fixture.service.rename(from, to),
    });
    const primary = new AddScaffoldError(ADD_FAILURE_CODES.validation, "Check failed.");
    const process = Layer.succeed(GeneratorProcess, {
      run: () =>
        Effect.fail(
          new GeneratorProcessError({ operation: "run", cause: primary, message: primary.message }),
        ),
      which: () => Effect.succeed("relkit"),
    });
    const exit = yield* Effect.exit(
      applyScaffoldPlanEffect(plan(root), { relkitExecutable: "relkit" }).pipe(
        Effect.provide(scaffoldTransactionLive),
        Effect.provide(Layer.merge(fs, process)),
        Effect.provide(Logger.layer([])),
      ),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      expect(publicFailure(Cause.squash(exit.cause))).toBe(primary);
      expect(generatorCleanupFailures(primary)).toHaveLength(1);
      expect(generatorCleanupFailures(primary)[0]?.operation).toBe("rollback");
    }
    expect([...(yield* fixture.snapshot).keys()].some((path) => path.includes(".tmp"))).toBe(false);
  }),
);

it.live("awaits an ignored-signal runner before restoring files and both lock formats", () =>
  Effect.gen(function* () {
    const root = yield* Effect.acquireRelease(
      Effect.promise(() => mkdtemp(join(tmpdir(), "relkit-runner-settlement-"))),
      (path) => Effect.promise(() => rm(path, { recursive: true, force: true })),
    );
    yield* Effect.promise(() =>
      Promise.all([
        writeFile(join(root, "value.ts"), "original"),
        writeFile(join(root, "bun.lock"), "lock-original"),
        writeFile(join(root, "bun.lockb"), "binary-original"),
      ]),
    );
    const started = Promise.withResolvers<void>();
    const aborted = Promise.withResolvers<void>();
    const settlement = Promise.withResolvers<void>();
    yield* Effect.acquireRelease(Effect.void, () => Effect.sync(() => settlement.resolve()));
    const controller = new AbortController();
    let completed = false;
    const task = applyScaffoldPlan(
      {
        ...plan(root),
        dependencies: { effect: "4.0.1" },
        request: { ...plan(root).request, install: true },
      },
      {
        signal: controller.signal,
        commandRunner: async (_command, _cwd, signal) => {
          signal?.addEventListener("abort", () => aborted.resolve(), { once: true });
          started.resolve();
          await settlement.promise;
          await writeFile(join(root, "bun.lock"), "late-lock-mutation");
          await writeFile(join(root, "bun.lockb"), "late-binary-mutation");
          return { exitCode: 0 };
        },
      },
    ).then(
      (value) => {
        completed = true;
        return value;
      },
      (error: unknown) => {
        completed = true;
        return error;
      },
    );
    yield* Effect.promise(() => started.promise);
    controller.abort();
    yield* Effect.promise(() => aborted.promise);
    expect(completed).toBe(false);
    expect(yield* Effect.promise(() => readFile(join(root, "value.ts"), "utf8"))).toBe("updated");
    settlement.resolve();
    const failure = yield* Effect.promise(() => task);
    expect(failure).toBeInstanceOf(AddScaffoldError);
    expect(failure).toMatchObject({ code: "RELKIT_ADD_CANCELLED", exitCode: 130 });
    expect(yield* Effect.promise(() => readFile(join(root, "value.ts"), "utf8"))).toBe("original");
    expect(yield* Effect.promise(() => readFile(join(root, "bun.lock"), "utf8"))).toBe(
      "lock-original",
    );
    expect(yield* Effect.promise(() => readFile(join(root, "bun.lockb"), "utf8"))).toBe(
      "binary-original",
    );
    expect(
      (yield* Effect.promise(() => readdir(root))).filter((path) => path.endsWith(".tmp")),
    ).toEqual([]);
  }),
);

/**
 * Creates a concrete update transaction used to probe rollback authority.
 * @param root - Test project root.
 * @returns A plan with unchanged public result and request shapes.
 */
function plan(root: string): ScaffoldPlan {
  return {
    request: normalizeAddRequest(["function", "Sample", "--project-root", root, "--no-install"]),
    projectRoot: root,
    operations: [{ path: "value.ts", action: "update", content: "updated" }],
    dependencies: {},
    artifacts: [],
    profiles: [],
    warnings: [],
    nextSteps: [],
  };
}
