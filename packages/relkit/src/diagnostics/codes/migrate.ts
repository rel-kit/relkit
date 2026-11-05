/** Codes reported by `relkit migrate`, the 0.9 code migration. */
import type { DiagnosticCodeEntry } from "./codes.types.js";

export const migrateCodes = [
  {
    code: "RELKIT_MIGRATE_CONCURRENT_EDIT",
    title: "A file changed while relkit migrate was writing",
    happened:
      "A file that `relkit migrate --write` was about to change no longer matched the preview, so the migration stopped and restored the files it had already written.",
    fix: "Stop other tools that edit the project, then run `relkit migrate --write` again.",
  },
  {
    code: "RELKIT_MIGRATE_CONTRACT_UNAVAILABLE",
    title: "The client contract could not be read",
    happened:
      "The file passed to `relkit migrate --contract` does not exist or is not a client contract, so hook keys could not be named.",
    fix: "Run `relkit check` in the backend, then pass its `.relkit/generated/client-contract.json`.",
  },
  {
    code: "RELKIT_MIGRATE_DIRTY",
    title: "Files to migrate have uncommitted changes",
    happened:
      "A tracked file that `relkit migrate --write` needs to change has uncommitted changes in Git.",
    fix: "Commit or stash your changes, then run `relkit migrate --write` again.",
  },
  {
    code: "RELKIT_MIGRATE_INVALID_PROJECT",
    title: "relkit migrate needs a project folder",
    happened: "The folder passed to `relkit migrate` has no `package.json`.",
    fix: "Run `relkit migrate` in your project folder, or pass it with `--project-root`.",
  },
  {
    code: "RELKIT_MIGRATE_RECEIPT_INVALID",
    title: "Migration record is invalid",
    happened:
      "The migration record passed to `relkit migrate --rollback` does not belong to this project, is not a code migration record, or was changed.",
    fix: "Pass the record path printed by the `relkit migrate --write` you want to undo. Layout records roll back with `relkit migrate layout --rollback`.",
  },
  {
    code: "RELKIT_MIGRATE_RECOVERY_CONFLICT",
    title: "Rollback kept a later edit",
    happened:
      "A file changed by `relkit migrate` was edited afterwards, so the rollback changed nothing rather than overwrite your edit.",
    fix: "Undo the later edit, or restore the files with Git, then run the rollback again.",
  },
  {
    code: "RELKIT_MIGRATE_USAGE",
    title: "Invalid relkit migrate arguments",
    happened:
      "`relkit migrate` received an unknown option, an option without its value, or both `--write` and `--rollback`.",
    fix: "Run `relkit migrate` to preview, then `--write` to apply or `--rollback <record>` to undo, not both.",
  },
] as const satisfies readonly DiagnosticCodeEntry[];
