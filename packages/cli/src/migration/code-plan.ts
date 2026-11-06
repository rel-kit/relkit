/**
 * Builds the preview of a `relkit migrate` code migration without changing the project: it
 * inventories authored text files (skipping dependencies, generated state and migration
 * history folders), gathers rule context, runs every rule in memory and returns the changed
 * files with exact before/after snapshots for the transaction, plus every finding.
 */
import { Effect } from "effect";
import { cliPromise } from "../cli-errors.js";
import { observeCli } from "../cli-runtime.js";
import { fail } from "../main-support.js";
import { CliFileSystem } from "../services/filesystem.service.js";
import { LayoutFiles } from "./layout-files.service.js";
import { migrationFile } from "./layout-paths.js";
import { applyCodeRules } from "./code-apply.js";
import { loadCodeContext } from "./code-context.js";
import { codeRules } from "./code-rules/index.js";
import type { CodeMigrationOptions, CodeMigrationPlan } from "./code-migration.types.js";
import type { CodeReceiptEditRecord } from "./code-receipt.schemas.js";

const textFile = /(?:\.[cm]?[jt]sx?|\.mdx?|(?:^|\/)package\.json)$/;
const history = /(?:^|\/)(?:migrations|migration-history)\//;

/**
 * Plans the code migration of one project.
 * @param root - Canonical project root.
 * @param options - Optional client contract path.
 * @returns The plan and the receipt edits that would publish it.
 */
export const planCodeMigration = Effect.fn("Migration.code.plan")(
  function* (root: string, options: CodeMigrationOptions) {
    const filesystem = yield* CliFileSystem;
    if (!(yield* filesystem.exists(`${root}/package.json`)))
      return yield* Effect.fail(
        fail(
          "RELKIT_MIGRATE_INVALID_PROJECT",
          "relkit migrate needs a project folder with package.json.",
        ),
      );
    const inventory = (yield* (yield* LayoutFiles).inventory(root)).filter(
      (file) => textFile.test(file.path) && !history.test(file.path),
    );
    const files = inventory.map((file) => ({
      path: file.path,
      text: Buffer.from(file.bytes, "base64").toString("utf8"),
    }));
    const context = yield* cliPromise("migration.code.context", () =>
      loadCodeContext(root, files, options.contract),
    ).pipe(
      Effect.mapError(() =>
        fail(
          "RELKIT_MIGRATE_CONTRACT_UNAVAILABLE",
          "The client contract passed with --contract could not be read.",
        ),
      ),
    );
    const { changes, findings } = applyCodeRules(files, context, codeRules);
    const snapshots = new Map(inventory.map((file) => [file.path, file]));
    const edits: CodeReceiptEditRecord[] = changes.map((change) => {
      const before = snapshots.get(change.path);
      const after = migrationFile(change.path, Buffer.from(change.after), before?.mode ?? 0o644);
      return before === undefined
        ? { path: change.path, after }
        : { path: change.path, before, after };
    });
    const plan: CodeMigrationPlan = { root, changes, findings };
    return { plan, edits };
  },
  (effect) => observeCli("migration.code.plan", effect),
);
