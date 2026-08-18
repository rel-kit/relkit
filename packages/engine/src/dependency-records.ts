import type { MaybePromise } from "@zsys/contracts";
import type { DependencyCategory, DependencyClientBuildOptions } from "./dependencies.js";
import { DependencyNotConfiguredError, runDependency } from "./dependency-clients.js";

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

function hasFunction(source: unknown, method: string): boolean {
  return isRecord(source) && typeof source[method] === "function";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}
