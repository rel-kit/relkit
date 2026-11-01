"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type {
  FunctionInvocationInput,
  FunctionInvocationResult,
} from "../../lib/function-invocation";
import { Play } from "lucide-react";
import { CodeBlock } from "../../components/blocks/code-block";
import { Section } from "../../components/blocks/section";
import { StatusBadge } from "../../components/neon/status-badge";
import { Button } from "../../components/ui/button";
import { cn } from "../../lib/utils";
import { fieldControlClass, fieldTextareaClass, SchemaForm } from "../schema-form";
import { schemaFields, schemaInput } from "../../lib/schema-model";

export function FunctionInvocation({
  functionId,
  generationId,
  graphHash,
  inputSchema,
  invoke,
  onComplete,
}: {
  readonly functionId: string;
  readonly generationId: string;
  readonly graphHash: string;
  readonly inputSchema?: unknown;
  readonly invoke: (input: FunctionInvocationInput) => Promise<FunctionInvocationResult>;
  readonly onComplete: (result: FunctionInvocationResult) => void;
}) {
  const [value, setValue] = useState("{}");
  const [values, setValues] = useState<Record<string, unknown>>(() =>
    Object.fromEntries(
      schemaFields(inputSchema).flatMap((field) =>
        field.defaultValue === undefined ? [] : [[field.key, field.defaultValue]],
      ),
    ),
  );
  const [fieldErrors, setFieldErrors] = useState<readonly string[]>([]);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<FunctionInvocationResult>();
  const [status, setStatus] = useState("");
  const errorRef = useRef<HTMLParagraphElement>(null);
  const resultHeadingRef = useRef<HTMLHeadingElement>(null);
  const fields = schemaFields(inputSchema);

  useEffect(() => {
    if (error !== "") errorRef.current?.focus();
  }, [error]);

  useEffect(() => {
    if (result !== undefined) resultHeadingRef.current?.focus();
  }, [result]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    let input: unknown;
    if (fields.length > 0) {
      const built = schemaInput(inputSchema, values);
      setFieldErrors(built.errors);
      if (built.errors.length > 0 || built.value === undefined) {
        setError(built.errors.join(" "));
        setStatus("Invocation validation failed.");
        return;
      }
      input = built.value;
    } else {
      try {
        input = JSON.parse(value);
      } catch {
        setError("Enter valid JSON input.");
        setStatus("Invocation validation failed.");
        return;
      }
    }
    setError("");
    setPending(true);
    setStatus("Invoking function…");
    try {
      const next = await invoke({
        functionId,
        generationId,
        graphHash,
        input,
        idempotencyKey: `inspector-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      });
      setResult(next);
      onComplete(next);
      setStatus("Function invocation completed.");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Invocation failed.");
      setStatus("Function invocation failed.");
    } finally {
      setPending(false);
    }
  };

  return (
    <Section
      className="composer-panel"
      aria-labelledby="function-invocation-heading"
      title={<span id="function-invocation-heading">Invoke function</span>}
      description="Input is sent to the active generation only after you submit."
      actions={<StatusBadge tone="neutral" label="local development" />}
    >
      <form
        aria-labelledby="function-invocation-heading"
        aria-describedby="function-invocation-description"
        aria-busy={pending}
        onSubmit={submit}
        noValidate
        className="grid min-w-0 gap-4"
        style={{ marginTop: 0 }}
      >
        <p id="function-invocation-description" className="sr-only">
          Enter values that match the function input schema, then invoke the active generation.
        </p>
        {fields.length > 0 ? (
          <SchemaForm
            schema={inputSchema}
            values={values}
            errors={fieldErrors}
            onChange={(key, next) => {
              setValues((current) => ({ ...current, [key]: next }));
              setFieldErrors([]);
              setError("");
            }}
          />
        ) : (
          <label className="grid min-w-0 gap-1.5" htmlFor="function-input">
            <span className="font-mono text-xs font-medium text-foreground">JSON input</span>
            <textarea
              id="function-input"
              name="input"
              rows={7}
              className={cn(fieldControlClass, fieldTextareaClass)}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              aria-describedby={
                error === "" ? "function-input-help" : "function-input-help function-input-error"
              }
              aria-errormessage={error === "" ? undefined : "function-input-error"}
              aria-invalid={error !== ""}
            />
            <small id="function-input-help" className="text-[11px] text-muted-foreground">
              The active function schema validates the value.
            </small>
          </label>
        )}
        {error !== "" && (
          <p
            ref={errorRef}
            id="function-input-error"
            className="m-0 max-w-none rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-xs text-danger outline-none"
            role="alert"
            tabIndex={-1}
          >
            {error}
          </p>
        )}
        <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          {status}
        </p>
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <Button type="submit" isDisabled={pending}>
            <Play aria-hidden="true" />
            {pending ? "Invoking…" : "Invoke locally"}
          </Button>
          <span className="ml-auto font-mono text-[11px] text-muted-foreground" aria-hidden="true">
            {status}
          </span>
        </div>
      </form>
      {result !== undefined && (
        <div
          className="mt-4 grid min-w-0 gap-2 border-t border-border pt-4"
          aria-live="polite"
          aria-atomic="true"
        >
          <div className="flex items-center gap-2">
            <h3
              ref={resultHeadingRef}
              tabIndex={-1}
              className="m-0 text-[13px] font-semibold text-foreground outline-none"
            >
              Invocation output
            </h3>
            <StatusBadge tone="success" label="applied" />
            {record(result.action)?.actionId ? (
              <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                Action recorded: {String(record(result.action)?.actionId)}
              </span>
            ) : null}
          </div>
          <CodeBlock value={result.output} label="invocation output" maxHeight="24rem" />
        </div>
      )}
    </Section>
  );
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
