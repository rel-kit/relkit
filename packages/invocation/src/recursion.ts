import { resolveDescriptorIdentity, type DescriptorIdentitySource } from "./identity.js";

export interface InvocationCallFrame {
  readonly functionId: string;
  readonly invocationId?: string;
}

export class RecursionPolicyError extends Error {
  readonly code = "RELKIT_RECURSION_DENIED" as const;
  readonly functionId: string;
  readonly callStack: readonly string[];
  readonly cycle: readonly string[];

  constructor(functionId: string, callStack: readonly string[], cycle: readonly string[]) {
    super("Invocation denied by recursion policy");
    this.name = "RecursionPolicyError";
    this.functionId = functionId;
    this.callStack = Object.freeze([...callStack]);
    this.cycle = Object.freeze([...cycle]);
  }
}

/** Immutable invocation frames keep concurrent child paths independent. */
export class InvocationCallStack {
  readonly frames: readonly InvocationCallFrame[];
  private readonly keys: readonly (object | string)[];
  private readonly descriptors: readonly (object | undefined)[];

  constructor(
    frames: readonly InvocationCallFrame[] = [],
    keys: readonly (object | string)[] = frames.map((frame) => frame.functionId),
    descriptors: readonly (object | undefined)[] = frames.map(() => undefined),
  ) {
    if (keys.length !== frames.length || descriptors.length !== frames.length) {
      throw new TypeError("Invocation call stack internals must match its frames");
    }
    this.frames = Object.freeze(frames.map((frame) => freezeFrame(frame)));
    this.keys = Object.freeze([...keys]);
    this.descriptors = Object.freeze([...descriptors]);
  }

  get functionIds(): readonly string[] {
    return Object.freeze(this.frames.map((frame) => frame.functionId));
  }

  has(functionId: string): boolean {
    return this.frames.some((frame) => frame.functionId === functionId);
  }

  enter(frame: InvocationCallFrame): InvocationCallStack;
  enter(functionId: string, invocationId?: string): InvocationCallStack;
  enter(target: object & DescriptorIdentitySource, invocationId?: string): InvocationCallStack;
  enter(
    frameOrTarget: InvocationCallFrame | object | string,
    invocationId?: string,
  ): InvocationCallStack {
    if (typeof frameOrTarget === "string") {
      return this.enterFrame(
        { functionId: frameOrTarget, ...(invocationId === undefined ? {} : { invocationId }) },
        frameOrTarget,
      );
    }
    if (isFrame(frameOrTarget)) return this.enterFrame(frameOrTarget, frameOrTarget.functionId);
    return this.enterDescriptor(frameOrTarget, invocationId);
  }

  enterDescriptor(
    descriptor: object & DescriptorIdentitySource,
    invocationId?: string,
  ): InvocationCallStack {
    const identity = resolveDescriptorIdentity(descriptor);
    return this.enterFrame(
      { functionId: identity.id, ...(invocationId === undefined ? {} : { invocationId }) },
      identity.key,
      descriptor,
    );
  }

  enterTarget(
    descriptor: object & DescriptorIdentitySource,
    invocationId?: string,
  ): InvocationCallStack {
    return this.enterDescriptor(descriptor, invocationId);
  }

  private enterFrame(
    frame: InvocationCallFrame,
    key: object | string,
    descriptor?: object,
  ): InvocationCallStack {
    validateFunctionId(frame.functionId);
    const repeatedAt = this.keys.findIndex(
      (entry, index) =>
        entry === key || (descriptor !== undefined && this.descriptors[index] === descriptor),
    );
    if (repeatedAt >= 0) {
      throw new RecursionPolicyError(frame.functionId, this.functionIds, [
        ...this.functionIds.slice(repeatedAt),
        frame.functionId,
      ]);
    }
    return new InvocationCallStack(
      [...this.frames, frame],
      [...this.keys, key],
      [...this.descriptors, descriptor],
    );
  }
}

export function createInvocationCallStack(
  frames: readonly InvocationCallFrame[] = [],
): InvocationCallStack {
  return new InvocationCallStack(frames);
}

export { InvocationCallStack as InvocationChain };
export const createInvocationChain = createInvocationCallStack;

function freezeFrame(frame: InvocationCallFrame): InvocationCallFrame {
  validateFunctionId(frame.functionId);
  return Object.freeze({
    functionId: frame.functionId,
    ...(frame.invocationId === undefined ? {} : { invocationId: frame.invocationId }),
  });
}

function validateFunctionId(functionId: string): void {
  if (typeof functionId !== "string" || functionId.trim().length === 0) {
    throw new TypeError("functionId must be a non-empty string");
  }
}

function isFrame(value: object): value is InvocationCallFrame {
  return "functionId" in value;
}
