import type { RouteField } from "../../lib/route-composer";

export function RouteFieldInput({
  field,
  value,
  error,
  onChange,
  inputRef,
}: {
  readonly field: RouteField;
  readonly value: unknown;
  readonly error?: string;
  readonly onChange: (value: unknown) => void;
  readonly inputRef: (element: HTMLInputElement | HTMLTextAreaElement | null) => void;
}) {
  const id = `route-field-${field.key.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  const descriptionId = `${id}-description`;
  const errorId = `${id}-error`;
  const type = text(field.schema?.type);
  const json = type === "object" || type === "array" || field.source === "whole-body";
  const describedBy = error === undefined ? descriptionId : `${descriptionId} ${errorId}`;
  return (
    <label className="composer-field" htmlFor={id}>
      <span>
        {field.key}{" "}
        <small>
          ({field.source}){field.required ? " · required" : " · optional"}
        </small>
      </span>
      {json ? (
        <textarea
          ref={inputRef}
          id={id}
          name={field.key}
          rows={4}
          value={String(value ?? "")}
          onChange={(event) => onChange(event.target.value)}
          aria-describedby={describedBy}
          aria-errormessage={error === undefined ? undefined : errorId}
          aria-invalid={error !== undefined}
        />
      ) : (
        <input
          ref={inputRef}
          id={id}
          name={field.key}
          type={
            type === "number" || type === "integer"
              ? "number"
              : type === "boolean"
                ? "checkbox"
                : "text"
          }
          value={type === "boolean" ? undefined : String(value ?? "")}
          checked={type === "boolean" ? Boolean(value) : undefined}
          onChange={(event) =>
            onChange(type === "boolean" ? event.target.checked : event.target.value)
          }
          aria-describedby={describedBy}
          aria-errormessage={error === undefined ? undefined : errorId}
          aria-invalid={error !== undefined}
        />
      )}
      <small id={descriptionId}>
        {field.required ? "Required value." : "Optional value."} Source: {field.source}.
      </small>
      {error !== undefined && (
        <small id={errorId} className="field-error" role="alert">
          {error}
        </small>
      )}
    </label>
  );
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}
