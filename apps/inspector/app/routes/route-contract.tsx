import { ArrowUpRight, Network } from "lucide-react";
import Link from "next/link";
import { openApiOperation } from "../../lib/route-openapi";
import type { InspectorObject } from "../../lib/api-types";
import { SCALAR_API_REFERENCE_URL } from "../../lib/api-reference";
import { signalKey } from "../../lib/observability-model";
import { Section } from "../../components/blocks/section";
import { DetailList } from "../../components/blocks/details";
import { CodeBlock } from "../../components/blocks/code-block";
import { HistoryList, type HistoryEntry } from "../../components/neon/history-list";
import { StatusBadge, type StatusTone } from "../../components/neon/status-badge";
import { Badge } from "../../components/ui/badge";
import { SchemaPanel } from "../schema-panel";
import { DeclaredErrors } from "../functions/function-contract";
import { Count, EntityList, MethodChip, Quiet } from "../domains/catalog-kit";

/** Contract facts for the detail rail. */
export function RouteFacts({
  route,
  target,
}: {
  readonly route: InspectorObject;
  readonly target?: InspectorObject | undefined;
}) {
  const config = record(route.config);
  const id = text(route.id);
  const method = text(config?.method) || "HTTP";
  const path = text(config?.path) || "/";
  const raw = config?.rawHandler === true;
  const targetId = text(route.targetFunctionId);
  const auth = text(record(config?.auth)?.kind);
  const stream = text(record(config?.stream)?.format);
  const middleware = Array.isArray(config?.middleware) ? config.middleware.length : 0;
  return (
    <Section id="route-facts" title="Route detail">
      <DetailList
        items={[
          { label: "Route ID", value: id || "unknown", mono: true, copy: id },
          { label: "Method", value: <MethodChip method={method} /> },
          { label: "Path", value: path, mono: true, copy: path },
          {
            label: "Handler",
            value:
              raw || targetId === "" ? (
                "Raw HTTP handler"
              ) : (
                <Link
                  href={`/functions/${encodeURIComponent(targetId)}`}
                  className="text-foreground underline-offset-2 hover:underline"
                >
                  {targetId}
                </Link>
              ),
            mono: true,
          },
          ...(target?.domainId === undefined
            ? []
            : [
                {
                  label: "Domain",
                  value: (
                    <Link
                      href={`/domains/${encodeURIComponent(text(target.domainId))}`}
                      className="text-foreground underline-offset-2 hover:underline"
                    >
                      {text(target.domainId)}
                    </Link>
                  ),
                  mono: true,
                },
              ]),
          { label: "Auth", value: auth || "none declared", mono: true },
          {
            label: "Response mode",
            value: stream ? `stream · ${stream}` : "single response",
            mono: true,
          },
          { label: "Middleware", value: middleware.toLocaleString("en-US"), mono: true },
        ]}
      />
      <a
        className="mt-4 inline-flex items-center gap-1 text-xs text-muted-foreground no-underline hover:text-foreground"
        href={SCALAR_API_REFERENCE_URL}
        target="_blank"
        rel="noreferrer"
      >
        Explore this operation in the API Reference
        <ArrowUpRight aria-hidden="true" className="size-3" />
      </a>
    </Section>
  );
}

/** Request mapping, responses, schemas, middleware and the generated OpenAPI operation. */
export function RouteContract({
  route,
  target,
}: {
  readonly route: InspectorObject;
  readonly target?: InspectorObject | undefined;
}) {
  const config = record(route.config);
  const mapping = requestFields(config?.request);
  return (
    <>
      <div className="grid min-w-0 gap-4 2xl:grid-cols-2">
        <Section
          id="route-request-mapping"
          title="Request mapping"
          description="Where each input value is read from"
          actions={<Count value={mapping.length} />}
          flush
        >
          {mapping.length === 0 ? (
            <div className="p-1.5">
              <SchemaPanelBody value={config?.request} empty="No request fields are mapped." />
            </div>
          ) : (
            <EntityList
              label="Mapped request fields"
              empty="No request fields are mapped."
              rows={mapping.map((field) => ({
                key: field.key,
                title: field.key,
                detail: field.name !== field.key ? `as ${field.name}` : undefined,
                trailing: (
                  <>
                    <Badge>{field.location}</Badge>
                    <Quiet>{field.optional ? "optional" : "required"}</Quiet>
                  </>
                ),
              }))}
            />
          )}
        </Section>
        <ResponsesSection value={config?.responses} />
      </div>
      <div className="grid min-w-0 gap-4 2xl:grid-cols-2">
        <SchemaPanel title="Input schema" value={target?.input} />
        <SchemaPanel title="Output schema" value={target?.output} />
      </div>
      {target?.errors === undefined ? null : <DeclaredErrors errors={records(target.errors)} />}
      <RouteMiddleware value={config?.middleware} />
      <Section
        id="route-openapi"
        title="OpenAPI operation"
        description="Generated from this route and its target function"
      >
        <CodeBlock
          value={openApiOperation(route, target)}
          label="OpenAPI operation"
          maxHeight="22rem"
        />
      </Section>
    </>
  );
}

function SchemaPanelBody({ value, empty }: { readonly value: unknown; readonly empty: string }) {
  if (value === undefined || value === null)
    return <p className="m-0 px-2.5 py-2 text-xs text-muted-foreground">{empty}</p>;
  return <CodeBlock value={value} label="request mapping" maxHeight="16rem" />;
}

function ResponsesSection({ value }: { readonly value: unknown }) {
  const responses = records(value);
  return (
    <Section
      id="route-responses"
      title="Responses"
      description="Declared status mappings"
      actions={<Count value={responses.length} />}
      flush
    >
      <EntityList
        label="Declared responses"
        empty="No response mappings are declared."
        rows={responses.map((response, index) => {
          const status = typeof response.status === "number" ? response.status : undefined;
          const errorId = text(response.errorId);
          return {
            key: `${text(response.id)}:${index}`,
            lead: (
              <StatusBadge
                tone={statusCodeTone(status)}
                label={status === undefined ? "—" : String(status)}
              />
            ),
            title: errorId || text(response.id) || "response",
            detail: text(response.kind) || undefined,
            href: errorId ? `/errors/${encodeURIComponent(errorId)}` : undefined,
            trailing:
              response.schema === undefined ? undefined : (
                <Quiet>{schemaShape(response.schema)}</Quiet>
              ),
          };
        })}
      />
    </Section>
  );
}

function RouteMiddleware({ value }: { readonly value: unknown }) {
  const middleware = records(value);
  return (
    <Section
      id="route-middleware"
      aria-labelledby="route-middleware-heading"
      title={<span id="route-middleware-heading">Middleware</span>}
      description="Runs before the handler, in canonical order"
      actions={<Count value={middleware.length} />}
      flush
    >
      <EntityList
        empty="No middleware matches this route."
        rows={middleware.map((item, index) => ({
          key: text(item.id) || String(index),
          href: `/middlewares/${encodeURIComponent(text(item.id))}`,
          lead: <Quiet>{String(index + 1).padStart(2, "0")}</Quiet>,
          title: text(item.id),
          detail: <code className="bg-transparent p-0 font-mono">{text(item.path)}</code>,
          trailing: text(item.match) ? <Badge>{text(item.match)}</Badge> : undefined,
        }))}
      />
    </Section>
  );
}

/** Recent active-backend requests for this route; rows open the request record. */
export function RecentRequests({ requests }: { readonly requests: readonly InspectorObject[] }) {
  const entries: HistoryEntry[] = requests.map((request) => {
    const requestId = text(request.requestId);
    const traceId = text(request.traceId);
    const status = typeof request.status === "number" ? request.status : undefined;
    const outcome = text(request.outcome);
    const tone = requestTone(status, outcome, text(request.phase));
    return {
      id: signalKey(request),
      tone,
      statusLabel: [status, outcome].filter(Boolean).join(" ") || "Request",
      lead: <MethodChip method={text(request.method) || "HTTP"} className="mr-0!" />,
      title: text(request.rawPath) || text(request.path) || requestId || "request",
      meta: [
        ...(status === undefined ? [] : [String(status)]),
        ...(outcome ? [outcome] : []),
        ...(requestId ? [requestId.replace(/^request-/, "").slice(0, 8)] : []),
      ],
      ...(typeof request.durationMs === "number" ? { durationMs: request.durationMs } : {}),
      ...(text(request.startedAt) ? { at: text(request.startedAt) } : {}),
      ...(requestId ? { href: `/requests/${encodeURIComponent(requestId)}` } : {}),
      ...(traceId ? { attributes: { "data-trace-id": traceId } } : {}),
    };
  });
  return (
    <Section
      id="recent-requests"
      aria-labelledby="recent-requests-heading"
      title={<span id="recent-requests-heading">Recent requests</span>}
      description="Latest calls retained by the active backend"
      actions={<Count value={requests.length} />}
      flush
    >
      {entries.length === 0 ? (
        <p className="m-0 px-4 py-3 text-xs text-muted-foreground">
          No requests are retained for this route yet. Send one above to see it here.
        </p>
      ) : (
        <HistoryList
          label="Recent route requests"
          entries={entries}
          actions={(entry) => {
            const traceId = entry.attributes?.["data-trace-id"];
            return traceId ? (
              <Link
                href={`/traces/${encodeURIComponent(traceId)}`}
                aria-label="Open trace for this request"
                title="Open trace"
                className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground no-underline hover:bg-muted hover:text-foreground"
              >
                <Network aria-hidden="true" className="size-3.5" />
              </Link>
            ) : null;
          }}
        />
      )}
    </Section>
  );
}

export function statusCodeTone(status: number | undefined): StatusTone {
  if (status === undefined) return "neutral";
  if (status < 300) return "success";
  if (status < 400) return "info";
  if (status < 500) return "warning";
  return "danger";
}

function requestTone(status: number | undefined, outcome: string, phase: string): StatusTone {
  if (phase && phase !== "completed") return "live";
  if (status !== undefined) return statusCodeTone(status);
  if (outcome === "success") return "success";
  return outcome ? "danger" : "neutral";
}

interface MappedField {
  readonly key: string;
  readonly name: string;
  readonly location: string;
  readonly optional: boolean;
}

function requestFields(value: unknown): readonly MappedField[] {
  const fields = record(record(value)?.fields);
  if (fields === undefined) return [];
  return Object.entries(fields).flatMap(([key, raw]) => {
    const field = record(raw);
    if (field === undefined) return [];
    const optional = field.kind === "optional";
    const inner = optional ? (record(field.value) ?? {}) : field;
    return [
      {
        key,
        name: text(inner.name) || key,
        location: text(inner.kind) || "input",
        optional,
      },
    ];
  });
}

function schemaShape(value: unknown): string {
  const schema = record(value);
  const properties = record(schema?.properties);
  if (properties) {
    const count = Object.keys(properties).length;
    return `${count} ${count === 1 ? "field" : "fields"}`;
  }
  return text(schema?.type) || "schema";
}

function records(value: unknown): readonly InspectorObject[] {
  return Array.isArray(value)
    ? value.flatMap((item): InspectorObject[] => {
        const entry = record(item);
        return entry === undefined ? [] : [entry];
      })
    : [];
}
function record(value: unknown): InspectorObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as InspectorObject)
    : undefined;
}
function text(value: unknown): string {
  return value === undefined || value === null ? "" : String(value);
}
