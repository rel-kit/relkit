/** Checks native incremental/clean boundary diagnostics and last-valid artifact retention after a forbidden private dependency. */
import { expect } from "bun:test";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Effect, Result } from "effect";
import { CliProject } from "../../../packages/cli/src/services/project.service.js";
import type { makeDevLocalCompilerEffect } from "../../../packages/cli/src/commands/dev-local-compiler.js";
import { scaffoldNative } from "../../../scripts/scaffold-native.js";
import { addBoundary } from "./layout-development-mutations.js";

/** Rejects an actual cross-service private import, then restores only this owned fixture's inputs.
 * @param root - Exclusive source and generation root.
 * @param compiler - Original session compiler, preserving its prior accepted artifacts.
 * @param epoch - Last accepted generation identity.
 * @returns Completion after matching native diagnostic failure, unchanged accepted graph, and joined source restoration.
 */
export const verifyRejectedDevelopment = Effect.fn("LayoutDevelopment.rejected")(function* (
  root: string,
  compiler: Effect.Success<ReturnType<typeof makeDevLocalCompilerEffect>>,
  epoch: number,
) {
  const sourcePath = join(root, "src/services/hello/functions/hello.function.ts");
  const graphPath = join(root, ".relkit/matrix/incremental-" + epoch, "application.graph.json");
  const original = yield* scaffoldNative("layout.development.original", () =>
    readFile(sourcePath, "utf8"),
  );
  const previous = yield* scaffoldNative("layout.development.accepted", () =>
    readFile(graphPath, "utf8"),
  );
  yield* scaffoldNative("layout.development.forbidden", () =>
    stageForbiddenDependency(root, original),
  );
  yield* compiler.invalidateEffect;
  const failed = yield* compiler
    .compileEffect({
      projectRoot: root,
      outputDirectory: join(root, ".relkit/matrix/rejected"),
      token: { sourceToken: epoch + 1, generationToken: epoch + 1 },
      signal: new AbortController().signal,
    })
    .pipe(Effect.result);
  expect(Result.isFailure(failed)).toBe(true);
  if (Result.isSuccess(failed))
    throw new Error("Native compiler accepted a forbidden private import");
  const project = yield* CliProject;
  const clean = yield* project.checkDevelopment({
    projectRoot: root,
    generationId: "clean-rejected",
  });
  expect(clean.ok).toBe(false);
  const diagnostic = clean.diagnostics.find((item) => item.severity === "error");
  if (!diagnostic) throw new Error("Clean compiler omitted the forbidden dependency diagnostic");
  expect(failed.failure.operation).toBe("dev.compiler.diagnostics");
  expect(String(failed.failure.cause)).toContain(diagnostic.code);
  expect(
    yield* scaffoldNative("layout.development.preserved", () => readFile(graphPath, "utf8")),
  ).toBe(previous);
  yield* scaffoldNative("layout.development.restore", async () => {
    await writeFile(sourcePath, original);
    await rm(join(root, "src/services/other"), { recursive: true });
  });
  yield* compiler.invalidateEffect;
});

/** Writes the controlled foreign boundary before asking either native compiler to validate it.
 * @param root - Exclusive source root.
 * @param original - Original accepted handler source retained for restoration.
 * @returns Joined source writes with the deliberately forbidden private import.
 */
async function stageForbiddenDependency(root: string, original: string): Promise<void> {
  await addBoundary(root);
  await writeFile(
    join(root, "src/services/other/helpers/private.ts"),
    'export const message = "Forbidden private dependency";\n',
  );
  await writeFile(
    join(root, "src/services/hello/functions/hello.function.ts"),
    original.replace("@hello/helpers/message.js", "../../other/helpers/private.js"),
  );
}
