export function assertCanonicalProjection(
  value: unknown,
  name: string,
  allowVoid = false,
): void {
  visit(value, name, allowVoid, true);
}

function visit(value: unknown, name: string, allowVoid: boolean, root: boolean): void {
  if (!isRecord(value)) throw new TypeError(`${name} has no faithful canonical JSON schema`);
  if (value["x-relkit-void"] === true) {
    if (!allowVoid || !root) throw new TypeError(`${name} must not contain void values`);
    return;
  }
  if (value.format === "binary") {
    throw new TypeError(`${name} must not contain non-canonical binary values`);
  }
  if (Object.keys(value).length === 0) {
    throw new TypeError(`${name} must expose a bounded canonical JSON schema`);
  }
  visitProperties(value.properties, name);
  visitSchema(value.additionalProperties, name);
  visitSchema(value.items, name);
  visitSchemaArray(value.prefixItems, name);
  visitSchemaArray(value.anyOf, name);
  visitSchemaArray(value.oneOf, name);
  visitSchemaArray(value.allOf, name);
}

function visitProperties(value: unknown, name: string): void {
  if (!isRecord(value)) return;
  for (const schema of Object.values(value)) visit(schema, name, false, false);
}

function visitSchema(value: unknown, name: string): void {
  if (isRecord(value)) visit(value, name, false, false);
}

function visitSchemaArray(value: unknown, name: string): void {
  if (!Array.isArray(value)) return;
  for (const schema of value) visit(schema, name, false, false);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
