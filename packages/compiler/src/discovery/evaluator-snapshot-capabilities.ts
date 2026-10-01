import { Effect } from "effect";
import { observeCompiler } from "../observability.js";

/**
 * Reads an own data property without running its accessor.
 * @param value - External capability or metadata object.
 * @param key - Property to inspect.
 * @returns Stored data, or undefined for a missing/accessor property.
 */
export function ownDataProperty(value: object, key: PropertyKey): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && "value" in descriptor ? descriptor.value : undefined;
}

/**
 * Recognizes an error constructor using only own data identity fields.
 * @param value - Function metadata that might be a branded error descriptor.
 * @returns A lazy effect yielding whether data fields describe a matching error reference.
 */
export const isSnapshotErrorDescriptorEffect = Effect.fn("Discovery.isSnapshotErrorDescriptor")(
  function* (value: object) {
    const id = ownDataProperty(value, "id");
    const ref = ownDataProperty(value, "ref");
    return (
      ownDataProperty(value, "kind") === "error" &&
      typeof id === "string" &&
      ref !== null &&
      typeof ref === "object" &&
      ownDataProperty(ref, "kind") === "error" &&
      ownDataProperty(ref, "id") === id
    );
  },
  (effect) => observeCompiler("discovery", "isSnapshotErrorDescriptor", effect, () => ({}), false),
);

/**
 * Checks the property paths read by registered Standard Schema projection adapters.
 * @param value - Recognized Standard Schema capability.
 * @param standard - Its own data-only Standard Schema metadata.
 * @returns A lazy effect yielding whether any adapter-read property could execute an accessor.
 * @remarks Inherited accessors are checked too. Projection hook bodies remain the
 * external schema's responsibility and run only during explicit projection.
 */
export const schemaHasAccessorsEffect = Effect.fn("Discovery.schemaHasAccessors")(
  function* (value: object, standard: object) {
    const metadataKey = Symbol.for("relkit.schema.metadata");
    const projectionKeys = [
      "jsonSchema",
      "inputJsonSchema",
      "outputJsonSchema",
      "transformed",
      "refined",
    ];
    if (
      [metadataKey, "relkit"].some((key) => hasAccessor(value, key)) ||
      hasAccessor(standard, "jsonSchema")
    )
      return true;
    const metadata = inheritedData(value, metadataKey);
    const relkit = inheritedData(value, "relkit");
    const jsonSchema = inheritedData(standard, "jsonSchema");
    return (
      [metadata, relkit].some(
        (entry) => isObject(entry) && projectionKeys.some((key) => hasAccessor(entry, key)),
      ) ||
      (isObject(jsonSchema) && ["input", "output"].some((key) => hasAccessor(jsonSchema, key)))
    );
  },
  (effect) =>
    observeCompiler("discovery", "schemaHasAccessors", effect, () => ({ schemas: 1 }), false),
);

/**
 * Locates inherited data without invoking a getter on the prototype chain.
 * @param value - External capability.
 * @param key - Adapter-read property.
 * @returns The first data value, or undefined for absent/accessor values.
 */
function inheritedData(value: object, key: PropertyKey): unknown {
  let current: object | null = value;
  while (current !== null) {
    const descriptor = Object.getOwnPropertyDescriptor(current, key);
    if (descriptor !== undefined) return "value" in descriptor ? descriptor.value : undefined;
    current = Object.getPrototypeOf(current);
  }
  return undefined;
}

/**
 * Checks whether the first property descriptor is an accessor.
 * @param value - External capability.
 * @param key - Adapter-read property.
 * @returns Whether reading this property could execute user code.
 */
function hasAccessor(value: object, key: PropertyKey): boolean {
  let current: object | null = value;
  while (current !== null) {
    const descriptor = Object.getOwnPropertyDescriptor(current, key);
    if (descriptor !== undefined) return !("value" in descriptor);
    current = Object.getPrototypeOf(current);
  }
  return false;
}

/**
 * Narrows projection metadata containers for native descriptor inspection.
 * @param value - Capability field.
 * @returns Whether it is an object suitable for property inspection.
 */
function isObject(value: unknown): value is object {
  return value !== null && (typeof value === "object" || typeof value === "function");
}
