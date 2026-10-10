/**
 * Records executable resolution and byte identities for installed packed fixtures.
 * The measurement driver gathers this evidence outside the timed launches; it
 * never reads environment files or serializes inherited process configuration.
 */
import { readFile, realpath } from "node:fs/promises";
import { join } from "node:path";
import { Effect, Schema } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { ReadinessBenchmarkError } from "./benchmark-error.js";
import { snapshotDigest } from "@relkit/cli/internal/tooling";

/**
 * Resolves the literal Bun executable and installed CLI plus all package tarballs.
 * @param root - Installed generated application outside the framework workspace.
 * @param artifacts - Verified candidate tarballs used by its local registry.
 * @returns Lazy content identities; typed native access failure blocks certification.
 */
export const packedReadinessIdentity = Effect.fn("ReadinessBenchmark.identity")(
  (root: string, artifacts: readonly { name: string; path: string }[]) =>
    observeExecution(
      "testing",
      "dev.readiness.identity",
      Effect.gen(function* () {
        const bunPath = Bun.which("bun");
        if (bunPath === null)
          return yield* new ReadinessBenchmarkError({
            operation: "identity.bun",
            cause: new Error("Literal bun is not on PATH"),
          });
        const bunRealpath = yield* native("identity.bun.resolve", () => realpath(bunPath));
        const cliPath = join(root, "node_modules/.bin/relkit");
        const cliRealpath = yield* native("identity.cli.resolve", () => realpath(cliPath));
        const cli = yield* packageIdentity(join(root, "node_modules/@relkit/cli/package.json"));
        const typescript = yield* packageIdentity(
          join(root, "node_modules/typescript/package.json"),
        );
        const lock = yield* native("identity.lock", (signal) =>
          readFile(join(root, "bun.lock"), { signal }),
        );
        const hashes = yield* Effect.forEach(
          artifacts,
          (artifact) =>
            native("identity.tarball", (signal) => readFile(artifact.path, { signal })).pipe(
              Effect.map((bytes) => ({ name: artifact.name, hash: snapshotDigest(bytes) })),
            ),
          { concurrency: 4 },
        );
        return {
          bun: { path: bunPath, realpath: bunRealpath, version: Bun.version },
          cli: { ...cli, path: cliPath, realpath: cliRealpath },
          typescript,
          lockHash: snapshotDigest(lock),
          artifacts: hashes,
          inspectorOverride: process.env.RELKIT_INSPECTOR_ROOT === undefined ? "absent" : "present",
        };
      }),
    ),
);

/**
 * Decodes the actual installed package identity immediately after reading JSON.
 * @param path - Installed manifest resolved by the generated package manager.
 * @returns Exact package name/version, or expected identity-read failure.
 */
const packageIdentity = Effect.fn("ReadinessBenchmark.packageIdentity")(function* (path: string) {
  const bytes = yield* native("identity.package", (signal) => readFile(path, { signal }));
  return yield* Effect.try({
    try: () =>
      Schema.decodeUnknownSync(Schema.Struct({ name: Schema.String, version: Schema.String }))(
        JSON.parse(bytes.toString("utf8")),
      ),
    catch: (cause) =>
      new ReadinessBenchmarkError({
        operation: "identity.decode",
        cause: new Error("Invalid installed package identity", { cause }),
      }),
  });
});

/**
 * Adapts native identity access without exposing arbitrary rejected values.
 * @typeParam A - Exact successful native value.
 * @param operation - Fixed evidence operation name.
 * @param run - Lazy file operation consuming cancellation where supported.
 * @returns Native result or normalized measurement failure.
 */
function native<A>(operation: string, run: (signal: AbortSignal) => Promise<A>) {
  return Effect.tryPromise({
    try: run,
    catch: (cause) =>
      new ReadinessBenchmarkError({
        operation,
        cause: new Error("Readiness identity access failed", { cause }),
      }),
  });
}
