/**
 * Exercises the real TypeScript host journal through prepared and ordinary checks.
 * Isolated fixtures contain their own declarations; each test joins directory
 * removal. Negative module probes and changed reads prove why source-file lists
 * alone cannot certify a reusable check result.
 */
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "@effect/vitest";
import { Cause, Effect, Exit } from "effect";
import { TypecheckInputs } from "../src/typecheck-inputs.service.js";
import { typecheckInputHost } from "../src/typecheck-inputs-native.js";
import { typecheckProjectEffect } from "../src/project-typecheck.js";

/** Acquires only this test's isolated parent and removes it after checking finishes. */
const directory = Effect.acquireRelease(
  Effect.promise(() => mkdtemp(join(tmpdir(), "relkit-check-inputs-"))),
  (root) => Effect.promise(() => rm(root, { recursive: true, force: true })),
);

/**
 * Writes a self-contained project without depending on host-global declaration files.
 * @param root - Test-owned project directory.
 * @returns Completed project/declaration fixture writes.
 */
function project(root: string) {
  return Effect.promise(async () => {
    await mkdir(join(root, "src"), { recursive: true });
    await mkdir(join(root, "node_modules/fixture"), { recursive: true });
    await writeFile(join(root, "package.json"), '{"type":"module"}');
    await writeFile(
      join(root, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          noLib: true,
          strict: true,
          moduleResolution: "bundler",
          module: "esnext",
          types: [],
        },
        include: ["src"],
      }),
    );
    await writeFile(join(root, "node_modules/fixture/package.json"), '{"types":"index.d.ts"}');
    await writeFile(
      join(root, "node_modules/fixture/index.d.ts"),
      "export declare const value: number;",
    );
    await writeFile(
      join(root, "src/app.ts"),
      'import { value } from "fixture"; const result: string = value;',
    );
  });
}

it.effect("records consumed declaration bytes and missing shadow resolution paths", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const root = yield* directory;
      yield* project(root);
      const journal = yield* TypecheckInputs.make(root);
      const diagnostics = yield* typecheckProjectEffect(root).pipe(
        Effect.provideService(TypecheckInputs, journal),
      );
      expect(diagnostics.some((diagnostic) => diagnostic.code === "TS2322")).toBe(true);
      const witnesses = yield* journal.evidence;
      expect(witnesses).not.toContainEqual(
        expect.objectContaining({ kind: "read", path: "node_modules/fixture/index.d.ts" }),
      );
      expect(witnesses).toContainEqual({
        kind: "fileExists",
        path: "node_modules/fixture.ts",
        exists: false,
      });
      expect(JSON.stringify(witnesses)).not.toContain(root);
    }),
  ),
);

it.effect("rejects inconsistent repeated reads without persisting source text", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const root = yield* directory;
      yield* project(root);
      const journal = yield* TypecheckInputs.make(root);
      const path = join(root, "src/app.ts");
      expect(journal.system.readFile(path)).toBeDefined();
      yield* Effect.promise(() => writeFile(path, "export const changed = true;"));
      expect(journal.system.readFile(path)).toBeDefined();
      const exit = yield* Effect.exit(journal.evidence);
      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit))
        expect(Cause.squash(exit.cause)).toMatchObject({
          _tag: "TypecheckInputError",
          reason: "changed",
        });
    }),
  ),
);

it.effect("isolates ancestor dependencies while ordinary checks retain native resolution", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const parent = yield* directory;
      const root = join(parent, "project");
      yield* project(root);
      yield* Effect.promise(async () => {
        await mkdir(join(parent, "node_modules/ancestor"), { recursive: true });
        await writeFile(
          join(parent, "node_modules/ancestor/index.d.ts"),
          "export declare const value: string;",
        );
        await writeFile(
          join(root, "src/app.ts"),
          'import { value } from "ancestor"; const result: string = value;',
        );
      });
      const ordinary = yield* typecheckProjectEffect(root);
      expect(ordinary.some((diagnostic) => diagnostic.code === "TS2307")).toBe(false);
      const journal = yield* TypecheckInputs.make(root);
      const isolated = yield* typecheckProjectEffect(root).pipe(
        Effect.provideService(TypecheckInputs, journal),
      );
      expect(isolated.some((diagnostic) => diagnostic.code === "TS2307")).toBe(true);
      expect(JSON.stringify(yield* journal.evidence)).not.toContain(parent);
    }),
  ),
);

it.effect("keeps linked dependency evidence under dependency capture ownership", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const parent = yield* directory;
      const root = join(parent, "project");
      const dependency = join(parent, "linked-dependency");
      yield* project(root);
      yield* Effect.promise(async () => {
        await mkdir(dependency, { recursive: true });
        await writeFile(join(dependency, "package.json"), '{"types":"index.d.ts"}');
        await writeFile(join(dependency, "index.d.ts"), "export declare const linked: string;");
        await symlink(dependency, join(root, "node_modules/linked"));
        await writeFile(
          join(root, "src/app.ts"),
          'import { linked } from "linked"; const result: string = linked;',
        );
      });
      const journal = yield* TypecheckInputs.make(root);
      const diagnostics = yield* typecheckProjectEffect(root).pipe(
        Effect.provideService(TypecheckInputs, journal),
      );
      expect(diagnostics.some((diagnostic) => diagnostic.code === "TS2307")).toBe(false);
      const witnesses = yield* journal.evidence;
      expect(witnesses).not.toContainEqual(
        expect.objectContaining({ kind: "read", path: "node_modules/linked/index.d.ts" }),
      );
      expect(JSON.stringify(witnesses)).not.toContain(dependency);
    }),
  ),
);

it.effect("resolves the standard library from the relocatable project installation", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const root = yield* directory;
      yield* project(root);
      const journal = yield* TypecheckInputs.make(root);
      expect(journal.system.getExecutingFilePath()).toBe(
        join(root, "node_modules/typescript/lib/typescript.js"),
      );
      const host = typecheckInputHost(
        {
          root,
          physicalRoot: root,
          dependencyAliases: new Map(),
          witnesses: new Map(),
          failure: undefined,
        },
        journal.system,
        { target: 9 },
      );
      expect(host.getDefaultLibFileName({ target: 9 })).toBe(
        join(root, "node_modules/typescript/lib/lib.es2022.full.d.ts"),
      );
      expect(host.getDefaultLibLocation?.()).toBe(join(root, "node_modules/typescript/lib"));
    }),
  ),
);
