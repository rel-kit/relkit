/** Captures selected deployment SDK authorities in an invocation-owned Layer. */
import { Context, Effect, Layer } from "effect";
import type { DeployCommandOptions } from "../commands/deploy-support.types.js";
import { makePulumiProgramCapabilities } from "./pulumi-program.js";
import { pulumiStackCapabilities } from "./pulumi-stack.js";
import type { PulumiCapabilities } from "./pulumi.types.js";

/** No native SDK is imported or initialized when this service is acquired. */
export class CliPulumi extends Context.Service<CliPulumi>()("relkit/cli/Pulumi", {
  make: (options: DeployCommandOptions = {}): Effect.Effect<PulumiCapabilities> =>
    Effect.succeed({
      ...makePulumiProgramCapabilities(options),
      ...pulumiStackCapabilities,
    }),
}) {}

/** Supplies the live implementation or public compatibility substitutes. */
export function pulumiLayer(options: DeployCommandOptions = {}) {
  return Layer.effect(CliPulumi, CliPulumi.make(options));
}
