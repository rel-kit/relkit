/** Validates isolated baseline/candidate projects with the installed toolchain and offline plans. */
import { dirname, join } from "node:path";
import { layoutContract } from "@relkit/compiler";
import { fromGraph } from "@relkit/deploy";
import { validateGraphShape, type ApplicationGraph } from "@relkit/graph";
import { canonicalJson } from "@relkit/contracts";
import { Effect, Schema } from "effect";
import { checkProjectEffect } from "../commands/check.js";
import { cliTry } from "../cli-errors.js";
import { fail } from "../main-support.js";
import { CliFileSystem } from "../services/filesystem.service.js";
import { CliProcess } from "../services/process.service.js";
import { LayoutFiles } from "./layout-files.service.js";
import type { MigrationPlan } from "./layout.types.js";

/**
 * Stages complete authored bytes in a sibling workspace; source and lockfiles stay untouched.
 * @param plan - Fresh migration plan.
 * @returns Compatibility proof after cleanup; unavailable validation prevents publication.
 */
export const validateLayoutCandidate = Effect.fn("Migration.validate")(function* (
  plan: MigrationPlan,
) {
  const fs = yield* CliFileSystem;
  const baseline = yield* Effect.acquireRelease(
    fs.stage(join(dirname(plan.root), ".relkit-layout-baseline-")),
    (path) => fs.remove(path).pipe(Effect.orDie),
  );
  const candidate = yield* Effect.acquireRelease(
    fs.stage(join(dirname(plan.root), ".relkit-layout-candidate-")),
    (path) => fs.remove(path).pipe(Effect.orDie),
  );
  yield* fs.chmod(baseline, 0o700);
  yield* fs.chmod(candidate, 0o700);
  const bytes = yield* LayoutFiles;
  for (const file of plan.files) {
    yield* bytes.put(baseline, file);
    const edit = plan.edits.find((edit) => edit.before.path === file.path);
    yield* bytes.put(candidate, edit?.after ?? file);
  }
  if (yield* fs.exists(join(plan.root, "node_modules"))) {
    yield* fs.symlink(join(plan.root, "node_modules"), join(baseline, "node_modules"));
    yield* fs.symlink(join(plan.root, "node_modules"), join(candidate, "node_modules"));
  }
  const original = yield* validationProjection(baseline);
  const moved = yield* validationProjection(candidate);
  if (original !== moved)
    return yield* Effect.fail(
      fail(
        "RELKIT_LAYOUT_CONTRACT_CHANGED",
        "Staged migration changed logical contracts or offline deployment ownership.",
      ),
    );
});

/**
 * Runs compiler and project typecheck, then validates complete logical/deployment projections.
 * @param root - Isolated staged project root.
 * @returns Secret-free canonical comparison document; no runtime resources are acquired.
 */
const validationProjection = Effect.fn("Migration.validate.project")(function* (root: string) {
  const result = yield* checkProjectEffect({ projectRoot: root });
  if (!result.ok)
    return yield* Effect.fail(
      fail(
        "RELKIT_LAYOUT_CHECK_FAILED",
        "Staged application check failed; resolve baseline or candidate diagnostics before migration.",
      ),
    );
  const processes = yield* CliProcess;
  const checked = yield* processes.run({ command: "bun", args: ["run", "typecheck"], cwd: root });
  if (checked.exitCode !== 0)
    return yield* Effect.fail(
      fail(
        "RELKIT_LAYOUT_TYPECHECK_FAILED",
        "Staged project typecheck failed or is unavailable; source publication was refused.",
      ),
    );
  const parsed = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Json))(
    result.outputs.graph,
  );
  const graph = yield* cliTry("migration.graph.validate", () => {
    if (!isApplicationGraph(parsed)) throw new Error("Invalid compiler graph");
    const accepted: ApplicationGraph = parsed;
    return accepted;
  });
  return yield* cliTry("migration.graph.project", () => {
    const app = graph.nodes.find((node) => node.kind === "app");
    if (app?.kind !== "app") throw new Error("Missing application ownership");
    if ((app.deploymentRoles?.length ?? 0) === 0) {
      return canonicalJson({ logical: layoutContract(graph), deployment: "not-configured" });
    }
    const { graphHash: _graphHash, ...ownership } = fromGraph(graph);
    return canonicalJson({ logical: layoutContract(graph), deployment: ownership });
  });
});

/**
 * Delegates full graph validation to its authoritative runtime codec.
 * @typeParam Value - Parsed foreign JSON shape.
 * @param value - Compiler-produced document.
 * @returns Whether authoritative node/edge validation succeeded.
 * @throws TypeError For malformed graph contracts.
 */
function isApplicationGraph<Value>(value: Value): value is Value & ApplicationGraph {
  validateGraphShape(value);
  return true;
}
