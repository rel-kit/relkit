"use client";

import { useEffect, useRef, useState } from "react";
import type { InspectorObject } from "../../lib/api-types";
import { collectRouteFields, composeRouteRequest, type RouteField } from "../../lib/route-composer";
import type { RouteInvocationResult } from "../../lib/route-request";
import { routeOutcome, type RouteOutcome } from "../../lib/route-status";
import type { RouteStreamFrame } from "../../lib/route-request";
import type { FormEvent } from "react";
import { Send } from "lucide-react";
import { Section } from "../../components/blocks/section";
import { StatusBadge } from "../../components/neon/status-badge";
import { Button } from "../../components/ui/button";
import { MethodChip } from "../domains/catalog-kit";
import { defaults, groupFields, sourceLabel, StreamFrames } from "./route-composer-parts";
import { RouteFieldInput } from "./route-field";

export function RouteComposer({
  route,
  target,
  invoke,
  invokeStream,
  onComplete,
}: {
  readonly route: InspectorObject;
  readonly target?: InspectorObject | undefined;
  readonly invoke: (input: { path: string; init: RequestInit }) => Promise<RouteInvocationResult>;
  readonly invokeStream?:
    | ((
        input: { path: string; init: RequestInit },
        onFrame: (frame: RouteStreamFrame) => void,
        signal: AbortSignal,
      ) => Promise<RouteInvocationResult>)
    | undefined;
  readonly onComplete: (result: RouteInvocationResult) => void;
}) {
  const config = record(route.config);
  const fields = collectRouteFields(config?.request, target?.input);
  const [values, setValues] = useState<Record<string, unknown>>(() => defaults(fields));
  const [errors, setErrors] = useState<readonly { key: string; message: string }[]>([]);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState("");
  const [outcome, setOutcome] = useState<RouteOutcome>();
  const [streamFrames, setStreamFrames] = useState<
    readonly { readonly id: number; readonly frame: RouteStreamFrame }[]
  >([]);
  const fieldRefs = useRef<Record<string, HTMLInputElement | HTMLTextAreaElement | null>>({});
  const summaryRef = useRef<HTMLUListElement>(null);
  const streamController = useRef<AbortController | undefined>(undefined);
  const nextFrameId = useRef(0);
  useEffect(() => () => streamController.current?.abort(), []);

  const focusField = (key: string): void => {
    if (key === "request") {
      summaryRef.current?.focus();
      return;
    }
    fieldRefs.current[key]?.focus();
  };

  const finish = (result: RouteInvocationResult): void => {
    const next = routeOutcome(result);
    setOutcome(next);
    setStatus(next.text);
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
    setOutcome(undefined);
    setStatus(invokeStream === undefined ? "Sending request…" : "Opening stream…");
    try {
      if (invokeStream === undefined) {
        const result = await invoke({ path: built.path, init: built.init });
        onComplete(result);
        finish(result);
      } else {
        streamController.current?.abort();
        const controller = new AbortController();
        streamController.current = controller;
        setStreamFrames([]);
        const result = await invokeStream(
          { path: built.path, init: built.init },
          (frame) => {
            const id = nextFrameId.current++;
            setStreamFrames((current) => [...current.slice(-99), { id, frame }]);
          },
          controller.signal,
        );
        onComplete(result);
        finish(result);
      }
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

  const method = text(config?.method) || "GET";
  const path = text(config?.path) || "/";
  const groups = groupFields(fields);
  return (
    <Section
      className="composer-panel"
      aria-labelledby="composer-heading"
      title={<span id="composer-heading">Compose a request</span>}
      description="Fields come from the route mapping and target schema; nothing is sent until you submit."
      actions={invokeStream === undefined ? null : <StatusBadge tone="info" label="streaming" />}
    >
      <form
        aria-labelledby="composer-heading"
        aria-describedby="composer-description"
        aria-busy={pending}
        onSubmit={submit}
        noValidate
        className="grid min-w-0 gap-4"
        style={{ marginTop: 0 }}
      >
        <p id="composer-description" className="sr-only">
          Enter values for the route contract, then submit to the active development backend.
        </p>
        <div className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-muted/40 px-2.5 py-1.5">
          <MethodChip method={method} />
          <code className="min-w-0 flex-1 truncate bg-transparent p-0 font-mono text-xs text-foreground">
            {path}
          </code>
          <span className="hidden shrink-0 font-mono text-[11px] text-muted-foreground sm:inline">
            active backend
          </span>
        </div>
        {fields.length === 0 ? (
          <p className="m-0 text-xs text-muted-foreground">
            This route has no editable mapped inputs.
          </p>
        ) : (
          groups.map((group) => (
            <fieldset key={group.source} className="m-0 grid min-w-0 gap-3 border-0 p-0">
              <legend className="mb-2 flex items-center gap-2 p-0 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                {sourceLabel(group.source)}
                <span className="font-mono tracking-normal normal-case tabular-nums">
                  {group.fields.length}
                </span>
              </legend>
              <div className="@container min-w-0">
                <div className="grid min-w-0 gap-x-4 gap-y-3 @xl:grid-cols-2">
                  {group.fields.map((field) => (
                    <RouteFieldInput
                      key={field.key}
                      field={field}
                      value={values[field.key]}
                      onChange={(value) =>
                        setValues((current) => ({ ...current, [field.key]: value }))
                      }
                      inputRef={(element) => {
                        fieldRefs.current[field.key] = element;
                      }}
                      error={errors.find((item) => item.key === field.key)?.message}
                    />
                  ))}
                </div>
              </div>
            </fieldset>
          ))
        )}
        {errors.length > 0 && (
          <ul
            ref={summaryRef}
            className="m-0 grid list-none gap-1 rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-xs text-danger outline-none"
            role="alert"
            tabIndex={-1}
          >
            {errors.map((error) => (
              <li key={`${error.key}:${error.message}`}>
                <span className="font-mono font-medium">{error.key}:</span> {error.message}
              </li>
            ))}
          </ul>
        )}
        <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          {status}
        </p>
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <Button type="submit" isDisabled={pending}>
            <Send aria-hidden="true" />
            {pending ? "Sending…" : "Send request"}
          </Button>
          {invokeStream === undefined || !pending ? null : (
            <Button variant="secondary" onPress={() => streamController.current?.abort()}>
              Cancel stream
            </Button>
          )}
          {outcome === undefined ? (
            <span
              className="ml-auto font-mono text-[11px] text-muted-foreground"
              aria-hidden="true"
            >
              {status}
            </span>
          ) : null}
        </div>
        {outcome === undefined ? null : (
          <p
            id="route-outcome"
            data-tone={outcome.tone}
            className="m-0 max-w-none text-xs leading-5 text-muted-foreground data-[tone=danger]:text-danger data-[tone=success]:text-success"
          >
            {outcome.text}
          </p>
        )}
      </form>
      <StreamFrames frames={streamFrames} />
    </Section>
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
