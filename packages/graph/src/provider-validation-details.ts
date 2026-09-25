import { isRecord, nonEmpty, textList } from "./provider-validation-utils.js";
const bindingValueTypes = [
  "string",
  "number",
  "boolean",
  "port",
  "url",
  "json",
  "secret-string",
] as const;
/** Validates adapter metadata and connection safety.
 * @param adapter - Provider projection to check.
 * @param index - Provider node index for diagnostics.
 * @param fail - Expected-failure callback.
 * @returns Void when the projection is valid.
 * @example validateAdapter(adapter, 0, fail);
 */
export function validateAdapter(
  adapter: Record<string, unknown>,
  index: number,
  fail: (message: string) => never,
): void {
  if (adapter.protocolVersion !== 1)
    fail(
      `Graph nodes[${index}].adapter protocol version ${String(adapter.protocolVersion)} is unsupported; regenerate with \`relkit check\`.`,
    );
  if (
    !nonEmpty(adapter.integrationId) ||
    !nonEmpty(adapter.adapterId) ||
    adapter.protocolVersion !== 1 ||
    !Object.hasOwn(adapter, "behavior") ||
    !isRecord(adapter.connectionContract) ||
    !isRecord(adapter.connection) ||
    !textList(adapter.features)
  ) {
    fail(`Graph nodes[${index}].adapter is invalid.`);
  }
  for (const [field, metadata] of Object.entries(adapter.connectionContract)) {
    if (
      !nonEmpty(field) ||
      !isRecord(metadata) ||
      typeof metadata.required !== "boolean" ||
      typeof metadata.sensitive !== "boolean" ||
      (metadata.authoredValue !== "fixed" && metadata.authoredValue !== "fallback") ||
      (metadata.sensitive === true && Object.hasOwn(metadata, "default"))
    ) {
      fail(`Graph nodes[${index}].adapter.connectionContract.${field} is invalid.`);
    }
  }
  for (const field of Object.keys(adapter.connection)) {
    const metadata = adapter.connectionContract[field];
    if (!isRecord(metadata) || metadata.sensitive === true) {
      fail(`Graph nodes[${index}].adapter.connection.${field} is invalid.`);
    }
  }
}
/** Validates provider source projection.
 * @param source - Provider projection to check.
 * @param index - Provider node index for diagnostics.
 * @param fail - Expected-failure callback.
 * @returns Void when the projection is valid.
 * @example validateProviderSource(source, 0, fail);
 */
export function validateProviderSource(
  source: Record<string, unknown>,
  index: number,
  fail: (message: string) => never,
): void {
  if (source.kind === "connected" || source.kind === "local-only") return;
  if (
    source.kind !== "infrastructure" ||
    !nonEmpty(source.integrationId) ||
    !Object.hasOwn(source, "options")
  ) {
    fail(`Graph nodes[${index}].providerSource is invalid.`);
  }
}
/** Validates named connection values against their contract.
 * @param value - Provider projection to check.
 * @param index - Provider node index for diagnostics.
 * @param fail - Expected-failure callback.
 * @returns Void when the projection is valid.
 * @example validateNamedValues(value, 0, fail);
 */
export function validateNamedValues(
  value: Record<string, unknown>,
  index: number,
  fail: (message: string) => never,
): void {
  const adapter = value.adapter as Record<string, unknown>;
  const contract = adapter.connectionContract as Record<string, unknown>;
  const connection = adapter.connection as Record<string, unknown>;
  const seen = new Set<string>();
  (value.namedValues as unknown[]).forEach((entry, namedIndex) => {
    if (
      !isRecord(entry) ||
      !nonEmpty(entry.field) ||
      !nonEmpty(entry.name) ||
      !(bindingValueTypes as readonly unknown[]).includes(entry.type) ||
      typeof entry.sensitive !== "boolean" ||
      Object.hasOwn(entry, "value")
    ) {
      fail(`Graph nodes[${index}].namedValues[${namedIndex}] is invalid.`);
    }
    const field = entry.field as string;
    const metadata = contract[field];
    if (
      seen.has(field) ||
      Object.hasOwn(connection, field) ||
      !isRecord(metadata) ||
      metadata.sensitive !== entry.sensitive
    ) {
      fail(`Graph nodes[${index}].namedValues[${namedIndex}] does not match its contract.`);
    }
    seen.add(field);
  });
}
/** Validates an optional local provider recipe.
 * @param value - Provider projection to check.
 * @param index - Provider node index for diagnostics.
 * @param fail - Expected-failure callback.
 * @returns Void when the projection is valid.
 * @example validateLocal(value, 0, fail);
 */
export function validateLocal(
  value: unknown,
  index: number,
  fail: (message: string) => never,
): void {
  if (value === undefined) return;
  if (
    !isRecord(value) ||
    !nonEmpty(value.integrationId) ||
    !nonEmpty(value.recipeId) ||
    !Number.isSafeInteger(value.recipeVersion) ||
    (value.recipeVersion as number) < 1
  ) {
    fail(`Graph nodes[${index}].local is invalid.`);
  }
}
/** Checks deployment roles against provider source.
 * @param value - Provider projection to check.
 * @param index - Provider node index for diagnostics.
 * @param fail - Expected-failure callback.
 * @returns Void when the projection is valid.
 * @example validateRoleConsistency(value, 0, fail);
 */
export function validateRoleConsistency(
  value: Record<string, unknown>,
  index: number,
  fail: (message: string) => never,
): void {
  const source = value.providerSource as Record<string, unknown>;
  const roles = value.deploymentRoles as Record<string, unknown>[];
  const infrastructure = roles.find((entry) => entry.role === "infrastructure");
  const access = roles.find((entry) => entry.role === "access");
  if (
    (source.kind === "infrastructure") !== (infrastructure !== undefined) ||
    (infrastructure !== undefined && infrastructure.integrationId !== source.integrationId) ||
    (value.access !== undefined) !== (access !== undefined)
  ) {
    fail(`Graph nodes[${index}] deployment roles do not match its provider source.`);
  }
}
