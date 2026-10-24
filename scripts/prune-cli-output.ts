/** Removes retired generated CLI support outputs so incremental builds cannot repack UI or native history. */
import { lstat, readdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Effect } from "effect";
import { scaffoldNative } from "./scaffold-native.js";
import { ScaffoldProcessFailure } from "./scaffold-process.errors.js";
import { runBenchmarkMain } from "./dev-readiness/benchmark-main.js";

/** Prunes only generated legacy support names and the former bundled UI root. */
export const pruneCliOutput = Effect.fn("CliBuild.pruneRetired")(function* (output: string) {
  const metadata = yield* scaffoldNative("cli.output-stat", () => optionalStat(output));
  if (!metadata) return;
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) return yield* unsafe(output);
  const commands = join(output, "commands");
  const entries = yield* scaffoldNative("cli.output-list", () => optionalEntries(commands));
  yield* Effect.forEach(
    entries,
    (entry) =>
      Effect.gen(function* () {
        const stem = entry.name.replace(/\.(?:d\.ts|js)(?:\.map)?$/, "");
        const retired =
          stem === "dev-inspector-installation" ||
          stem.startsWith("dev-process") ||
          (stem.startsWith("dev-telemetry") && !stem.startsWith("dev-telemetry-config"));
        if (stem === entry.name || !retired) return;
        if (!entry.isFile() || entry.isSymbolicLink())
          return yield* unsafe(join(commands, entry.name));
        yield* scaffoldNative("cli.retired-output-remove", () => rm(join(commands, entry.name)));
      }),
    { concurrency: 4, discard: true },
  );
  const snapshot = join(output, "dev-snapshot");
  const previousEntries = yield* scaffoldNative("cli.snapshot-output-list", () =>
    optionalEntries(snapshot),
  );
  for (const entry of previousEntries) {
    if (
      ![
        "dev-telemetry-operation.js",
        "dev-telemetry-native.service.js",
        "duckdb-worker.js",
      ].includes(entry.name.replace(/\.map$/, ""))
    )
      continue;
    if (!entry.isFile() || entry.isSymbolicLink()) return yield* unsafe(join(snapshot, entry.name));
    yield* scaffoldNative("cli.retired-snapshot-output-remove", () =>
      rm(join(snapshot, entry.name)),
    );
  }
  const inspector = join(output, "inspector");
  const assets = yield* scaffoldNative("cli.inspector-assets-stat", () => optionalStat(inspector));
  if (!assets) return;
  if (!assets.isDirectory() || assets.isSymbolicLink()) return yield* unsafe(inspector);
  yield* scaffoldNative("cli.inspector-assets-remove", () => rm(inspector, { recursive: true }));
});

/** Classifies only absence; permission and filesystem failures remain build failures. */
async function optionalStat(path: string) {
  try {
    return await lstat(path);
  } catch (cause) {
    if (cause instanceof Error && "code" in cause && cause.code === "ENOENT") return undefined;
    throw cause;
  }
}

/** Lists an existing generated directory without treating other native errors as absence. */
async function optionalEntries(path: string) {
  const metadata = await optionalStat(path);
  if (!metadata) return [];
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) throw unsafe(path);
  try {
    return await readdir(path, { withFileTypes: true });
  } catch (cause) {
    if (cause instanceof Error && "code" in cause && cause.code === "ENOENT") return [];
    throw cause;
  }
}

/** Refuses paths whose ownership cannot be established from producer layout. */
function unsafe(path: string) {
  return new ScaffoldProcessFailure({
    operation: "cli.prune.unsafe",
    message: `Refusing to prune a non-owned generated path: ${path}`,
  });
}

if (import.meta.main)
  await runBenchmarkMain(pruneCliOutput(resolve(import.meta.dir, "../packages/cli/dist")));
