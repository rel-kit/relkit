/**
 * Exercises prepared packaging against the real pinned Effect public namespaces.
 * Built code runs in its own joined Bun child, proving service and Layer identity
 * survive narrowing. Unsupported imports retain normal Bun resolution semantics.
 */
import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Effect } from "effect";
import { ownedNativePromise } from "@relkit/cli/internal/tooling";
import { narrowEffectImports, narrowEffectImportPlugin } from "@relkit/cli/internal/tooling";

test("keeps unsupported imports and narrows aliases plus type-only named imports", () => {
  for (const source of [
    'import * as Effect from "effect";',
    'import "effect";',
    'import {} from "effect";',
    'import { missing } from "effect";',
    'export { Effect } from "effect";',
  ])
    expect(narrowEffectImports(source, "fixture.ts")).toBe(source);
  const transformed = narrowEffectImports(
    'import { Effect as E, type Context, pipe as apply } from "effect";',
    "fixture.ts",
  );
  expect(transformed).toContain('import * as E from "effect/Effect";');
  expect(transformed).toContain('import type * as Context from "effect/Context";');
  expect(transformed).toContain('import { pipe as apply } from "effect/Function";');
});

/** Source fixture uses real public namespaces; compiled execution checks their identity. */
const entrySource = `
import { Effect, Context, Layer, pipe } from "effect";
import * as DirectEffect from "effect/Effect";
import * as DirectContext from "effect/Context";
if (Effect.runPromise !== DirectEffect.runPromise || Context.Service !== DirectContext.Service) throw Error("Effect identity split");
class Value extends Context.Service<Value, number>()("test/Value") {}
const result = await Effect.runPromise(pipe(Value, Effect.provide(Layer.succeed(Value, 42))));
if (result !== 42) throw Error("Layer service mismatch");
console.log("same-effect:42");
`;

/** Runs a joined native build/process fixture; its caller owns temporary-root cleanup. */
const checkBundledIdentity = Effect.gen(function* () {
  // Repository-local fixture resolves the same pinned installation; Scope removes only this root.
  const root = yield* Effect.acquireRelease(
    Effect.promise(() => mkdtemp(join(process.cwd(), ".relkit-effect-bundle-"))),
    (root) => Effect.promise(() => rm(root, { recursive: true, force: true })),
  );
  const entry = join(root, "index.ts");
  yield* ownedNativePromise("test.effect-import-source", () => writeFile(entry, entrySource));
  const built = yield* ownedNativePromise("test.effect-import-bundle", () =>
    Bun.build({
      entrypoints: [entry],
      target: "bun",
      format: "esm",
      outdir: root,
      naming: "bundle.js",
      plugins: [narrowEffectImportPlugin()],
    }),
  );
  expect(built.success).toBe(true);
  const child = yield* Effect.acquireRelease(
    Effect.sync(() =>
      Bun.spawn([process.execPath, join(root, "bundle.js")], {
        stdout: "pipe",
        stderr: "pipe",
      }),
    ),
    (child) =>
      Effect.promise(async () => {
        if (child.exitCode === null) child.kill();
        await child.exited;
      }),
  );
  const [code, stdout, stderr] = yield* ownedNativePromise("test.effect-import-output", () =>
    Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]),
  );
  expect(stderr).toBe("");
  expect(code).toBe(0);
  expect(stdout.trim()).toBe("same-effect:42");
});

test("packaged namespace imports preserve pinned service identity and executable behavior", async () => {
  await Effect.runPromise(Effect.scoped(checkBundledIdentity));
});
