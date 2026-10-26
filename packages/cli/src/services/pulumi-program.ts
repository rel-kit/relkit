/** Owns finite selected-engine filesystem and workspace SDK calls. */
import { Effect } from "effect";
import type { createPulumiWorkspace, writePulumiProgram } from "@relkit/deploy-pulumi";
import type { PulumiImplementation } from "../commands/deployment-engine.schemas.js";
import type { DeployCommandOptions } from "../commands/deploy-support.types.js";
import { cliPromise } from "../cli-errors.js";
import { observeCli } from "../cli-runtime.js";
import type { PulumiCapabilities } from "./pulumi.types.js";

/** Captures invocation overrides while leaving SDK ownership with the selected engine. */
export function makePulumiProgramCapabilities(
  options: DeployCommandOptions,
): Pick<PulumiCapabilities, "writeProgram" | "openWorkspace"> {
  return {
    writeProgram: Effect.fn("CliPulumi.writeProgram")(
      (engine: PulumiImplementation, ...args: Parameters<typeof writePulumiProgram>) =>
        observeCli(
          "pulumi.writeProgram",
          cliPromise("pulumi.writeProgram", () =>
            (options.writeProgram ?? engine.writePulumiProgram)(...args),
          ).pipe(Effect.uninterruptible),
        ),
    ),
    openWorkspace: Effect.fn("CliPulumi.openWorkspace")(
      (engine: PulumiImplementation, ...args: Parameters<typeof createPulumiWorkspace>) =>
        observeCli(
          "pulumi.openWorkspace",
          cliPromise("pulumi.openWorkspace", () =>
            (options.createWorkspace ?? engine.createPulumiWorkspace)(...args),
          ).pipe(Effect.uninterruptible),
        ),
    ),
  };
}
