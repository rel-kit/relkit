"use client";

import { useState, type FormEvent } from "react";
import type { AgentWaitingState } from "./application-runtime-types";
import { Button } from "../components/ui/button";
import { schemaInput, schemaRecord, schemaType, unwrapSchema } from "../lib/schema-model";
import { SchemaForm } from "./schema-form";

export function AgentResumeForm({
  waiting,
  pending,
  onResume,
}: {
  readonly waiting: AgentWaitingState;
  readonly pending: boolean;
  readonly onResume: (reply: unknown) => void;
}) {
  const schema = schemaRecord(unwrapSchema(waiting.response)) ?? {};
  const type = schemaType(schema);
  const [value, setValue] = useState("");
  const [values, setValues] = useState<Readonly<Record<string, unknown>>>({});
  const [errors, setErrors] = useState<readonly string[]>([]);
  const [error, setError] = useState("");

  function submit(event: FormEvent): void {
    event.preventDefault();
    if (type === "object") {
      const result = schemaInput(schema, values);
      if (result.errors.length > 0) {
        setErrors(result.errors);
        return;
      }
      onResume(result.value ?? {});
      return;
    }
    try {
      onResume(primitiveValue(type, value));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Enter a valid reply.");
    }
  }

  return (
    <form
      className="grid w-full max-w-xl gap-3 rounded-md border border-warning/40 bg-warning-soft/40 p-3"
      onSubmit={submit}
      aria-label="Human input required"
    >
      <div className="grid gap-1">
        <strong className="flex items-center gap-2 text-xs font-semibold text-foreground">
          <span aria-hidden="true" className="size-1.5 rounded-[1px] bg-warning" />
          Human input required
        </strong>
        {waiting.requests.map((request, index) => (
          <p key={`${request.node}:${index}`} className="m-0 text-[13px] text-foreground/90">
            {requestSummary(request.value)}{" "}
            <small className="font-mono text-[10.5px] text-muted-foreground">
              at {request.node}
            </small>
          </p>
        ))}
      </div>
      {type === "object" ? (
        <SchemaForm
          schema={schema}
          values={values}
          errors={errors}
          label="Human response fields"
          onChange={(key, next) => {
            setValues((current) => ({ ...current, [key]: next }));
            setErrors([]);
          }}
        />
      ) : type === "boolean" ? (
        <label className="grid gap-1 text-xs font-medium text-foreground">
          <span>Decision</span>
          <select
            className={control}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            required
          >
            <option value="">Choose a reply</option>
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
        </label>
      ) : (
        <label className="grid gap-1 text-xs font-medium text-foreground">
          <span>Reply</span>
          <textarea
            className={`${control} h-auto py-2`}
            rows={type === "string" ? 2 : 4}
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              setError("");
            }}
            placeholder={type === "string" ? "Enter your reply…" : "Enter a JSON reply…"}
            required
          />
        </label>
      )}
      {error === "" ? null : (
        <p role="alert" className="m-0 text-xs text-danger">
          {error}
        </p>
      )}
      <Button type="submit" size="sm" className="justify-self-start" isDisabled={pending}>
        {pending ? "Resuming…" : "Resume"}
      </Button>
    </form>
  );
}

const control =
  "h-8 w-full min-w-0 rounded-md border border-input bg-background px-2.5 text-[13px] font-normal text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/25";

function primitiveValue(type: string, input: string): unknown {
  if (input === "") throw new Error("A reply is required.");
  if (type === "string") return input;
  if (type === "boolean") return input === "true";
  if (type === "number" || type === "integer") {
    const number = Number(input);
    if (!Number.isFinite(number) || (type === "integer" && !Number.isInteger(number))) {
      throw new Error(`Reply must be a valid ${type}.`);
    }
    return number;
  }
  try {
    return JSON.parse(input);
  } catch {
    throw new Error("Reply must be valid JSON.");
  }
}

function requestSummary(value: unknown): string {
  if (typeof value === "string") return value;
  const text = JSON.stringify(value);
  return text ?? "Review the pending request.";
}
