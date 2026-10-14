/** Loads actual generated manifest bindings and invokes identity-bearing original SDK descriptors at their flat or grouped source paths. */
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { cp } from "node:fs/promises";
import { Effect, Schema } from "effect";
import { invokeFunction } from "../../packages/engine/src/index.js";
import { scaffoldNative } from "../../scripts/scaffold-native.js";

/**
 * Invokes an actual generated registry entry without cloning its descriptor or parsing input before the native engine.
 * @param root - Owned application source and generated-output root.
 * @param grouped - Current physical service layout.
 * @returns Native schema-validated output under the same inferred function ID.
 */
export const executeGroupedManifest = Effect.fn("GroupedRuntime.execute")(
  (root: string, grouped: boolean) =>
    scaffoldNative("grouped.manifest.invoke", async () => {
      const cohort = join(root, grouped ? ".relkit/paired-grouped" : ".relkit/paired-flat");
      await cp(join(root, ".relkit/generated"), cohort, {
        recursive: true,
        force: false,
        errorOnExist: true,
      });
      const namespace = await import(pathToFileURL(join(cohort, "runtime.manifest.ts")).href);
      const manifest = Reflect.get(namespace, "runtimeManifest");
      if (typeof manifest !== "object" || manifest === null)
        throw new Error("Native generated manifest is missing");
      const functions = Reflect.get(manifest, "functions"),
        targets = Reflect.get(manifest, "targets");
      if (
        typeof functions !== "object" ||
        functions === null ||
        typeof targets !== "object" ||
        targets === null
      )
        throw new Error("Native generated execution registries are missing");
      const target = Reflect.get(targets, "hello.hello");
      if ((typeof target !== "object" || target === null) && typeof target !== "function")
        throw new Error("Resolved native function ID is missing");
      const original = await import(
        pathToFileURL(
          join(root, grouped ? "src/services/hello" : "src/hello", "functions/hello.function.ts"),
        ).href
      );
      assert.equal(
        target,
        original.default,
        "Generated execution must retain the original descriptor object",
      );
      assert.equal(Reflect.get(functions, "hello.hello"), Reflect.get(target, "handler"));
      if (typeof Reflect.get(target, "handler") !== "function")
        throw new Error("Original native handler is missing");
      const native = target as Parameters<typeof invokeFunction>[0];
      return invokeOriginalTarget(native);
    }),
);

/**
 * Executes the native descriptor under its compiler-bound ID and retains the engine's schema validation.
 * @param target - Original generated target validated at the dynamic manifest boundary.
 * @returns The controlled SDK result after invocation and completion instrumentation settle.
 */
async function invokeOriginalTarget(target: Parameters<typeof invokeFunction>[0]) {
  let functionId: string | undefined;
  const value = await invokeFunction(
    target,
    {},
    {
      hooks: {
        onCompletion: (event) => {
          functionId = event.record.functionId;
        },
      },
    },
  );
  assert.equal(
    functionId,
    "hello.hello",
    "Native invocation must execute under the compiler-resolved logical ID",
  );
  return Schema.decodeUnknownSync(Schema.String)(value);
}
