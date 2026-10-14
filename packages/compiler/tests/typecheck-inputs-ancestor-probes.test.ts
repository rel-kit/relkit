/** Verifies isolated ancestor discovery cannot grant authority or prevent a contained receipt. */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "@effect/vitest";
import { Cause, Effect, Exit } from "effect";
import { TypecheckInputs } from "../src/typecheck-inputs.service.js";

it.effect("ignores ancestor node_modules probes but rejects an explicit external config read", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const parent = yield* Effect.acquireRelease(
        Effect.promise(() => mkdtemp(join(tmpdir(), "relkit-ancestor-probes-"))),
        (root) => Effect.promise(() => rm(root, { recursive: true, force: true })),
      );
      const root = join(parent, "project");
      yield* Effect.promise(async () => {
        await mkdir(root);
        await mkdir(join(parent, "node_modules"));
        await writeFile(join(parent, "tsconfig.json"), "{}");
      });
      const journal = yield* TypecheckInputs.make(root);
      expect(journal.system.directoryExists?.(parent)).toBe(true);
      expect(journal.system.directoryExists?.(join(parent, "node_modules"))).toBe(false);
      expect(journal.system.getDirectories(join(parent, "node_modules"))).toEqual([]);
      expect(yield* journal.evidence).toEqual([]);
      expect(journal.system.readFile(join(parent, "tsconfig.json"))).toBeUndefined();
      const exit = yield* Effect.exit(journal.evidence);
      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit))
        expect(Cause.squash(exit.cause)).toMatchObject({ reason: "escaped" });
    }),
  ),
);
