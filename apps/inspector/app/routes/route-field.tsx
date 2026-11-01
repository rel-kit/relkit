import type { RouteField } from "../../lib/route-composer";
import { cn } from "../../lib/utils";
import {
  FieldLabel,
  fieldCheckboxClass,
  fieldControlClass,
  fieldTextareaClass,
} from "../schema-form";

export function RouteFieldInput({
  field,
  value,
  error,
  onChange,
  inputRef,
}: {
  readonly field: RouteField;
  readonly value: unknown;
  readonly error?: string | undefined;
  readonly onChange: (value: unknown) => void;
  readonly inputRef: (element: HTMLInputElement | HTMLTextAreaElement | null) => void;
}) {
  const id = `route-field-${field.key.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  const descriptionId = `${id}-description`;
  const errorId = `${id}-error`;
  const type = text(field.schema?.type);
  const json = type === "object" || type === "array" || field.source === "whole-body";
  const checkbox = !json && type === "boolean";
  const describedBy = error === undefined ? descriptionId : `${descriptionId} ${errorId}`;
  return (
    <label
      className={cn("grid min-w-0 content-start gap-1.5", json && "@xl:col-span-2")}
      htmlFor={id}
      data-source={field.source}
    >
      <FieldLabel name={field.key} hint={field.source} required={field.required} />
      {json ? (
        <textarea
          ref={inputRef}
          id={id}
          name={field.key}
          rows={4}
          className={cn(fieldControlClass, fieldTextareaClass)}
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
          className={checkbox ? fieldCheckboxClass : fieldControlClass}
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
      <small id={descriptionId} className="sr-only">
        {field.required ? "Required value." : "Optional value."} Source: {field.source}.
      </small>
      {error !== undefined && (
        <small id={errorId} className="text-[11px] leading-4 text-danger" role="alert">
          {error}
        </small>
      )}
    </label>
  );
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}
