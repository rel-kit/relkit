/** Publishes secret-safe deployment reports using only captured filesystem authority. */
import { join } from "node:path";
import { Effect, Schema } from "effect";
import { canonicalJson } from "@relkit/contracts";
import { cliTry } from "../cli-errors.js";
import { observeCli } from "../cli-runtime.js";
import { CliFileSystem } from "../services/filesystem.service.js";
import type { ParsedDeployArgs, Prepared, WorkspaceHandle } from "./deploy-support.types.js";

/**
 * Owns report file publication without recording credentials in observer attributes.
 * @param prepared - Accepted plan/program location.
 * @param handle - Selected native workspace.
 * @param command - Bounded operation label.
 * @param report - Secret-safe serialized report.
 * @returns The published report path.
 */
export const saveReportEffect = Effect.fn("Deployment.saveReport")(
  function* (
    prepared: Prepared,
    handle: WorkspaceHandle,
    command: ParsedDeployArgs["command"],
    report: Schema.Json,
  ) {
    const files = yield* CliFileSystem;
    const path = join(prepared.files.directory, `${command}.report.json`);
    const text = yield* cliTry(
      "deployment.reportJson",
      () =>
        `${canonicalJson({
          protocol: "relkit.deployment-report",
          version: 1,
          command,
          stack: handle.stackName,
          backend: handle.backend,
          graphHash: prepared.plan.graphHash,
          report,
        })}\n`,
    );
    yield* files.mkdir(prepared.files.directory);
    yield* files.writeText(path, text);
    return path;
  },
  (
    effect,
    _prepared: Prepared,
    _handle: WorkspaceHandle,
    _command: ParsedDeployArgs["command"],
    _report: Schema.Json,
  ) => observeCli("deployment.saveReport", effect),
);

/**
 * Projects the common public deployment metadata without private configuration.
 * @param prepared - Accepted plan and program paths.
 * @param handle - Selected workspace/backend metadata.
 * @param command - Public operation.
 * @param reportPath - Optional published report.
 * @returns The existing portable result envelope.
 */
export function base(
  prepared: Prepared,
  handle: WorkspaceHandle,
  command: ParsedDeployArgs["command"],
  reportPath?: string,
) {
  return {
    ok: true,
    command,
    projectRoot: prepared.root,
    projectName: handle.projectName,
    stack: handle.stackName,
    backend: handle.backend,
    graphHash: prepared.plan.graphHash,
    planPath: join(prepared.files.directory, "plan.json"),
    ...(reportPath === undefined ? {} : { reportPath }),
  };
}
