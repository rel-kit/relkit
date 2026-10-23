/** Reads prior deployment state and validates checked source bytes before SDK calls. */
import { Effect, Schema } from "effect";
import { assertDeploymentPlanVersion } from "@relkit/deploy";
import { validateGraphShape, type ApplicationGraph } from "@relkit/graph";
import { cliOriginalError, cliTry } from "../cli-errors.js";
import { observeCli } from "../cli-runtime.js";
import { CliFileSystem } from "../services/filesystem.service.js";
import { DeployCommandError } from "./deploy-support.js";
import type { BuildResult } from "./build.js";
import type { CheckResult } from "./check.js";

/**
 * Reads and validates a prior plan; only an absent file has no previous cohort.
 * @param path - Generated prior-plan location.
 * @returns An accepted previous plan or absence.
 */
export const readDeploymentPlanEffect = Effect.fn("Deployment.readPlan")(
  function* (path: string) {
    const files = yield* CliFileSystem;
    const source = yield* files.readText(path).pipe(
      Effect.catchTag("CliAdapterError", (error) => {
        const cause = cliOriginalError(error);
        return cause instanceof Error && "code" in cause && cause.code === "ENOENT"
          ? Effect.succeed(undefined)
          : Effect.fail(error);
      }),
    );
    if (source === undefined) return undefined;
    return yield* cliTry("deployment.previousPlan", () => {
      let value: Schema.Json;
      try {
        value = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Json))(source);
      } catch {
        throw new DeployCommandError(
          "RELKIT_DEPLOY_PLAN_INVALID",
          `Deployment plan is invalid JSON; regenerate with \`relkit deploy preview\`: ${path}`,
        );
      }
      assertDeploymentPlanVersion(value);
      return value;
    });
  },
  (effect, _path: string) => observeCli("deployment.readPlan", effect),
);

/** Projects failed preparation diagnostics into stable public failure codes.
 * @param result - Failed compiler/build evidence.
 * @returns Existing code-only failure summary without native payloads.
 */
export function checkFailure(result: CheckResult | BuildResult): string {
  const codes = result.diagnostics.map((diagnostic) => diagnostic.code).filter(Boolean);
  return codes.length === 0
    ? "The project check did not succeed."
    : `Project check failed: ${codes.join(", ")}.`;
}

/**
 * Promotes compiler bytes through the graph owner's complete assertion boundary.
 * @param source - Checked graph JSON.
 * @param root - Authored root used by source validation.
 * @returns The accepted graph; the owner exposes a void validator, requiring this one assertion.
 */
export function checkedGraph(source: string, root: string): ApplicationGraph {
  let value: Schema.Json;
  try {
    value = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Json))(source);
  } catch {
    throw new DeployCommandError(
      "RELKIT_DEPLOY_GRAPH_INVALID",
      "The checked graph is invalid JSON.",
    );
  }
  const graph = Schema.declare<ApplicationGraph>(
    <Input>(input: Input): input is Input & ApplicationGraph => {
      validateGraphShape(input, root);
      return true;
    },
  );
  return Schema.decodeUnknownSync(graph)(value);
}
