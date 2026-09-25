import { Effect } from "effect";
import { resolveDescriptorIdentityEffect } from "./identity-resolve.js";
import { freezeFrame, isFrame, recursionOperation, RecursionFailure, RecursionPolicyError, runRecursionSync, validateFunctionId } from "./recursion-policy.js";
import type { DescriptorIdentitySource } from "./identity.types.js";
import type { InvocationCallFrame } from "./recursion.types.js";

export { RecursionFailure, RecursionPolicyError } from "./recursion-policy.js";
export type { InvocationCallFrame } from "./recursion.types.js";

/** Immutable invocation frames keep concurrent child paths independent.
 * @example createInvocationCallStack().enter("tasks.run");
 */
export class InvocationCallStack {
  readonly frames: readonly InvocationCallFrame[];
  private readonly keys: readonly (object | string)[];
  private readonly descriptors: readonly (object | undefined)[];

  constructor(
    frames: readonly InvocationCallFrame[] = [],
    keys: readonly (object | string)[] = frames.map((frame) => frame.functionId),
    descriptors: readonly (object | undefined)[] = frames.map(() => undefined),
  ) {
    const prepared = runRecursionSync(recursionOperation("recursion.create", () => {
      if (keys.length !== frames.length || descriptors.length !== frames.length)
        throw new TypeError("Invocation call stack internals must match its frames");
      return {
        frames: Object.freeze(frames.map(freezeFrame)),
        keys: Object.freeze([...keys]),
        descriptors: Object.freeze([...descriptors]),
      };
    }));
    this.frames = prepared.frames;
    this.keys = prepared.keys;
    this.descriptors = prepared.descriptors;
  }

  /** Reads immutable function IDs along this call path.
   * @returns Function IDs in entry order; no expected failure.
   * @example stack.functionIds;
   */
  get functionIds(): readonly string[] {
    return runRecursionSync(this.functionIdsEffect());
  }

  /** Reads function IDs in an Effect operation.
   * @returns Frozen IDs with no expected failure.
   * @example Effect.runSync(stack.functionIdsEffect());
   */
  functionIdsEffect(): Effect.Effect<readonly string[], RecursionFailure> {
    return recursionOperation("recursion.ids", () =>
      Object.freeze(this.frames.map((frame) => frame.functionId)));
  }

  /** Checks whether a function ID already appears on this path.
   * @param functionId - Candidate ID.
   * @returns True when the ID appears; no expected failure.
   * @example Effect.runSync(stack.hasEffect("tasks.run"));
   */
  hasEffect(functionId: string): Effect.Effect<boolean, RecursionFailure> {
    return recursionOperation("recursion.has", () =>
      this.frames.some((frame) => frame.functionId === functionId));
  }

  /** Synchronous membership adapter.
   * @param functionId - Candidate ID.
   * @returns True when the ID appears.
   * @example stack.has("tasks.run");
   */
  has(functionId: string): boolean {
    return runRecursionSync(this.hasEffect(functionId));
  }

  /** Enters a frame, ID, or descriptor through a typed Effect.
   * @param frameOrTarget - Frame, ID, or descriptor.
   * @param invocationId - Optional invocation ID for ID or descriptor input.
   * @returns A new stack or a tagged recursion or identity failure.
   * @example Effect.runSync(stack.enterEffect("tasks.run"));
   */
  enterEffect(frameOrTarget: InvocationCallFrame | object | string, invocationId?: string) {
    if (typeof frameOrTarget === "string")
      return this.enterFrameEffect(
        { functionId: frameOrTarget, ...(invocationId === undefined ? {} : { invocationId }) },
        frameOrTarget,
      );
    if (isFrame(frameOrTarget)) return this.enterFrameEffect(frameOrTarget, frameOrTarget.functionId);
    return this.enterDescriptorEffect(frameOrTarget, invocationId);
  }

  /** Synchronous entry adapter.
   * @param frameOrTarget - Frame, ID, or descriptor.
   * @param invocationId - Optional invocation ID.
   * @returns A new immutable stack.
   * @throws RecursionPolicyError when a cycle is found; TypeError for invalid frames.
   * @example stack.enter("tasks.run");
   */
  enter(frame: InvocationCallFrame): InvocationCallStack;
  enter(functionId: string, invocationId?: string): InvocationCallStack;
  enter(target: object & DescriptorIdentitySource, invocationId?: string): InvocationCallStack;
  enter(frameOrTarget: InvocationCallFrame | object | string, invocationId?: string): InvocationCallStack {
    return runRecursionSync(this.enterEffect(frameOrTarget, invocationId));
  }

  /** Enters a descriptor by its canonical or object-scoped identity.
   * @param descriptor - Descriptor to enter.
   * @param invocationId - Optional invocation ID.
   * @returns A new stack or tagged identity or recursion failure.
   * @example Effect.runSync(stack.enterDescriptorEffect(descriptor));
   */
  enterDescriptorEffect(descriptor: object & DescriptorIdentitySource, invocationId?: string) {
    return Effect.flatMap(resolveDescriptorIdentityEffect(descriptor), (identity) =>
      this.enterFrameEffect(
        { functionId: identity.id, ...(invocationId === undefined ? {} : { invocationId }) },
        identity.key,
        descriptor,
      ));
  }

  /** Synchronous descriptor entry adapter.
   * @param descriptor - Descriptor to enter.
   * @param invocationId - Optional invocation ID.
   * @returns A new stack.
   * @throws RecursionPolicyError for a repeated descriptor.
   * @example stack.enterDescriptor(descriptor);
   */
  enterDescriptor(descriptor: object & DescriptorIdentitySource, invocationId?: string): InvocationCallStack {
    return runRecursionSync(this.enterDescriptorEffect(descriptor, invocationId));
  }

  /** Alias for descriptor entry in the Effect path.
   * @param descriptor - Target descriptor.
   * @param invocationId - Optional invocation ID.
   * @returns A new stack or tagged failure.
   * @example Effect.runSync(stack.enterTargetEffect(descriptor));
   */
  enterTargetEffect(descriptor: object & DescriptorIdentitySource, invocationId?: string) {
    return this.enterDescriptorEffect(descriptor, invocationId);
  }

  /** Synchronous target entry adapter.
   * @param descriptor - Target descriptor.
   * @param invocationId - Optional invocation ID.
   * @returns A new stack.
   * @throws RecursionPolicyError for a repeated target.
   * @example stack.enterTarget(descriptor);
   */
  enterTarget(descriptor: object & DescriptorIdentitySource, invocationId?: string): InvocationCallStack {
    return runRecursionSync(this.enterTargetEffect(descriptor, invocationId));
  }

  private enterFrameEffect(frame: InvocationCallFrame, key: object | string, descriptor?: object) {
    return recursionOperation("recursion.enter", () => {
      validateFunctionId(frame.functionId);
      const repeatedAt = this.keys.findIndex((entry, index) =>
        entry === key || (descriptor !== undefined && this.descriptors[index] === descriptor));
      if (repeatedAt >= 0) {
        const ids = this.frames.map((entry) => entry.functionId);
        throw new RecursionPolicyError(frame.functionId, ids, [...ids.slice(repeatedAt), frame.functionId]);
      }
      return new InvocationCallStack(
        [...this.frames, frame],
        [...this.keys, key],
        [...this.descriptors, descriptor],
      );
    });
  }
}

/** Creates a validated call stack through Effect.
 * @param frames - Initial frames.
 * @returns An immutable stack or tagged frame failure.
 * @example Effect.runSync(createInvocationCallStackEffect());
 */
export function createInvocationCallStackEffect(frames: readonly InvocationCallFrame[] = []) {
  return recursionOperation("recursion.create", () => new InvocationCallStack(frames));
}

/** Synchronous call stack constructor adapter.
 * @param frames - Initial frames.
 * @returns An immutable stack.
 * @throws TypeError for invalid frames.
 * @example createInvocationCallStack();
 */
export function createInvocationCallStack(frames: readonly InvocationCallFrame[] = []): InvocationCallStack {
  return runRecursionSync(createInvocationCallStackEffect(frames));
}

export { InvocationCallStack as InvocationChain };
/** Compatibility alias for the synchronous immutable call stack constructor.
 * @param frames - Initial frames.
 * @returns A validated stack.
 * @throws TypeError for invalid frames.
 * @example createInvocationChain([{ functionId: "tasks.run" }]);
 */
export const createInvocationChain = createInvocationCallStack;
/** Compatibility alias for the Effect call stack constructor.
 * @param frames - Initial frames.
 * @returns Effect producing a stack or tagged frame failure.
 * @example Effect.runSync(createInvocationChainEffect());
 */
export const createInvocationChainEffect = createInvocationCallStackEffect;
