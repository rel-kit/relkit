/** Packages the already-built private UI into the independently distributed inspector. */
import { access, cp, lstat, mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { Effect } from "effect";
import { scaffoldNative } from "./scaffold-native.js";
import { runBenchmarkMain } from "./dev-readiness/benchmark-main.js";

/** The workspace task graph builds the private UI before this producer runs. */
const packageInspector = Effect.fn("Inspector.packageUi")(function* () {
  const root = resolve(import.meta.dir, "..");
  const ui = join(root, "apps/inspector");
  const distName = ".next";
  const build = join(ui, distName);
  const app = join(build, "standalone/apps/inspector");
  const output = join(root, "packages/inspector/dist/ui");
  for (const file of [
    join(build, "BUILD_ID"),
    join(app, "package.json"),
    join(app, "server.js"),
    join(build, "static"),
  ])
    yield* scaffoldNative("inspector.required-output", () => access(file));
  yield* scaffoldNative("inspector.output-parent", () =>
    mkdir(dirname(output), { recursive: true }),
  );
  const stage = yield* Effect.acquireRelease(
    scaffoldNative("inspector.stage", () => mkdtemp(join(dirname(output), ".inspector-ui-"))),
    (path) =>
      scaffoldNative("inspector.stage-release", () =>
        rm(path, { recursive: true, force: true }),
      ).pipe(Effect.orDie),
  );
  for (const file of ["package.json", "server.js"])
    yield* scaffoldNative("inspector.copy", () => cp(join(app, file), join(stage, file)));
  yield* scaffoldNative("inspector.next-output", () =>
    cp(join(app, distName), join(stage, distName), { recursive: true }),
  );
  yield* scaffoldNative("inspector.static", () =>
    cp(join(build, "static"), join(stage, distName, "static"), { recursive: true }),
  );
  yield* scaffoldNative("inspector.public", () => copyPublic(ui, stage));
  yield* scaffoldNative("inspector.publish", async () => {
    const previous = await lstat(output).catch((cause) => {
      if (cause instanceof Error && "code" in cause && cause.code === "ENOENT") return undefined;
      throw cause;
    });
    if (previous?.isSymbolicLink()) throw new Error("Inspector output must not be a symlink");
    await rm(output, { recursive: true, force: true });
    await rename(stage, output);
  });
  yield* Effect.sync(() =>
    console.log("Packaged standalone inspector UI in packages/inspector/dist/ui."),
  );
});

/** Only an absent optional public directory is ignored; permissions and I/O failures remain failures. */
async function copyPublic(ui: string, stage: string) {
  const path = join(ui, "public");
  try {
    await access(path);
  } catch (cause) {
    if (cause instanceof Error && "code" in cause && cause.code === "ENOENT") return;
    throw cause;
  }
  await cp(path, join(stage, "public"), { recursive: true });
}

if (import.meta.main) await runBenchmarkMain(packageInspector().pipe(Effect.scoped));
