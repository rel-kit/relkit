/** Builds a deterministic byte-preserving migration preview without project mutations. */
import { discoverApplicationLayoutEffect, sourceResolutionLayer } from "@relkit/compiler";
import { Effect } from "effect";
import { observeCli } from "../cli-runtime.js";
import { CliFileSystem } from "../services/filesystem.service.js";
import { fail } from "../main-support.js";
import { assembledLayoutPlan } from "./layout-plan-policy.js";
import { LayoutFiles } from "./layout-files.service.js";
import { migrationFile, movedPath } from "./layout-paths.js";
import { rewriteLayoutSource } from "./layout-rewrite-source.js";
import { rewriteLayoutTooling } from "./layout-rewrite-tooling.js";
import type { MigrationFile, MigrationMove, PlannedLayoutEdit } from "./layout.types.js";
import type { LayoutRewrite } from "./layout-rewrite.types.js";

/**
 * Inventories authored files and rewrites supported syntax without executing application code.
 * @param root - Canonical authored application root.
 * @returns Immutable preview including every moved asset and manual-action conflict.
 */
export const planLayoutMigration = Effect.fn("Migration.plan")(
  function* (root: string) {
    const filesystem = yield* CliFileSystem;
    if (
      !(yield* filesystem.exists(`${root}/package.json`)) ||
      !(yield* filesystem.exists(`${root}/relkit.config.ts`))
    )
      return yield* Effect.fail(
        fail(
          "RELKIT_LAYOUT_INVALID_PROJECT",
          "Layout migration requires package.json and relkit.config.ts.",
        ),
      );
    const files = yield* (yield* LayoutFiles).inventory(root);
    const sources = files
      .filter((file) => /\.[cm]?[jt]sx?$/.test(file.path))
      .map((file) => ({
        fileName: file.path,
        text: Buffer.from(file.bytes, "base64").toString("utf8"),
      }));
    const layout = yield* discoverApplicationLayoutEffect(
      sources.filter((source) => source.fileName.startsWith("src/")),
      root,
    );
    const moves =
      layout.kind === "grouped"
        ? []
        : layout.services.map((service) => ({
            from: service.root,
            to: `src/services/${service.name}`,
          }));
    let edits: readonly PlannedLayoutEdit[] = [];
    if (moves.length > 0)
      edits = yield* plannedEdits(files, moves).pipe(
        Effect.provide(
          sourceResolutionLayer({
            root,
            sources: new Map(sources.map((source) => [source.fileName, source.text])),
          }),
        ),
      );
    return assembledLayoutPlan(root, layout, files, moves, edits);
  },
  (effect) => observeCli("migration.plan", effect),
);

/**
 * Produces exact before/after snapshots while refusing migration-history movement.
 * @param files - Complete authored byte inventory.
 * @param moves - Selected service roots.
 * @returns Only changed files and their precise rewrite conflicts.
 */
const plannedEdits = Effect.fn("Migration.planEdits")(function* (
  files: readonly MigrationFile[],
  moves: readonly MigrationMove[],
) {
  const edits: PlannedLayoutEdit[] = [];
  for (const before of files) {
    const path = movedPath(before.path, moves);
    const text = Buffer.from(before.bytes, "base64").toString("utf8");
    const isSource = /\.[cm]?[jt]sx?$/.test(before.path);
    const supportedText = isSource || /\.(?:jsonc?|mdx?|sh|bash|zsh)$/.test(before.path);
    let rewrite: LayoutRewrite = { text, conflicts: [] };
    if (isSource) rewrite = yield* rewriteLayoutSource(before.path, text, moves);
    else if (supportedText) rewrite = rewriteLayoutTooling(before.path, text, moves);
    if (path !== before.path || rewrite.text !== text) {
      const after = supportedText
        ? migrationFile(path, Buffer.from(rewrite.text), before.mode)
        : { ...before, path };
      const conflicts =
        /(?:^|\/)(?:migrations|migration-history)(?:\/|$)/.test(before.path) && path !== before.path
          ? [
              ...rewrite.conflicts,
              {
                file: before.path,
                message:
                  "Migration history cannot move; relocate the service's history explicitly before layout migration.",
              },
            ]
          : rewrite.conflicts;
      edits.push({ edit: { before, after }, conflicts });
    } else if (rewrite.conflicts.length > 0) {
      edits.push({ edit: { before, after: before }, conflicts: rewrite.conflicts });
    }
  }
  return edits;
});
