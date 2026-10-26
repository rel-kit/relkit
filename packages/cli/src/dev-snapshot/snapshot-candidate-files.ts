/**
 * Bun's native output adapter writes exact verified bytes into the supervisor's
 * owned candidate directory. Exclusive leaf creation prevents replacement links;
 * uncancellable mkdir/write operations physically join before owner cleanup.
 * Selected runtime links share that directory's lifetime and remain outside sealed bytes.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Context, Effect, Layer } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { DependencySource, DependencySourceLive } from "@relkit/provider/internal/dependencies";
import { ownedNativePromise } from "../services/owned-promise.js";
import { CliFileSystem, fileSystemLayer } from "../services/filesystem.service.js";
import { linkRuntimeModules } from "../services/runtime-module-links.js";
import type { SnapshotCandidateFileOperations } from "./snapshot-candidate.types.js";

/** Native writes are captured during Layer acquisition; request paths are already decoded. */
export class SnapshotCandidateFiles extends Context.Service<
  SnapshotCandidateFiles,
  SnapshotCandidateFileOperations
>()("relkit/DevSnapshot/CandidateFiles", {
  make: Effect.gen(function* () {
    const files = yield* CliFileSystem;
    const source = yield* DependencySource;
    return {
      write: writeCandidateMember,
      linkRuntime: (directory, projectRoot, dependencies) =>
        linkRuntimeModules(files, source, join(directory, "server"), projectRoot, dependencies),
    } satisfies SnapshotCandidateFileOperations;
  }),
}) {}

/** Supplies the Bun adapter; deterministic tests replace the same write contract. */
export const snapshotCandidateFilesLive = Layer.effect(
  SnapshotCandidateFiles,
  SnapshotCandidateFiles.make,
).pipe(Layer.provide(Layer.mergeAll(fileSystemLayer, DependencySourceLive)));

/**
 * Writes one indexed member only inside a supervisor-owned empty directory.
 * @param directory - Fresh output directory owned and removed by the supervisor.
 * @param path - Already schema-validated portable member identity.
 * @param bytes - Complete bytes matched to the validated receipt before this operation.
 * @returns Joined native write or typed acquisition failure.
 */
const writeCandidateMember = Effect.fn("DevSnapshot.writeCandidate")(
  (directory: string, path: string, bytes: Uint8Array) =>
    observeExecution(
      "cli",
      "dev.snapshot.candidate.write",
      Effect.gen(function* () {
        const target = join(directory, path);
        yield* ownedNativePromise("dev.snapshot.candidate.mkdir", () =>
          mkdir(dirname(target), { recursive: true }),
        );
        yield* ownedNativePromise("dev.snapshot.candidate.write", () =>
          writeFile(target, bytes, {
            flag: "wx",
            mode: 0o444,
          }),
        );
      }),
    ),
);
