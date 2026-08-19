"use client";

import { useRef, useState } from "react";
import type { InspectorObject } from "../../lib/api-types";
import { collectRouteFields, composeRouteRequest, type RouteField } from "../../lib/route-composer";
import type { RouteInvocationResult } from "../../lib/route-request";
import type { FormEvent } from "react";
import { RouteFieldInput } from "./route-field";

export function RouteComposer({
  route,
  target,
  invoke,
  onComplete,
}: {
  readonly route: InspectorObject;
  readonly target?: InspectorObject;
  readonly invoke: (input: { path: string; init: RequestInit }) => Promise<RouteInvocationResult>;
  readonly onComplete: (result: RouteInvocationResult) => void;
}) {
  const config = record(route.config);
  const fields = collectRouteFields(config?.request, target?.input);
  const [values, setValues] = useState<Record<string, unknown>>(() => defaults(fields));
  const [errors, setErrors] = useState<readonly { key: string; message: string }[]>([]);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState("");
  const fieldRefs = useRef<Record<string, HTMLInputElement | HTMLTextAreaElement | null>>({});
  const summaryRef = useRef<HTMLUListElement>(null);

  const focusField = (key: string): void => {
    if (key === "request") {
      summaryRef.current?.focus();
      return;
    }
    fieldRefs.current[key]?.focus();
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const built = composeRouteRequest(
      {
        method: text(config?.method) || "GET",
        path: text(config?.path) || "/",
        request: config?.request,
        inputSchema: target?.input,
      },
      values,
    );
    setErrors(built.errors);
    if (!built.ok || built.path === undefined || built.init === undefined) {
      setStatus("Request validation failed. Review the highlighted fields.");
      const firstError = built.errors[0];
      if (firstError !== undefined) focusField(firstError.key);
      return;
    }
    setPending(true);
    setStatus("Sending request…");
    try {
      onComplete(await invoke({ path: built.path, init: built.init }));
      setStatus("Request completed.");
    } catch (error) {
      setErrors([
        { key: "request", message: error instanceof Error ? error.message : "Request failed." },
      ]);
      setStatus("Request failed.");
      queueMicrotask(() => focusField("request"));
    } finally {
      setPending(false);
    }
  };

  return (
    <section className="panel composer-panel" aria-labelledby="composer-heading">
      <p className="eyebrow">ACTIVE BACKEND</p>
      <h2 id="composer-heading">Compose a request</h2>
      <p className="supporting-copy">
        Fields are generated from the route mapping and target schema. Values are sent only when you
        submit.
      </p>
      <form
        aria-labelledby="composer-heading"
        aria-describedby="composer-description"
        aria-busy={pending}
        onSubmit={submit}
        noValidate
      >
        <p id="composer-description" className="sr-only">
          Enter values for the route contract, then submit to the active development backend.
        </p>
        {fields.length === 0 ? (
          <p className="supporting-copy">This route has no editable mapped inputs.</p>
        ) : (
          fields.map((field) => (
            <RouteFieldInput
              key={field.key}
              field={field}
              value={values[field.key]}
              onChange={(value) => setValues((current) => ({ ...current, [field.key]: value }))}
              inputRef={(element) => {
                fieldRefs.current[field.key] = element;
              }}
              error={errors.find((item) => item.key === field.key)?.message}
            />
          ))
        )}
        {errors.length > 0 && (
          <ul ref={summaryRef} className="field-errors" role="alert" tabIndex={-1}>
            {errors.map((error) => (
              <li key={`${error.key}:${error.message}`}>
                <span>{error.key}:</span> {error.message}
              </li>
            ))}
          </ul>
        )}
        <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          {status}
        </p>
        <button className="button-link" type="submit" disabled={pending}>
          {pending ? "Sending…" : "Send request"}
        </button>
      </form>
    </section>
  );
}

function defaults(fields: readonly RouteField[]): Record<string, unknown> {
  return Object.fromEntries(
    fields.flatMap((field) =>
      field.defaultValue === undefined ? [] : [[field.key, field.defaultValue]],
    ),
  );
}
function record(value: unknown): InspectorObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as InspectorObject)
    : undefined;
}
function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}
