/** Owns isolated native resolver fixtures, never modifying a workspace install. */
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import {
  SelectedDependencies,
  SelectedDependenciesLive,
} from "../src/dependency-preflight.service.js";
import type { DependencySelection } from "../src/dependency-preflight.types.js";

/** Writes an opaque package whose public exports hide package.json. */
export function nativePackage(root: string, name: string, version: string, body = "export {};") {
  const directory = join(root, "node_modules", name);
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    join(directory, "package.json"),
    JSON.stringify({ name, version, type: "module", exports: { ".": "./index.js" } }),
  );
  writeFileSync(join(directory, "index.js"), body);
  return directory;
}

/** Creates a project with a deliberately nested adapter and peer install. */
export function nativeFixture() {
  const root = mkdtempSync(join(tmpdir(), "relkit-dependency-native-"));
  const adapter = nativePackage(
    root,
    "@fixture/adapter",
    "1.0.0",
    'throw new Error("must not evaluate adapter");',
  );
  const sdk = nativePackage(
    adapter,
    "fixture-sdk",
    "1.0.0-beta.2",
    'throw new Error("must not evaluate SDK");',
  );
  const selection = {
    projectRoot: root,
    adapter: "@fixture/adapter",
    capabilities: ["cache"],
    phase: "runtime",
    manager: "npm",
    requirements: [
      {
        package: "fixture-sdk",
        supportedRange: "^1.0.0-beta.1",
        installSection: "dependencies",
        capabilities: ["cache"],
        phases: ["runtime"],
      },
    ],
  } satisfies DependencySelection;
  return { root, adapter, sdk, selection };
}

/** Runs the actual source and validator, retaining typed failures for assertions. */
export function checkNative(selection: DependencySelection) {
  return Effect.runSync(
    Effect.gen(function* () {
      return yield* (yield* SelectedDependencies).check(selection).pipe(
        Effect.catchTag("SelectedDependencyFailure", (error) => Effect.succeed(error)),
        Effect.catchTag("DependencyResolutionFailure", (error) => Effect.succeed(error)),
      );
    }).pipe(Effect.provide(SelectedDependenciesLive)),
  );
}
