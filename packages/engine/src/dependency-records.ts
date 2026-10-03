import type { MaybePromise } from "@relkit/contracts";
import type { DependencyCategory, DependencyClientBuildOptions } from "./dependencies.js";
import { DependencyNotConfiguredError, runDependency } from "./dependency-clients.js";

/** Wrap native client methods in the invocation dependency bridge.
 * @returns A client object whose native methods retain their original receivers.
 * @param category - Declared client capability family.
 * @param name - Declared operation, dependency or field name.
 * @param source - Explicit native source or source collection.
 * @param methods - Native method names exposed by this capability contract.
 * @param options - Explicit configuration and dependencies for this operation.
 * @param optional - Methods omitted when the native client does not implement them.
 */
export function wrapRecord(
  category: DependencyCategory,
  name: string,
  source: unknown,
  methods: readonly string[],
  options: DependencyClientBuildOptions,
  optional: readonly string[] = [],
): Readonly<Record<string, unknown>> {
  if (source !== undefined && !isRecord(source)) {
    throw new TypeError(`Invalid ${category} client "${name}"`);
  }
  const result: Record<string, unknown> = {};
  for (const method of methods) {
    if (optional.includes(method) && !hasFunction(source, method)) continue;
    result[method] = (...arguments_: readonly unknown[]) =>
      runDependency(options, category, name, method, () =>
        callSource(source, category, name, method, arguments_),
      );
  }
  return Object.freeze(result);
}

/** Call a native method with its original receiver or reject an unavailable method.
 * @returns The unchanged native method result with its receiver preserved.
 * @param source - Explicit native source or source collection.
 * @param category - Declared client capability family.
 * @param name - Declared operation, dependency or field name.
 * @param method - Native capability method being invoked.
 * @param arguments_ - Arguments forwarded unchanged to the native method.
 */
function callSource(
  source: unknown,
  category: DependencyCategory,
  name: string,
  method: string,
  arguments_: readonly unknown[],
): MaybePromise<unknown> {
  if (!isRecord(source)) throw new DependencyNotConfiguredError(category, name);
  const operation = source[method];
  if (typeof operation !== "function") throw new DependencyNotConfiguredError(category, name);
  return operation.apply(source, arguments_);
}

/** Check native method availability without invoking it.
 * @returns Whether the native value satisfies this guard.
 * @param source - Explicit native source or source collection.
 * @param method - Native capability method being invoked.
 */
function hasFunction(source: unknown, method: string): boolean {
  return isRecord(source) && typeof source[method] === "function";
}

/** Recognize non-null object records before reading native fields.
 * @returns Whether the native value satisfies this guard.
 * @param value - Native value being validated or projected.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}
