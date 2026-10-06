import { Context, Effect, Layer } from "effect";
import { confirmDeploymentEffect } from "../commands/deploy-confirmation.js";
import type { DeployCommandOptions } from "../commands/deploy-support.types.js";
import { CliCleanup, cleanupLayer } from "./cleanup.service.js";
import { ownedNativePromise } from "./owned-promise.js";
import { observeCli } from "../cli-runtime.js";
import type { DeployConfirmationCapabilities } from "./deploy-confirmation.types.js";

/** Deployment consent acquired independently of the SDK. */
export class CliDeployConfirmation extends Context.Service<
  CliDeployConfirmation,
  DeployConfirmationCapabilities
>()("relkit/cli/DeployConfirmation") {}

/**
 * Supplies the existing prompt or one authorized compatibility substitute.
 * @param options - Optional foreign confirmation callback.
 * @returns A prompt Layer whose operation owns cleanup and never retries.
 */
export function deployConfirmationLayer(options: DeployCommandOptions = {}) {
  return Layer.effect(
    CliDeployConfirmation,
    Effect.gen(function* () {
      const cleanup = yield* CliCleanup;
      const custom = options.confirm;
      return CliDeployConfirmation.of({
        confirm: Effect.fn("CliDeployConfirmation.confirm")((question: string) =>
          observeCli(
            "deployment.confirm",
            custom === undefined
              ? confirmDeploymentEffect(question).pipe(Effect.provideService(CliCleanup, cleanup))
              : ownedNativePromise("deploy.prompt.custom", (signal) => custom(question, signal)),
          ),
        ),
      });
    }),
  ).pipe(Layer.provideMerge(cleanupLayer));
}
