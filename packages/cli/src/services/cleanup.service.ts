import { Context, Effect, Layer, Ref } from "effect";
import { observeCli } from "../cli-runtime.js";
import type { CleanupCapabilities, CleanupIssue } from "./cleanup.types.js";
import { registerCliCleanupLedger } from "../cli-cleanup-evidence.js";

/** Secondary release evidence owned by one invocation or long-lived dev session. */
export class CliCleanup extends Context.Service<CliCleanup, CleanupCapabilities>()(
  "relkit/cli/Cleanup",
) {}

/** Acquires a fresh bounded secondary-failure ledger; no evidence crosses invocations. */
export const cleanupLayer = Layer.effect(
  CliCleanup,
  Effect.gen(function* () {
    const issues = yield* Ref.make<readonly CleanupIssue[]>([]);
    const service = CliCleanup.of({
      record: (operation, cause) =>
        observeCli(
          "cleanup.record",
          Ref.update(issues, (previous) =>
            previous.length < 128
              ? [...previous, { operation, cause }]
              : [previous[0]!, ...previous.slice(-126), { operation, cause }],
          ),
        ),
      snapshot: () => observeCli("cleanup.snapshot", Ref.get(issues)),
    });
    registerCliCleanupLedger(service, issues);
    return service;
  }),
);

/**
 * Captures a release's full secondary cause while preserving the primary outcome.
 * @typeParam E - Expected release failure.
 * @typeParam R - Release capabilities.
 * @param operation - Bounded release label.
 * @param release - Lazy cleanup already owned by an acquired scope.
 * @returns Cleanup that records separate evidence instead of replacing a primary result.
 */
export function cleanupEffect<E, R>(
  operation: string,
  release: Effect.Effect<unknown, E, R>,
): Effect.Effect<void, never, R | CliCleanup> {
  return observeCli(operation, release).pipe(
    Effect.asVoid,
    Effect.catchCause((cause) =>
      Effect.gen(function* () {
        const cleanup = yield* CliCleanup;
        yield* cleanup.record(operation, cause);
      }),
    ),
  );
}
