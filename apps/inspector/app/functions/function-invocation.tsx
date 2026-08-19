"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type {
  FunctionInvocationInput,
  FunctionInvocationResult,
} from "../../lib/function-invocation";

export function FunctionInvocation({
  functionId,
  generationId,
  graphHash,
  invoke,
  onComplete,
}: {
  readonly functionId: string;
  readonly generationId: string;
  readonly graphHash: string;
  readonly invoke: (input: FunctionInvocationInput) => Promise<FunctionInvocationResult>;
  readonly onComplete: (result: FunctionInvocationResult) => void;
}) {
  const [value, setValue] = useState("{}");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<FunctionInvocationResult>();
  const [status, setStatus] = useState("");
  const errorRef = useRef<HTMLParagraphElement>(null);
  const resultHeadingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (error !== "") errorRef.current?.focus();
  }, [error]);

  useEffect(() => {
    if (result !== undefined) resultHeadingRef.current?.focus();
  }, [result]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    let input: unknown;
    try {
      input = JSON.parse(value);
    } catch {
      setError("Enter valid JSON input.");
      setStatus("Invocation validation failed.");
      return;
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
    <section className="panel composer-panel" aria-labelledby="function-invocation-heading">
      <p className="eyebrow">LOCAL DEVELOPMENT</p>
      <h2 id="function-invocation-heading">Invoke function</h2>
      <p className="supporting-copy">
        Input is sent to the active generation only after submission.
      </p>
      <form
        aria-labelledby="function-invocation-heading"
        aria-describedby="function-invocation-description"
        aria-busy={pending}
        onSubmit={submit}
        noValidate
      >
        <p id="function-invocation-description" className="sr-only">
          Enter a JSON value that matches the function input schema, then invoke the active
          generation.
        </p>
        <label className="composer-field" htmlFor="function-input">
          <span>JSON input</span>
          <textarea
            id="function-input"
            name="input"
            rows={7}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            aria-describedby={
              error === "" ? "function-input-help" : "function-input-help function-input-error"
            }
            aria-errormessage={error === "" ? undefined : "function-input-error"}
            aria-invalid={error !== ""}
          />
          <small id="function-input-help">The active function schema validates the value.</small>
        </label>
        {error !== "" && (
          <p
            ref={errorRef}
            id="function-input-error"
            className="field-errors"
            role="alert"
            tabIndex={-1}
          >
            {error}
          </p>
        )}
        <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          {status}
        </p>
        <button className="button-link" type="submit" disabled={pending}>
          {pending ? "Invoking…" : "Invoke locally"}
        </button>
      </form>
      {result !== undefined && (
        <div className="invocation-result" aria-live="polite" aria-atomic="true">
          <div className="section-heading">
            <h3 ref={resultHeadingRef} tabIndex={-1}>
              Invocation output
            </h3>
            <span className="badge">Applied</span>
          </div>
          <pre>{format(result.output)}</pre>
          {record(result.action)?.actionId && (
            <p className="supporting-copy">
              Action recorded: {String(record(result.action)?.actionId)}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function format(value: unknown): string {
  if (value === undefined) return "No output returned.";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "Output unavailable.";
  }
}
function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
