/** Verifies CLI-owned transaction lifecycle behavior through retained creator services, preserving typed failures and awaited fixture cleanup. */

import { expect, it } from "@effect/vitest";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { Cause, Effect, Exit, Layer, Logger } from "effect";
import {
  applyScaffoldPlanEffect,
  scaffoldTransactionLive,
} from "../../src/scaffolding/add-transaction.js";
import { ADD_FAILURE_CODES, AddScaffoldError } from "create-relkit/internal/add-types";
import { GeneratorFileSystem } from "create-relkit/internal/generator-filesystem";
import { GeneratorProcess } from "create-relkit/internal/generator-process";
import {
  GeneratorIoError,
  GeneratorProcessError,
  publicFailure,
} from "create-relkit/internal/generator-errors";
import { generatorCleanupFailures } from "create-relkit/internal/generator-cleanup";
import { memoryFileSystem } from "./generator-services.fixture.js";
import { restoreFilesEffect } from "create-relkit/internal/add-transaction-files";
import {
  ignoredRunnerSetupEffect,
  ignoredRunnerTaskEffect,
  transactionPlan as plan,
} from "./transaction-runner.fixture.js";

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
          new GeneratorProcessError({
            operation: "run",
            cause: primary,
            message: primary.message,
          }),
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
    const setup = yield* ignoredRunnerSetupEffect();
    const { root, started, aborted, settlement, controller } = setup;
    let completed = false;
    const { task } = yield* ignoredRunnerTaskEffect(setup, () => {
      completed = true;
    });
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
