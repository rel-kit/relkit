export interface InvocationCallFrame {
  readonly functionId: string;
  readonly invocationId?: string;
}

export class RecursionPolicyError extends Error {
  readonly code = "ZSYS_RECURSION_DENIED" as const;
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

/** Immutable invocation frames let concurrent child calls keep independent paths. */
export class InvocationCallStack {
  readonly frames: readonly InvocationCallFrame[];

  constructor(frames: readonly InvocationCallFrame[] = []) {
    this.frames = Object.freeze(frames.map((frame) => freezeFrame(frame)));
  }

  get functionIds(): readonly string[] {
    return Object.freeze(this.frames.map((frame) => frame.functionId));
  }

  has(functionId: string): boolean {
    return this.frames.some((frame) => frame.functionId === functionId);
  }

  enter(frame: InvocationCallFrame): InvocationCallStack;
  enter(functionId: string, invocationId?: string): InvocationCallStack;
  enter(
    frameOrFunctionId: InvocationCallFrame | string,
    invocationId?: string,
  ): InvocationCallStack {
    const frame =
      typeof frameOrFunctionId === "string"
        ? { functionId: frameOrFunctionId, ...(invocationId === undefined ? {} : { invocationId }) }
        : frameOrFunctionId;
    validateFunctionId(frame.functionId);
    const repeatedAt = this.frames.findIndex((entry) => entry.functionId === frame.functionId);
    if (repeatedAt >= 0) {
      throw new RecursionPolicyError(frame.functionId, this.functionIds, [
        ...this.functionIds.slice(repeatedAt),
        frame.functionId,
      ]);
    }
    return new InvocationCallStack([...this.frames, frame]);
  }
}

export function createInvocationCallStack(
  frames: readonly InvocationCallFrame[] = [],
): InvocationCallStack {
  return new InvocationCallStack(frames);
}

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
