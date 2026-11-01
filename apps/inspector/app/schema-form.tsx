"use client";

import { useMemo } from "react";
import { schemaFields, type SchemaField } from "../lib/schema-model";
import { cn } from "../lib/utils";

/** Shared control styling for schema-generated and route-composer inputs. */
export const fieldControlClass =
  "block h-8 w-full min-w-0 rounded-md border border-input bg-background px-2.5 font-mono text-xs text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 hover:border-ring/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25 aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger/20";
export const fieldTextareaClass = "h-auto min-h-24 resize-y py-2 leading-5";
export const fieldCheckboxClass =
  "size-4 shrink-0 rounded-sm border border-input accent-[var(--color-foreground)]";

/** Label row for a generated field: mono key, then the type/location and requirement. */
export function FieldLabel({
  name,
  hint,
  required,
}: {
  readonly name: string;
  readonly hint: string;
  readonly required: boolean;
}) {
  return (
    <span className="flex min-w-0 items-baseline gap-1.5">
      <span className="truncate font-mono text-xs font-medium text-foreground">{name}</span>{" "}
      <small className="truncate font-mono text-[11px] text-muted-foreground">
        ({hint}) · {required ? "required" : "optional"}
      </small>
    </span>
  );
}

export function SchemaForm({
  schema,
  values,
  onChange,
  errors = [],
  label = "Function input fields",
}: {
  readonly schema: unknown;
  readonly values: Readonly<Record<string, unknown>>;
  readonly onChange: (key: string, value: unknown) => void;
  readonly errors?: readonly string[];
  readonly label?: string;
}) {
  const fields = useMemo(() => schemaFields(schema), [schema]);
  if (fields.length === 0) return null;
  return (
    <div className="@container min-w-0">
      <div
        className="schema-form grid min-w-0 gap-x-4 gap-y-3 @xl:grid-cols-2"
        role="group"
        aria-label={label}
      >
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
  readonly error?: string | undefined;
  readonly onChange: (key: string, value: unknown) => void;
}) {
  const id = `schema-field-${field.key.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  const descriptionId = `${id}-description`;
  const errorId = `${id}-error`;
  const enumValues = Array.isArray(field.schema.enum) ? field.schema.enum : [];
  const describedBy = error ? `${descriptionId} ${errorId}` : descriptionId;
  const wide = field.type === "object" || field.type === "array";
  return (
    <label
      className={cn("grid min-w-0 content-start gap-1.5", wide && "@xl:col-span-2")}
      htmlFor={id}
    >
      <FieldLabel name={field.key} hint={field.type} required={field.required} />
      {enumValues.length > 0 ? (
        <select
          id={id}
          className={fieldControlClass}
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
          className={fieldCheckboxClass}
          checked={Boolean(value)}
          onChange={(event) => onChange(field.key, event.target.checked)}
          aria-describedby={describedBy}
          aria-invalid={error !== undefined}
        />
      ) : wide ? (
        <textarea
          id={id}
          rows={4}
          className={cn(fieldControlClass, fieldTextareaClass)}
          value={String(value ?? "")}
          onChange={(event) => onChange(field.key, event.target.value)}
          aria-describedby={describedBy}
          aria-invalid={error !== undefined}
        />
      ) : (
        <input
          id={id}
          type={field.type === "number" || field.type === "integer" ? "number" : "text"}
          className={fieldControlClass}
          value={String(value ?? "")}
          onChange={(event) => onChange(field.key, event.target.value)}
          aria-describedby={describedBy}
          aria-invalid={error !== undefined}
        />
      )}
      <small
        id={descriptionId}
        className={field.description ? "text-[11px] leading-4 text-muted-foreground" : "sr-only"}
      >
        {field.description || "Matches the active function schema."}
      </small>
      {error && (
        <small id={errorId} className="text-[11px] leading-4 text-danger" role="alert">
          {error}
        </small>
      )}
    </label>
  );
}
