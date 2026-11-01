"use client";

import { useEffect, useRef, useState } from "react";
import type { InspectorObject } from "../../lib/api-types";
import { collectRouteFields, composeRouteRequest, type RouteField } from "../../lib/route-composer";
import type { RouteInvocationResult } from "../../lib/route-request";
import type { RouteStreamFrame } from "../../lib/route-request";
import type { FormEvent } from "react";
import { Send } from "lucide-react";
import { Section } from "../../components/blocks/section";
import { StatusBadge } from "../../components/neon/status-badge";
import { Button } from "../../components/ui/button";
import { MethodChip } from "../domains/catalog-kit";
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
    setStatus(invokeStream === undefined ? "Sending request…" : "Opening stream…");
    try {
      if (invokeStream === undefined) {
        onComplete(await invoke({ path: built.path, init: built.init }));
        setStatus("Request completed.");
      } else {
        streamController.current?.abort();
        const controller = new AbortController();
        streamController.current = controller;
        setStreamFrames([]);
        onComplete(
          await invokeStream(
            { path: built.path, init: built.init },
            (frame) => {
              const id = nextFrameId.current++;
              setStreamFrames((current) => [...current.slice(-99), { id, frame }]);
            },
            controller.signal,
          ),
        );
        setStatus("Stream ended.");
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
          <span className="ml-auto font-mono text-[11px] text-muted-foreground" aria-hidden="true">
            {status}
          </span>
        </div>
      </form>
      {streamFrames.length === 0 ? null : (
        <div className="mt-4 overflow-hidden rounded-md border border-border bg-background">
          <div className="flex h-8 items-center justify-between border-b border-border px-3 text-[11px] text-muted-foreground">
            <span className="font-medium tracking-wide uppercase">Stream</span>
            <span className="font-mono tabular-nums">{streamFrames.length} frames</span>
          </div>
          <ul
            className="neon-scroll-fade m-0 max-h-80 list-none overflow-y-auto p-0 font-mono text-[11px] leading-5"
            aria-label="Stream frames"
          >
            {streamFrames.map(({ id, frame }) => (
              <li
                className="grid grid-cols-[3rem_6rem_minmax(0,1fr)] gap-2 border-b border-border/50 px-3 py-1 last:border-b-0"
                key={id}
              >
                <span className="text-muted-foreground/70 tabular-nums">#{id + 1}</span>
                <strong className="truncate font-medium text-info">
                  {frame.kind === "sse" ? frame.event : frame.kind}
                </strong>
                <span className="min-w-0 break-all whitespace-pre-wrap text-foreground/90">
                  {framePreview(frame)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  );
}

const SOURCE_ORDER = ["path", "query", "header", "cookie", "body", "whole-body", "multipart"];

function groupFields(
  fields: readonly RouteField[],
): readonly { source: string; fields: readonly RouteField[] }[] {
  const groups = new Map<string, RouteField[]>();
  for (const field of fields) {
    const list = groups.get(field.source) ?? [];
    list.push(field);
    groups.set(field.source, list);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => rank(left) - rank(right))
    .map(([source, list]) => ({ source, fields: list }));
}

function rank(source: string): number {
  const index = SOURCE_ORDER.indexOf(source);
  return index === -1 ? SOURCE_ORDER.length : index;
}

function sourceLabel(source: string): string {
  switch (source) {
    case "path":
      return "Path params";
    case "query":
      return "Query";
    case "header":
      return "Headers";
    case "cookie":
      return "Cookies";
    case "body":
      return "Body";
    case "whole-body":
      return "Raw body";
    case "multipart":
      return "Multipart";
    default:
      return source;
  }
}

function framePreview(frame: RouteStreamFrame): string {
  if (frame.kind === "text") return frame.value;
  if (frame.kind === "bytes") return `${frame.byteLength} bytes`;
  try {
    return typeof frame.data === "string" ? frame.data : JSON.stringify(frame.data);
  } catch {
    return "unavailable";
  }
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
