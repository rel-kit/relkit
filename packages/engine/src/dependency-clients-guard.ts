import type { DependencyCategory } from "./dependencies.js";
import { DependencyAccessError } from "./dependency-clients.js";

export function guardedMap(
  category: DependencyCategory,
  clients: Record<string, unknown>,
): Readonly<Record<string, unknown>> {
  const target = Object.freeze(clients);
  return new Proxy(target, {
    get(current, property, receiver) {
      if (typeof property === "string" && !Object.hasOwn(current, property))
        throw new DependencyAccessError(category, property);
      return Reflect.get(current, property, receiver);
    },
  });
}
