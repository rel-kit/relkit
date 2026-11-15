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
  const schema = schemaRecord(unwrapSchema(asInputSchema(value)));
  const properties = schemaRecord(schema?.properties);
  if (!properties) return [];
  const required = new Set(schemaStrings(schema?.required));
  return Object.entries(properties).map(([key, property]) => {
    const propertySchema = schemaRecord(unwrapSchema(property)) ?? {};
    return {
      key,
      type: schemaType(propertySchema),
      // A field with a default is optional for the caller, even when the decoded schema lists it.
      required: required.has(key) && propertySchema.default === undefined,
      ...(schemaText(propertySchema.description)
        ? { description: schemaText(propertySchema.description) }
        : {}),
      schema: propertySchema,
      ...(propertySchema.default === undefined ? {} : { defaultValue: propertySchema.default }),
    };
  });
}

/** The properties a caller must send: listed as required and without a default. */
export function requiredKeys(schema: SchemaRecord | undefined): readonly string[] {
  const properties = schemaRecord(schema?.properties);
  return schemaStrings(schema?.required).filter(
    (key) => schemaRecord(unwrapSchema(properties?.[key]))?.default === undefined,
  );
}

/** "required", "optional", or "optional · default <value>" for a field that has a default. */
export function fieldRequirement(field: {
  readonly required: boolean;
  readonly defaultValue?: unknown;
}): string {
  if (field.required) return "required";
  if (field.defaultValue === undefined) return "optional";
  let shown: string;
  try {
    shown = JSON.stringify(field.defaultValue) ?? String(field.defaultValue);
  } catch {
    shown = String(field.defaultValue);
  }
  return `optional · default ${shown}`;
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

/**
 * The schema a caller sends. A node carries the decoded type (`jsonSchema`, where a field with a
 * default is always present) and the input type (`inputJsonSchema`, where it is optional); forms
 * and input contracts use the second.
 */
export function asInputSchema(value: unknown): unknown {
  const schema = schemaRecord(value);
  if (schema?.$relkit === "schema" && schema.inputJsonSchema !== undefined)
    return { ...schema, jsonSchema: schema.inputJsonSchema };
  return value;
}

/**
 * A starting value for a declared schema: an object holding its required properties, each with
 * a value of the right type (its default or first allowed value when it declares one).
 * @param value - A schema node or JSON schema.
 * @returns The template, or `{}` when the schema declares no properties.
 */
export function schemaTemplate(value: unknown): unknown {
  return templateFor(schemaRecord(unwrapSchema(asInputSchema(value))), 0) ?? {};
}

function templateFor(schema: SchemaRecord | undefined, depth: number): unknown {
  if (schema === undefined || depth > 4) return null;
  if (schema.default !== undefined) return schema.default;
  if (schema.const !== undefined) return schema.const;
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];
  const branches = Array.isArray(schema.anyOf) ? schema.anyOf : schema.oneOf;
  if (Array.isArray(branches) && branches.length > 0)
    return templateFor(schemaRecord(unwrapSchema(branches[0])), depth + 1);
  const type = schemaType(schema);
  if (type === "string") return "";
  if (type === "number" || type === "integer") return 0;
  if (type === "boolean") return false;
  if (type === "array") return [];
  if (type === "object") {
    const properties = schemaRecord(schema.properties) ?? {};
    return Object.fromEntries(
      schemaStrings(schema.required).flatMap((key) =>
        key in properties
          ? [[key, templateFor(schemaRecord(unwrapSchema(properties[key])), depth + 1)]]
          : [],
      ),
    );
  }
  // A nullable type lists "null" beside the real one: prefer the real one.
  if (type.includes("|")) {
    const real = type.split(" | ").find((part) => part !== "null");
    return real === undefined ? null : templateFor({ ...schema, type: real }, depth + 1);
  }
  return null;
}

export function unwrapSchema(value: unknown): unknown {
  const schema = schemaRecord(value);
  if (schema?.$relkit === "schema" && schema.jsonSchema !== undefined)
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
