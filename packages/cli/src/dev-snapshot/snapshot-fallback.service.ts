/**
 * Defers the existing compiler/local-service module closure until the prepared
 * session receives an edit. Layer acquisition uses the caller's session Scope,
 * so compiler workers and leases stay owned across subsequent safe generations.
 */
import { Context, Effect, Layer } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { cliPromise } from "../cli-errors.js";
import type { DevCompilerOptions } from "../commands/dev-local.types.js";
import type { SnapshotFallbackOperations } from "./snapshot-fallback.types.js";

/** Service acquisition imports no compiler or local integration runtime. */
export class SnapshotFallbackCompilers extends Context.Service<
  SnapshotFallbackCompilers,
  SnapshotFallbackOperations
>()("relkit/DevSnapshot/Fallback", {
  make: Effect.sync(() => ({ acquire: acquireFallback }) satisfies SnapshotFallbackOperations),
}) {}

/** Supplies the lazy Bun command-edge composition; tests inject the same safe-compiler contract. */
export const snapshotFallbackLive = Layer.effect(
  SnapshotFallbackCompilers,
  SnapshotFallbackCompilers.make,
);

/**
 * Captures safe compiler authorities in the still-owned development session lifetime.
 * @param options - Current project's local, port and terminal policy.
 * @returns Existing scoped compiler; compilation still checks source before every candidate.
 */
const acquireFallback = Effect.fn("DevSnapshot.acquireFallback")((options: DevCompilerOptions) =>
  observeExecution(
    "cli",
    "dev.snapshot.fallback.acquire",
    Effect.gen(function* () {
      const modules = yield* cliPromise("dev.snapshot.fallback.import", async () => ({
        capabilities: await import("../services/local-capabilities.js"),
        compiler: await import("../commands/dev-local-compiler.js"),
      }));
      const authorities = yield* Layer.build(modules.capabilities.localCapabilitiesLayer);
      return yield* modules.compiler
        .makeDevLocalCompilerEffect(options)
        .pipe(Effect.provide(authorities));
    }),
  ),
);
