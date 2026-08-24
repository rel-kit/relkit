export type SchemaRecord = Record<string, unknown>;

export type SchemaField = {
  readonly key: string;
  readonly type: string;
  readonly required: boolean;
  readonly description?: string;
  readonly schema: SchemaRecord;
  readonly defaultValue?: unknown;
};

export function schemaFields(value: unknown): readonly SchemaField[] {
  const schema = schemaRecord(unwrapSchema(value));
  const properties = schemaRecord(schema?.properties);
  if (!properties) return [];
  const required = new Set(schemaStrings(schema?.required));
  return Object.entries(properties).map(([key, property]) => {
    const propertySchema = schemaRecord(unwrapSchema(property)) ?? {};
    return {
      key,
      type: schemaType(propertySchema),
      required: required.has(key),
      ...(schemaText(propertySchema.description)
        ? { description: schemaText(propertySchema.description) }
        : {}),
      schema: propertySchema,
      ...(propertySchema.default === undefined ? {} : { defaultValue: propertySchema.default }),
    };
  });
}

export function schemaInput(
  schema: unknown,
  values: Readonly<Record<string, unknown>>,
): { readonly value?: unknown; readonly errors: readonly string[] } {
  const fields = schemaFields(schema);
  const errors = fields.flatMap((field) =>
    field.required && (values[field.key] === undefined || values[field.key] === "")
      ? [`${field.key} is required.`]
      : [],
  );
  if (errors.length > 0) return { errors };
  const value = Object.fromEntries(
    fields.flatMap((field) => {
      const input = values[field.key];
      return input === undefined || input === ""
        ? []
        : [[field.key, convertInput(input, field.schema)]];
    }),
  );
  return { value, errors: [] };
}

export function unwrapSchema(value: unknown): unknown {
  const schema = schemaRecord(value);
  if (schema?.$zsys === "schema" && schema.jsonSchema !== undefined)
    return unwrapSchema(schema.jsonSchema);
  return value;
}

export function schemaRecord(value: unknown): SchemaRecord | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as SchemaRecord)
    : undefined;
}

export function schemaStrings(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export function schemaText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function schemaType(value: unknown): string {
  const schema = schemaRecord(unwrapSchema(value));
  const type = schema?.type;
  if (typeof type === "string") return type;
  if (Array.isArray(type) && type.every((item) => typeof item === "string"))
    return type.join(" | ");
  if (schema?.properties !== undefined) return "object";
  if (schema?.items !== undefined) return "array";
  return typeof value;
}

function convertInput(value: unknown, schema: SchemaRecord): unknown {
  if (typeof value !== "string") return value;
  const type = schemaType(schema);
  if (type === "number" || type === "integer") return Number(value);
  if (type === "boolean") return value === "true";
  if (type === "object" || type === "array") {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}
