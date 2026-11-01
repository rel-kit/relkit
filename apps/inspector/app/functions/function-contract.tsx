import { ArrowDownLeft, ArrowUpRight, Link2 } from "lucide-react";
import Link from "next/link";
import type { InspectorObject } from "../../lib/api-types";
import { middleTruncate } from "../../lib/format";
import { DetailList } from "../../components/blocks/details";
import { Section } from "../../components/blocks/section";
import { StatusBadge } from "../../components/neon/status-badge";
import { Badge } from "../../components/ui/badge";
import { SchemaPanel } from "../schema-panel";
import { Count, EntityList, Quiet } from "../domains/catalog-kit";

/** Contract facts for the detail rail. */
export function FunctionFacts({
  node,
  generationId,
  graphHash,
}: {
  readonly node: InspectorObject;
  readonly generationId: string;
  readonly graphHash: string;
}) {
  const id = text(node.id);
  const domainId = text(node.domainId);
  const publishes = strings(node.publishes);
  return (
    <Section id="function-facts" title="Function detail">
      <DetailList
        items={[
          { label: "Function ID", value: id || "unknown", mono: true, copy: id },
          {
            label: "Domain",
            value: domainId ? (
              <Link
                href={`/domains/${encodeURIComponent(domainId)}`}
                className="text-foreground underline-offset-2 hover:underline"
              >
                {domainId}
              </Link>
            ) : (
              "unowned"
            ),
            mono: true,
          },
          { label: "Exposure", value: text(node.exposure) || "internal", mono: true },
          { label: "Invocation", value: text(node.invocationMode) || "callable", mono: true },
          { label: "Timeout", value: limit(node.timeoutMs, "default", " ms"), mono: true },
          { label: "Concurrency", value: limit(node.concurrency, "default"), mono: true },
          {
            label: "Publishes",
            value:
              publishes.length === 0 ? (
                "none"
              ) : (
                <span className="flex flex-wrap gap-x-2 gap-y-0.5">
                  {publishes.map((event) => (
                    <Link
                      key={event}
                      href={`/events/${encodeURIComponent(event)}`}
                      className="text-foreground underline-offset-2 hover:underline"
                    >
                      {event}
                    </Link>
                  ))}
                </span>
              ),
            mono: true,
          },
          { label: "Generation", value: generationId, mono: true, copy: generationId },
          {
            label: "Graph hash",
            value: <span title={graphHash}>{middleTruncate(graphHash, 26)}</span>,
            mono: true,
            copy: graphHash,
          },
        ]}
      />
    </Section>
  );
}

/** Schemas, declared errors, dependencies and graph edges. */
export function FunctionContract({
  node,
  declaredEdges,
  observedEdges,
}: {
  readonly node: InspectorObject;
  readonly declaredEdges: readonly InspectorObject[];
  readonly observedEdges: readonly InspectorObject[];
}) {
  const errors = records(node.errors);
  return (
    <>
      <div className="grid min-w-0 gap-4 2xl:grid-cols-2">
        <SchemaPanel title="Input schema" value={node.input} />
        <SchemaPanel title="Output schema" value={node.output} />
      </div>
      <DeclaredErrors errors={errors} />
      {node.dependencies === undefined || node.dependencies === null ? null : (
        <SchemaPanel title="Declared dependencies" value={node.dependencies} />
      )}
      <div className="grid min-w-0 gap-4 2xl:grid-cols-2">
        <EdgePanel
          title="Declared edges"
          edges={declaredEdges}
          relationship="declared"
          id={text(node.id)}
        />
        <EdgePanel
          title="Observed recent edges"
          edges={observedEdges}
          relationship="observed"
          id={text(node.id)}
        />
      </div>
    </>
  );
}

/** Declared error contracts as linked rows with HTTP status and retry policy. */
export function DeclaredErrors({ errors }: { readonly errors: readonly InspectorObject[] }) {
  return (
    <Section
      id="function-errors"
      title="Declared errors"
      description="Typed failures the handler may return"
      actions={<Count value={errors.length} />}
      flush
    >
      <EntityList
        empty="No errors are declared."
        rows={errors.map((error, index) => {
          const id = text(error.id) || text(record(error.ref)?.id);
          const status = record(error.http)?.status;
          return {
            key: `${id}:${index}`,
            href: id ? `/errors/${encodeURIComponent(id)}` : undefined,
            title: id || "error",
            trailing: (
              <>
                {text(error.retry) ? <Quiet>retry {text(error.retry)}</Quiet> : null}
                <StatusBadge
                  tone={typeof status === "number" && status >= 500 ? "danger" : "warning"}
                  label={typeof status === "number" ? String(status) : "default"}
                />
              </>
            ),
          };
        })}
      />
    </Section>
  );
}

function EdgePanel({
  title,
  edges,
  relationship,
  id,
}: {
  readonly title: string;
  readonly edges: readonly InspectorObject[];
  readonly relationship: "declared" | "observed";
  readonly id: string;
}) {
  return (
    <Section
      id={`${relationship}-function-edges-section`}
      aria-labelledby={`${relationship}-function-edges`}
      title={<span id={`${relationship}-function-edges`}>{title}</span>}
      description={
        relationship === "declared"
          ? "Compiled into the active graph"
          : "Seen at runtime in recent executions"
      }
      actions={<Count value={edges.length} />}
      flush
    >
      <EntityList
        empty={`No ${relationship} edges are reported.`}
        rows={edges.map((edge, index) => {
          const from = text(edge.from);
          const to = text(edge.to);
          const kind = text(edge.kind) || text(edge.relationship) || "edge";
          const incoming = to === id;
          const outgoing = from === id;
          const other = incoming ? from : to;
          const Icon = incoming ? ArrowDownLeft : outgoing ? ArrowUpRight : Link2;
          return {
            key: `${from}:${to}:${index}`,
            href: edgeHref(kind, other, incoming),
            lead: (
              <span
                className="inline-flex size-5 items-center justify-center rounded-sm border border-border text-muted-foreground"
                title={incoming ? "Incoming" : outgoing ? "Outgoing" : "Related"}
              >
                <Icon aria-hidden="true" className="size-3" />
                <span className="sr-only">
                  {relationship} · {incoming ? "Incoming" : outgoing ? "Outgoing" : "Related"}
                </span>
              </span>
            ),
            title: (
              <>
                {outgoing || incoming ? null : <>{from || "unknown"} → </>}
                {other || "unknown"}
              </>
            ),
            trailing: <Badge>{kind}</Badge>,
          };
        })}
      />
    </Section>
  );
}

function edgeHref(kind: string, other: string, incoming: boolean): string | undefined {
  if (other === "") return undefined;
  const encoded = encodeURIComponent(other);
  if (kind === "declares-error") return `/errors/${encoded}`;
  if (kind === "publishes-event" || kind === "listens-to-event") return `/events/${encoded}`;
  if (kind === "exposes-function" && incoming) return `/domains/${encoded}`;
  if (kind === "targets-function" && incoming) return `/routes/${encoded}`;
  if (kind === "calls-function" || kind === "invokes-function") return `/functions/${encoded}`;
  return undefined;
}

function limit(value: unknown, fallback: string, unit = ""): string {
  return typeof value === "number" ? `${value.toLocaleString("en-US")}${unit}` : fallback;
}
function strings(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
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
  return typeof value === "string" ? value : "";
}
