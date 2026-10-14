/** Reproduces whole-package native aliases through a transitive linked declaration re-export. */
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "@effect/vitest";
import { Cause, Effect, Exit } from "effect";
import { TypecheckInputs } from "../src/typecheck-inputs.service.js";
import { typecheckProjectEffect } from "../src/project-typecheck.js";

const directory = Effect.acquireRelease(
  Effect.promise(() => mkdtemp(join(tmpdir(), "relkit-linked-reexports-"))),
  (parent) => Effect.promise(() => rm(parent, { recursive: true, force: true })),
);

/**
 * Creates an installed bridge with a transitive linked package and relative declaration export.
 * @param parent - Test-owned parent directory.
 * @returns Project root after its explicit installed links exist.
 */
const fixture = Effect.fn("Typecheck.linkedFixture")((parent: string) =>
  Effect.promise(async () => {
    const root = join(parent, "project");
    const bridge = join(parent, "bridge");
    const leaf = join(parent, "leaf");
    await mkdir(join(root, "src"), { recursive: true });
    await mkdir(join(root, "node_modules"), { recursive: true });
    await mkdir(join(bridge, "node_modules"), { recursive: true });
    await mkdir(join(leaf, "dist"), { recursive: true });
    await writeFile(
      join(root, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          noLib: true,
          module: "esnext",
          moduleResolution: "bundler",
          types: [],
          skipLibCheck: true,
        },
        include: ["src"],
      }),
    );
    await writeFile(
      join(root, "src/app.ts"),
      'import { value } from "bridge"; const result: string = value;',
    );
    await writeFile(join(bridge, "package.json"), '{"types":"index.d.ts"}');
    await writeFile(join(bridge, "index.d.ts"), 'export * from "leaf";');
    await writeFile(join(leaf, "package.json"), '{"types":"dist/index.d.ts"}');
    await writeFile(join(leaf, "dist/index.d.ts"), 'export * from "./value.js";');
    await writeFile(join(leaf, "dist/value.d.ts"), "export declare const value: number;");
    await symlink(bridge, join(root, "node_modules/bridge"));
    await symlink(leaf, join(bridge, "node_modules/leaf"));
    return root;
  }),
);

it.effect(
  "preserves relative transitive declaration exports while refusing unsafe prepared reuse",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const root = yield* fixture(yield* directory);
        const ordinary = yield* typecheckProjectEffect(root);
        const journal = yield* TypecheckInputs.make(root);
        const isolated = yield* typecheckProjectEffect(root).pipe(
          Effect.provideService(TypecheckInputs, journal),
        );
        expect(ordinary.some((diagnostic) => diagnostic.code === "TS2322")).toBe(true);
        expect(isolated.some((diagnostic) => diagnostic.code === "TS2322")).toBe(true);
        expect(isolated.some((diagnostic) => diagnostic.code === "TS2305")).toBe(false);
        const exit = yield* Effect.exit(journal.evidence);
        expect(Exit.isFailure(exit)).toBe(true);
        if (Exit.isFailure(exit))
          expect(Cause.squash(exit.cause)).toMatchObject({ reason: "escaped" });
      }),
    ),
);
