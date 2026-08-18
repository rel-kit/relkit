interface FailureDetail {
  readonly cause?: unknown;
  readonly stack?: string;
}

const details = new WeakMap<object, FailureDetail>();

export function rememberFailure(
  target: object,
  cause: unknown,
  fallbackStack: string | undefined,
): void {
  const stack = readStack(cause) ?? fallbackStack;
  details.set(target, {
    ...(cause === undefined ? {} : { cause }),
    ...(stack === undefined ? {} : { stack }),
  });
}

export function readFailureDetail(target: object): FailureDetail | undefined {
  return details.get(target);
}

function readStack(value: unknown): string | undefined {
  if (value === null || typeof value !== "object") return undefined;
  const property = Object.getOwnPropertyDescriptor(value, "stack");
  return property && "value" in property && typeof property.value === "string"
    ? property.value
    : undefined;
}
