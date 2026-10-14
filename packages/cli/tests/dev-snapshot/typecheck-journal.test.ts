/** Connects the real TypeScript journal to snapshot bytes, including declaration-only package changes. */
import { mkdir, writeFile, stat, utimes } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "@effect/vitest";
import { Effect, Exit } from "effect";
import { TypecheckInputs, typecheckProjectEffect } from "@relkit/compiler";
import { SnapshotFiles, snapshotFilesLive } from "../../src/dev-snapshot/snapshot-files.service.js";
import {
  captureSnapshotTypecheckInputs,
  verifySnapshotTypecheckInputs,
} from "../../src/dev-snapshot/snapshot-typecheck-inputs.js";
import { directory } from "./typecheck-input-fixture.js";

it.effect("invalidates declaration-only edits from the actual native check journal", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const root = yield* directory;
      const declaration = join(root, "node_modules/fixture/index.d.ts");
      const text =
        "export declare const value: number; declare global { interface Array<T> {} interface Boolean {} interface Function {} interface CallableFunction {} interface NewableFunction {} interface IArguments {} interface Number {} interface Object {} interface RegExp {} interface String {} }";
      yield* Effect.promise(async () => {
        await mkdir(join(root, "src"), { recursive: true });
        await mkdir(join(root, "node_modules/fixture"), { recursive: true });
        await writeFile(
          join(root, "tsconfig.json"),
          JSON.stringify({
            compilerOptions: {
              noLib: true,
              strict: true,
              module: "esnext",
              moduleResolution: "bundler",
              types: [],
            },
            include: ["src"],
          }),
        );
        await writeFile(
          join(root, "node_modules/fixture/package.json"),
          '{"name":"fixture","version":"1.0.0","types":"index.d.ts"}',
        );
        await writeFile(
          join(root, "src/app.ts"),
          'import { value } from "fixture"; const result: number = value;',
        );
        await writeFile(declaration, text);
      });
      const journal = yield* TypecheckInputs.make(root);
      expect(
        yield* typecheckProjectEffect(root).pipe(Effect.provideService(TypecheckInputs, journal)),
      ).toEqual([]);
      const files = yield* SnapshotFiles;
      const inputs = yield* captureSnapshotTypecheckInputs(files, root, yield* journal.evidence);
      expect(inputs.files.some((file) => file.path === "node_modules/fixture/index.d.ts")).toBe(
        true,
      );
      yield* verifySnapshotTypecheckInputs(files, root, inputs);
      const before = yield* Effect.promise(() => stat(declaration));
      yield* Effect.promise(async () => {
        await writeFile(declaration, text.replace("value: number", "value: string"));
        await utimes(declaration, before.atime, before.mtime);
      });
      expect(
        Exit.isFailure(yield* Effect.exit(verifySnapshotTypecheckInputs(files, root, inputs))),
      ).toBe(true);
    }),
  ).pipe(Effect.provide(snapshotFilesLive)),
);

it.effect("retains negative probes inside an installed package when its consumed bytes match", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const root = yield* directory,
        text = "export declare const value: number;";
      yield* Effect.promise(async () => {
        await mkdir(join(root, "node_modules/fixture"), { recursive: true });
        await writeFile(join(root, "node_modules/fixture/index.d.ts"), text);
      });
      const journal = yield* TypecheckInputs.make(root);
      journal.system.readFile(join(root, "node_modules/fixture/index.d.ts"));
      journal.system.fileExists(join(root, "node_modules/fixture/index.ts"));
      const files = yield* SnapshotFiles;
      const inputs = yield* captureSnapshotTypecheckInputs(files, root, yield* journal.evidence);
      yield* verifySnapshotTypecheckInputs(files, root, inputs);
      yield* Effect.promise(() =>
        writeFile(join(root, "node_modules/fixture/index.ts"), "export const value = true;"),
      );
      expect(
        Exit.isFailure(yield* Effect.exit(verifySnapshotTypecheckInputs(files, root, inputs))),
      ).toBe(true);
    }),
  ).pipe(Effect.provide(snapshotFilesLive)),
);
