import {
  schemaRecord,
  schemaStrings,
  schemaText,
  schemaType,
  unwrapSchema,
} from "../lib/schema-model";

type SchemaRecord = Record<string, unknown>;

export function SchemaPanel({
  title,
  value,
  eyebrow = "SCHEMA",
}: {
  readonly title: string;
  readonly value: unknown;
  readonly eyebrow?: string;
}) {
  return (
    <section className="panel schema-panel" aria-labelledby={`${headingId(title)}-heading`}>
      <p className="eyebrow">{eyebrow}</p>
      <h2 id={`${headingId(title)}-heading`}>{title}</h2>
      <SchemaViewer value={value} />
    </section>
  );
}

export function SchemaViewer({ value }: { readonly value: unknown }) {
  if (value === undefined) return <p className="schema-empty">Not declared</p>;
  return <SchemaNode value={unwrapSchema(value)} />;
}

function SchemaNode({ value, depth = 0 }: { readonly value: unknown; readonly depth?: number }) {
  if (value === null || typeof value !== "object") {
    return <code className="schema-value">{formatValue(value)}</code>;
  }
  if (Array.isArray(value)) {
    return (
      <ul className="schema-list">
        {value.map((item, index) => (
          <li key={index}>
            <SchemaNode value={item} depth={depth + 1} />
          </li>
        ))}
      </ul>
    );
  }

  const schema = value as SchemaRecord;
  const properties = schemaRecord(schema.properties);
  const required = new Set(schemaStrings(schema.required));
  const branches = firstArray(schema.oneOf) ?? firstArray(schema.anyOf) ?? firstArray(schema.allOf);
  const type = schemaType(schema);
  const description = schemaText(schema.description);
  const entries = Object.entries(schema).filter(([key]) => !structuralKeys.has(key));

  return (
    <div className="schema-node" data-depth={depth}>
      <div className="schema-summary">
        <span className="schema-type">{type}</span>
        {schemaText(schema.format) && (
          <span className="schema-meta">{schemaText(schema.format)}</span>
        )}
        {schema.nullable === true && <span className="schema-meta">nullable</span>}
        {description && <span className="schema-description">{description}</span>}
      </div>
      {properties ? (
        <dl className="schema-properties">
          {Object.entries(properties).map(([name, property]) => (
            <div className="schema-property" key={name}>
              <dt className="schema-property-heading">
                <code>{name}</code>
                <span className="schema-type">{schemaType(property)}</span>
                <span className="schema-meta">{required.has(name) ? "required" : "optional"}</span>
              </dt>
              <dd>
                <SchemaNode value={unwrapSchema(property)} depth={depth + 1} />
              </dd>
            </div>
          ))}
        </dl>
      ) : schema.items !== undefined ? (
        <div className="schema-nested">
          <span className="schema-meta">Items</span>
          <SchemaNode value={unwrapSchema(schema.items)} depth={depth + 1} />
        </div>
      ) : branches ? (
        <div className="schema-nested">
          <span className="schema-meta">Variants</span>
          {branches.map((branch, index) => (
            <SchemaNode key={index} value={unwrapSchema(branch)} depth={depth + 1} />
          ))}
        </div>
      ) : entries.length > 0 ? (
        <dl className="schema-record">
          {entries.map(([key, entry]) => (
            <div key={key}>
              <dt>{key}</dt>
              <dd>
                <SchemaNode value={unwrapSchema(entry)} depth={depth + 1} />
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <span className="schema-meta">No fields declared</span>
      )}
      {schema.enum !== undefined && (
        <div className="schema-enum">
          <span className="schema-meta">Allowed</span>
          {Array.isArray(schema.enum) &&
            schema.enum.map((item, index) => (
              <code key={index} className="schema-value">
                {formatValue(item)}
              </code>
            ))}
        </div>
      )}
      {schema.default !== undefined && (
        <div className="schema-default">
          Default: <code>{formatValue(schema.default)}</code>
        </div>
      )}
    </div>
  );
}

const structuralKeys = new Set([
  "$schema",
  "$id",
  "$ref",
  "$relkit",
  "jsonSchema",
  "title",
  "description",
  "type",
  "format",
  "nullable",
  "properties",
  "required",
  "items",
  "oneOf",
  "anyOf",
  "allOf",
  "enum",
  "default",
  "additionalProperties",
]);

function firstArray(...values: unknown[]): readonly unknown[] | undefined {
  return values.find((value): value is readonly unknown[] => Array.isArray(value));
}

function formatValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined) return "undefined";
  try {
    return JSON.stringify(value);
  } catch {
    return "unavailable";
  }
}

function headingId(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "schema"
  );
}
