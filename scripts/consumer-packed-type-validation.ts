/** Writes native consumers and verifies real installed closure and compiler outcomes. */
import { mkdir, realpath, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { Effect } from "effect";
import { inspectInstallation } from "./consumer-installation.js";
import {
  consumerInputFailure,
  inspectionNative,
  readConsumerManifest,
  resolveConsumerPackage,
} from "./consumer-installation-native.js";
import { ScaffoldProcess } from "./scaffold-process.js";
import { packedCompilerDiagnostic } from "./consumer-packed-type-negative.js";
import type { ScaffoldCommand } from "./scaffold-process.types.js";
import type { PackedTypeFixture, PackedTypeCatalogValue } from "./consumer-packed-type.types.js";

const compilerOptions = {
  target: "ES2022",
  module: "ESNext",
  moduleResolution: "Bundler",
  customConditions: ["bun"],
  strict: true,
  skipLibCheck: false,
  exactOptionalPropertyTypes: true,
  noEmit: true,
  types: ["bun"],
};

/**
 * Materializes only packed source identities and feature-selected official native requirements.
 * @param root - Owned external consumer directory.
 * @param fixture - Explicit independent selection.
 * @param catalog - Packed creator dependency and patch metadata.
 * @param creator - Verified creator archive owning the exact Drizzle patch bytes.
 * @returns Lazy filesystem completion; patch mismatch fails before installation.
 */
export const writePackedTypeFixture = Effect.fn("PackedTypes.write")(function* (
  root: string,
  fixture: PackedTypeFixture,
  catalog: PackedTypeCatalogValue,
  creator: string,
) {
  const patch = catalog.patches["drizzle-orm"];
  if (fixture.drizzle) yield* writePackedDrizzlePatch(root, creator, patch);
  yield* inspectionNative("fixture.write", async () => {
    await mkdir(root, { recursive: true });
    const overrides = { "@better-fetch/fetch": catalog.dependencies["@better-fetch/fetch"] };
    await writeFile(
      join(root, "package.json"),
      JSON.stringify(
        {
          name: `packed-type-${fixture.name}`,
          private: true,
          type: "module",
          dependencies: fixture.dependencies,
          devDependencies: {
            ...fixture.devDependencies,
            ...(fixture.auth
              ? {
                  "@cloudflare/workers-types": catalog.dependencies["@cloudflare/workers-types"],
                }
              : {}),
          },
          ...(fixture.auth ? { overrides, pnpm: { overrides } } : {}),
          ...(fixture.drizzle
            ? { patchedDependencies: { [patch.key]: "patches/drizzle-orm.patch" } }
            : {}),
        },
        null,
        2,
      ),
    );
    await writeFile(
      join(root, "tsconfig.json"),
      JSON.stringify({
        compilerOptions,
        files: ["consumer.ts"],
      }),
    );
    await writeFile(join(root, "consumer.ts"), fixture.source);
    if (fixture.runtimeSource !== undefined)
      await writeFile(join(root, "runtime.ts"), fixture.runtimeSource);
  });
});

/**
 * Copies the selected native patch from actual packed creator bytes.
 * @param root - Owned consumer destination.
 * @param creator - Candidate creator archive.
 * @param patch - Validated candidate asset and exact SHA256.
 * @returns Lazy finite copy; altered or missing native patch bytes fail visibly.
 */
export function writePackedDrizzlePatch(
  root: string,
  creator: string,
  patch: PackedTypeCatalogValue["patches"]["drizzle-orm"],
) {
  return inspectionNative("fixture.patch", async () => {
    const path = `package/dist/${patch.asset}`;
    const files = await new Bun.Archive(await Bun.file(creator).bytes()).files(path);
    const bytes = await files.get(path)?.bytes();
    if (bytes === undefined || createHash("sha256").update(bytes).digest("hex") !== patch.hash)
      throw new Error("Packed Drizzle patch is absent or has mismatching bytes");
    await mkdir(join(root, "patches"), { recursive: true });
    await writeFile(join(root, "patches/drizzle-orm.patch"), bytes);
  });
}

/**
 * Proves importer-context containment and absence against the real installation.
 * @param root - Installed independent consumer.
 * @param fixture - Capability-specific forbidden dependency identities.
 * @returns Actual inventory; required missing edges and unexpected SDKs fail visibly.
 */
export const verifyPackedTypeInstallation = Effect.fn("PackedTypes.installation")(function* (
  root: string,
  fixture: PackedTypeFixture,
) {
  root = yield* inspectionNative("packed-types.root", () => realpath(root));
  const installation = yield* inspectInstallation(root, { development: true });
  const forbidden = installation.instances.filter((item) => fixture.forbidden.test(item.name));
  if (installation.missing.length > 0 || forbidden.length > 0)
    return yield* consumerInputFailure(
      "packed-types.closure",
      JSON.stringify({ missing: installation.missing, forbidden }),
    );
  if (fixture.auth) {
    const auth = yield* resolveConsumerPackage(root, root, "better-auth");
    const fetch =
      auth === undefined
        ? undefined
        : yield* resolveConsumerPackage(root, auth, "@better-fetch/fetch");
    const manifest = fetch === undefined ? undefined : yield* readConsumerManifest(fetch);
    if (manifest?.version !== "1.3.2")
      return yield* consumerInputFailure(
        "packed-types.fetch",
        "Actual Better Auth importer must resolve repaired native fetch 1.3.2",
      );
  }
  return installation;
});

/**
 * Executes the installed consumer's native TypeScript compiler, without a custom resolver.
 * @param root - External application with actual node_modules and source files.
 * @param fixture - Positive public typing and optional negative native-result assignment.
 * @returns Number of established cases; every unexpected compiler diagnostic is retained.
 */
export const compilePackedTypes = Effect.fn("PackedTypes.compile")(function* (
  root: string,
  fixture: PackedTypeFixture,
) {
  const runner = yield* ScaffoldProcess;
  const command = {
    executable: "node",
    cwd: root,
    args: ["node_modules/typescript/bin/tsc", "-p", "tsconfig.json", "--pretty", "false"],
    env: { NODE_OPTIONS: "--max-old-space-size=1536" },
  } satisfies ScaffoldCommand;
  yield* runner.run(command);
  if (fixture.runtimeSource !== undefined) {
    const output = yield* runner.run({
      cwd: root,
      args: ["run", "--no-install", "--no-env-file", "runtime.ts"],
    });
    yield* inspectionNative("fixture.runtime.log", () =>
      writeFile(join(root, "runtime.log"), output),
    );
  }
  const negativeSource = fixture.negativeSource;
  if (negativeSource === undefined) return 1;
  yield* inspectionNative("fixture.negative", () =>
    writeFile(join(root, "consumer.ts"), negativeSource),
  );
  const exit = yield* Effect.exit(runner.run(command));
  const diagnostic = yield* packedCompilerDiagnostic(exit);
  yield* inspectionNative("fixture.negative.log", () =>
    writeFile(join(root, "negative.log"), diagnostic),
  );
  const expected = (fixture.negativeDiagnosticCodes ?? [2322]).map((code) => `error TS${code}:`);
  if (JSON.stringify(diagnostic.match(/error TS\d+:/g)) !== JSON.stringify(expected))
    return yield* consumerInputFailure(
      "packed-types.negative",
      `Native misuse must fail with exactly ${expected.join(", ")}: ${diagnostic}`,
    );
  yield* inspectionNative("fixture.restore", () =>
    writeFile(join(root, "consumer.ts"), fixture.source),
  );
  return 2;
});
