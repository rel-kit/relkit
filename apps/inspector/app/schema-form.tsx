"use client";

import { useMemo } from "react";
import { schemaFields, type SchemaField } from "../lib/schema-model";

export function SchemaForm({
  schema,
  values,
  onChange,
  errors = [],
}: {
  readonly schema: unknown;
  readonly values: Readonly<Record<string, unknown>>;
  readonly onChange: (key: string, value: unknown) => void;
  readonly errors?: readonly string[];
}) {
  const fields = useMemo(() => schemaFields(schema), [schema]);
  if (fields.length === 0) return null;
  return (
    <div className="schema-form" aria-label="Function input fields">
      {fields.map((field) => (
        <SchemaFieldInput
          key={field.key}
          field={field}
          value={values[field.key]}
          error={errors.find((message) => message.startsWith(`${field.key} `))}
          onChange={onChange}
        />
      ))}
    </div>
  );
}

function SchemaFieldInput({
  field,
  value,
  error,
  onChange,
}: {
  readonly field: SchemaField;
  readonly value: unknown;
  readonly error?: string;
  readonly onChange: (key: string, value: unknown) => void;
}) {
  const id = `schema-field-${field.key.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  const descriptionId = `${id}-description`;
  const errorId = `${id}-error`;
  const enumValues = Array.isArray(field.schema.enum) ? field.schema.enum : [];
  const describedBy = error ? `${descriptionId} ${errorId}` : descriptionId;
  return (
    <label className="composer-field" htmlFor={id}>
      <span>
        {field.key}{" "}
        <small>
          ({field.type}) · {field.required ? "required" : "optional"}
        </small>
      </span>
      {enumValues.length > 0 ? (
        <select
          id={id}
          value={String(value ?? "")}
          onChange={(event) => onChange(field.key, event.target.value)}
          aria-describedby={describedBy}
          aria-invalid={error !== undefined}
        >
          {!field.required && <option value="">Choose a value</option>}
          {enumValues.map((item) => (
            <option key={String(item)} value={String(item)}>
              {String(item)}
            </option>
          ))}
        </select>
      ) : field.type === "boolean" ? (
        <input
          id={id}
          type="checkbox"
          checked={Boolean(value)}
          onChange={(event) => onChange(field.key, event.target.checked)}
          aria-describedby={describedBy}
          aria-invalid={error !== undefined}
        />
      ) : field.type === "object" || field.type === "array" ? (
        <textarea
          id={id}
          rows={4}
          value={String(value ?? "")}
          onChange={(event) => onChange(field.key, event.target.value)}
          aria-describedby={describedBy}
          aria-invalid={error !== undefined}
        />
      ) : (
        <input
          id={id}
          type={field.type === "number" || field.type === "integer" ? "number" : "text"}
          value={String(value ?? "")}
          onChange={(event) => onChange(field.key, event.target.value)}
          aria-describedby={describedBy}
          aria-invalid={error !== undefined}
        />
      )}
      <small id={descriptionId}>{field.description || "Matches the active function schema."}</small>
      {error && (
        <small id={errorId} className="field-error" role="alert">
          {error}
        </small>
      )}
    </label>
  );
}
