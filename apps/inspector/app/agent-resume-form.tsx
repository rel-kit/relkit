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
    <form className="agent-resume-form" onSubmit={submit} aria-label="Human input required">
      <div>
        <strong>Human input required</strong>
        {waiting.requests.map((request, index) => (
          <p key={`${request.node}:${index}`}>
            {requestSummary(request.value)} <small>at {request.node}</small>
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
        <label>
          <span>Decision</span>
          <select value={value} onChange={(event) => setValue(event.target.value)} required>
            <option value="">Choose a reply</option>
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
        </label>
      ) : (
        <label>
          <span>Reply</span>
          <textarea
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
      {error === "" ? null : <p role="alert">{error}</p>}
      <Button type="submit" isDisabled={pending}>
        {pending ? "Resuming…" : "Resume"}
      </Button>
    </form>
  );
}

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
