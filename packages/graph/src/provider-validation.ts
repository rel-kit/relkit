import { PROVIDER_CAPABILITIES, type DeploymentRole } from "./provider-nodes.js";

const bindingValueTypes = [
  "string",
  "number",
  "boolean",
  "port",
  "url",
  "json",
  "secret-string",
] as const;
const deploymentRoles = ["engine", "host", "infrastructure", "access"] as const;

export function validateProviderNode(
  value: Record<string, unknown>,
  index: number,
  fail: (message: string) => never,
): void {
  if (
    !(PROVIDER_CAPABILITIES as readonly unknown[]).includes(value.capability) ||
    !nonEmpty(value.profile) ||
    !isRecord(value.adapter) ||
    !isRecord(value.providerSource) ||
    !Array.isArray(value.namedValues) ||
    !Array.isArray(value.deploymentRoles) ||
    "ownership" in value
  ) {
    fail(`Graph nodes[${index}] provider metadata is invalid.`);
  }
  validateAdapter(value.adapter, index, fail);
  validateProviderSource(value.providerSource, index, fail);
  validateNamedValues(value, index, fail);
  validateLocal(value.local, index, fail);
  validateDeploymentRoles(value.deploymentRoles, index, "provider", fail);
  validateRoleConsistency(value, index, fail);
}

export function validateDeploymentRoles(
  value: unknown,
  index: number,
  owner: "app" | "provider",
  fail: (message: string) => never,
): void {
  if (value === undefined && owner === "app") return;
  if (!Array.isArray(value)) fail(`Graph nodes[${index}].deploymentRoles is invalid.`);
  const seen = new Set<string>();
  value.forEach((entry, roleIndex) => {
    if (isRecord(entry) && entry.protocolVersion !== 1)
      fail(
        `Graph nodes[${index}].deploymentRoles[${roleIndex}] protocol version ${String(entry.protocolVersion)} is unsupported; regenerate with \`relkit check\`.`,
      );
    if (
      !isRecord(entry) ||
      !(deploymentRoles as readonly unknown[]).includes(entry.role) ||
      !nonEmpty(entry.integrationId) ||
      entry.protocolVersion !== 1 ||
      !Object.hasOwn(entry, "configuration")
    ) {
      fail(`Graph nodes[${index}].deploymentRoles[${roleIndex}] is invalid.`);
    }
    const role = entry.role as DeploymentRole;
    if ((owner === "app") !== (role === "engine" || role === "host")) {
      fail(`Graph nodes[${index}].deploymentRoles[${roleIndex}] has an invalid role.`);
    }
    if (seen.has(role)) fail(`Graph nodes[${index}] has duplicate ${role} deployment roles.`);
    seen.add(role);
  });
}

function validateAdapter(
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

function validateProviderSource(
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

function validateNamedValues(
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

function validateLocal(value: unknown, index: number, fail: (message: string) => never): void {
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

function validateRoleConsistency(
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

function textList(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every(nonEmpty) && new Set(value).size === value.length;
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
