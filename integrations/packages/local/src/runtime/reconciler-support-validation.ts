import { serializeJson, type JsonValue } from "@relkit/contracts";
import type { LocalServiceInstance, ProviderOverrideState } from "@relkit/local-service";

export function completeUnits(
  instance: LocalServiceInstance,
  expectedUnitIds: readonly string[],
): boolean {
  if (instance.units === undefined || instance.units.length !== expectedUnitIds.length)
    return false;
  const actual = new Set(instance.units.map((unit) => unit.unitId));
  return (
    actual.size === expectedUnitIds.length && expectedUnitIds.every((unitId) => actual.has(unitId))
  );
}

export function sameBindings(
  previous: ProviderOverrideState | undefined,
  planHash: string,
  bindings: readonly {
    readonly bindingId: string;
    readonly values: Readonly<Record<string, JsonValue>>;
  }[],
): boolean {
  return (
    previous?.planHash === planHash && serializeJson(previous.bindings) === serializeJson(bindings)
  );
}

export function hash(value: unknown): value is string {
  return typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value);
}

export function invalid(): never {
  throw new Error("Local service recipe or plan is invalid.");
}
