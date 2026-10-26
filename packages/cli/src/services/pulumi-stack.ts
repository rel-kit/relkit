/** Runs stack operations with joined native cancellation and original failures. */
import { Effect } from "effect";
import type { PulumiStack } from "../commands/deploy-support.types.js";
import { cliPromise } from "../cli-errors.js";
import { observeCli } from "../cli-runtime.js";
import { ownedNativePromise } from "./owned-promise.js";
import type { PulumiCapabilities } from "./pulumi.types.js";

/** Receivers are supplied per operation, so no stack survives this invocation. */
export const pulumiStackCapabilities: Omit<PulumiCapabilities, "writeProgram" | "openWorkspace"> = {
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
};

/**
 * Preserves caller cancellation alongside the operation-owned SDK signal.
 * @param owned - Signal whose interruption cleanup joins the original SDK call.
 * @param supplied - Optional existing Automation API cancellation policy.
 * @returns A signal responding to either owner without replacing caller intent.
 */
function combineSignal(owned: AbortSignal, supplied?: AbortSignal): AbortSignal {
  return supplied === undefined ? owned : AbortSignal.any([owned, supplied]);
}
