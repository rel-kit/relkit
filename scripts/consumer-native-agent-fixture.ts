/** Prepares retained native scenarios and checks their public declarations with the consumer's own compiler. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Effect, Exit } from "effect";
import { consumerInputFailure, inspectionNative } from "./consumer-installation-native.js";
import { packedCompilerDiagnostic } from "./consumer-packed-type-negative.js";
import { ScaffoldProcess } from "./scaffold-process.js";
import type { ScaffoldCommand } from "./scaffold-process.types.js";

const nativeTests = resolve(import.meta.dir, "../integrations/packages/langchain/tests");
const sourceFiles = [
  ["packed-consumer/behavior.fixture.ts", "behavior.test.ts"],
  ["packed-consumer/public-model.fixture.ts", "test-model.ts"],
  ["graph-interrupt-start.test.ts", "graph-interrupt-start.test.ts"],
  ["native-todo.test.ts", "native-todo.test.ts"],
  ["packed-consumer/public-types.fixture.ts", "public-types.ts"],
] as const;
const compilerOptions = {
  target: "ES2022",
  module: "ESNext",
  moduleResolution: "Bundler",
  customConditions: ["bun"],
  lib: ["ES2022", "DOM", "DOM.Iterable", "ESNext.Disposable"],
  types: ["bun"],
  strict: true,
  skipLibCheck: false,
  // Selected upstream SDK declarations reject this flag; the SDK-only control proves the limit.
  exactOptionalPropertyTypes: false,
  noUncheckedIndexedAccess: true,
  verbatimModuleSyntax: true,
  isolatedModules: true,
  resolveJsonModule: true,
  allowImportingTsExtensions: true,
  forceConsistentCasingInFileNames: true,
  noEmit: true,
};
const negativeSource = `/** Rejects wrong inferred native helper input and output properties. */
import { nativePublicTypes } from "./public-types.js";
export function rejectsWrongInput(engine: Parameters<typeof nativePublicTypes>[0]) {
  void nativePublicTypes(engine).helper.invoke({ message: 123 });
}
export async function rejectsWrongOutput(engine: Parameters<typeof nativePublicTypes>[0]) {
  const output = await nativePublicTypes(engine).helper.invoke({ message: "typed" });
  const invalid: number = output.answer;
  return invalid;
}
`;

/** Copies maintained scenarios unchanged except public import ownership and runner spelling. */
export async function prepareNativeFixture(
  root: string,
  dependencies: Record<string, string>,
  devDependencies: Record<string, string>,
) {
  await mkdir(root);
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({
      name: "packed-native-agents",
      private: true,
      type: "module",
      dependencies,
      devDependencies,
    }),
  );
  for (const [source, destination] of sourceFiles) {
    const bytes = await readFile(join(nativeTests, source), "utf8");
    await writeFile(
      join(root, destination),
      bytes
        .replaceAll('from "vitest"', 'from "bun:test"')
        .replaceAll('from "../src/index.js"', 'from "@relkit/langchain"')
        .replaceAll('from "../src/index.ts"', 'from "@relkit/langchain"'),
    );
  }
  await writeFile(
    join(root, "tsconfig.json"),
    JSON.stringify(
      { compilerOptions, files: sourceFiles.map(([, destination]) => destination) },
      null,
      2,
    ),
  );
  await writeFile(
    join(root, "tsconfig.negative.json"),
    JSON.stringify({ extends: "./tsconfig.json", files: ["public-types-negative.ts"] }, null, 2),
  );
  await writeFile(join(root, "public-types-negative.ts"), negativeSource);
}

/** Builds the unchanged consumer-owned compiler command for either native type fixture. */
function nativeCompilerCommand(
  root: string,
  config: "tsconfig.json" | "tsconfig.negative.json",
  listFiles: boolean,
): ScaffoldCommand {
  return {
    executable: "node",
    cwd: root,
    args: [
      "node_modules/typescript/bin/tsc",
      "-p",
      config,
      "--pretty",
      "false",
      ...(listFiles ? ["--listFiles"] : []),
    ],
    env: { NODE_OPTIONS: "--max-old-space-size=1536" },
  };
}

/** Retains positive declaration paths and requires exactly two native inference diagnostics. */
export const compileNativePublicTypes = Effect.fn("PackedNativeAgents.types")(function* (
  root: string,
) {
  const runner = yield* ScaffoldProcess;
  const positive = yield* Effect.exit(
    runner.run(nativeCompilerCommand(root, "tsconfig.json", true)),
  );
  const positiveLog = Exit.isSuccess(positive)
    ? positive.value
    : yield* packedCompilerDiagnostic(positive);
  yield* inspectionNative("fixture.types.positive.log", () =>
    writeFile(join(root, "types-positive.log"), positiveLog),
  );
  if (Exit.isFailure(positive)) return yield* Effect.failCause(positive.cause);
  const negative = yield* Effect.exit(
    runner.run(nativeCompilerCommand(root, "tsconfig.negative.json", false)),
  );
  const diagnostic = yield* packedCompilerDiagnostic(negative);
  yield* inspectionNative("fixture.types.negative.log", () =>
    writeFile(join(root, "types-negative.log"), diagnostic),
  );
  const expected = ["error TS2322:", "error TS2322:"];
  if (JSON.stringify(diagnostic.match(/error TS\d+:/g)) !== JSON.stringify(expected))
    return yield* consumerInputFailure(
      "packed-native.types.negative",
      `Native helper misuse must fail with exactly two TS2322 diagnostics: ${diagnostic}`,
    );
  return {
    positive: true,
    negativeDiagnosticCodes: [2322, 2322],
    strict: true,
    skipLibCheck: false,
    exactOptionalPropertyTypes: false,
  };
});
