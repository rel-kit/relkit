import { Context, Effect, Layer } from "effect";
import { createPulumiWorkspace, writePulumiProgram } from "@relkit/deploy-pulumi";
import { cliPromise } from "../cli-errors.js";
import { observeCli } from "../cli-runtime.js";
import type { DeployCommandOptions, PulumiStack } from "../commands/deploy-support.types.js";
import { ownedNativePromise } from "./owned-promise.js";
import type { PulumiCapabilities } from "./pulumi.types.js";

/** Explicit Pulumi SDK boundary; methods acquire no compiler or prompt authority. */
export class CliPulumi extends Context.Service<CliPulumi, PulumiCapabilities>()(
  "relkit/cli/Pulumi",
) {}

/**
 * Supplies native Automation APIs or exact public compatibility substitutes.
 * @param options - Only native write/workspace overrides are captured here.
 * @returns A live SDK Layer; cancellable calls abort and settle inside their own scopes.
 */
export function pulumiLayer(options: DeployCommandOptions = {}) {
  return Layer.succeed(
    CliPulumi,
    CliPulumi.of({
      writeProgram: Effect.fn("CliPulumi.writeProgram")(
        (...args: Parameters<typeof writePulumiProgram>) =>
          observeCli(
            "pulumi.writeProgram",
            cliPromise("pulumi.writeProgram", () =>
              (options.writeProgram ?? writePulumiProgram)(...args),
            ).pipe(Effect.uninterruptible),
          ),
      ),
      openWorkspace: Effect.fn("CliPulumi.openWorkspace")(
        (...args: Parameters<typeof createPulumiWorkspace>) =>
          observeCli(
            "pulumi.openWorkspace",
            cliPromise("pulumi.openWorkspace", () =>
              (options.createWorkspace ?? createPulumiWorkspace)(...args),
            ).pipe(Effect.uninterruptible),
          ),
      ),
      preview: Effect.fn("CliPulumi.preview")(
        (stack: PulumiStack, ...args: Parameters<PulumiStack["preview"]>) =>
          observeCli(
            "pulumi.preview",
            ownedNativePromise("pulumi.preview", (signal) =>
              stack.preview({ ...args[0], signal: combineSignal(signal, args[0]?.signal) }),
            ),
          ),
      ),
      up: Effect.fn("CliPulumi.up")((stack: PulumiStack, ...args: Parameters<PulumiStack["up"]>) =>
        observeCli(
          "pulumi.up",
          ownedNativePromise("pulumi.up", (signal) =>
            stack.up({ ...args[0], signal: combineSignal(signal, args[0]?.signal) }),
          ),
        ),
      ),
      previewDestroy: Effect.fn("CliPulumi.previewDestroy")(
        (stack: PulumiStack, ...args: Parameters<PulumiStack["previewDestroy"]>) =>
          observeCli(
            "pulumi.previewDestroy",
            ownedNativePromise("pulumi.previewDestroy", (signal) =>
              stack.previewDestroy({ ...args[0], signal: combineSignal(signal, args[0]?.signal) }),
            ),
          ),
      ),
      destroy: Effect.fn("CliPulumi.destroy")(
        (stack: PulumiStack, ...args: Parameters<PulumiStack["destroy"]>) =>
          observeCli(
            "pulumi.destroy",
            ownedNativePromise("pulumi.destroy", (signal) =>
              stack.destroy({ ...args[0], signal: combineSignal(signal, args[0]?.signal) }),
            ),
          ),
      ),
      refresh: Effect.fn("CliPulumi.refresh")(
        (stack: PulumiStack, ...args: Parameters<PulumiStack["refresh"]>) =>
          observeCli(
            "pulumi.refresh",
            ownedNativePromise("pulumi.refresh", (signal) =>
              stack.refresh({ ...args[0], signal: combineSignal(signal, args[0]?.signal) }),
            ),
          ),
      ),
      outputs: Effect.fn("CliPulumi.outputs")((stack: PulumiStack) =>
        observeCli(
          "pulumi.outputs",
          cliPromise("pulumi.outputs", () => stack.outputs()).pipe(Effect.uninterruptible),
        ),
      ),
    }),
  );
}

/**
 * Preserves caller cancellation alongside the operation-owned SDK signal.
 * @param owned - Signal whose interruption cleanup joins the original SDK call.
 * @param supplied - Optional existing Automation API cancellation policy.
 * @returns A signal responding to either owner without replacing caller intent.
 */
function combineSignal(owned: AbortSignal, supplied?: AbortSignal): AbortSignal {
  return supplied === undefined ? owned : AbortSignal.any([owned, supplied]);
}
