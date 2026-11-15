import { ArrowDownLeft, ArrowUpRight, Link2 } from "lucide-react";
import type { InspectorObject } from "../../lib/api-types";
import { formatTimestamp, utcTimestamp } from "../../lib/format";
import { Section } from "../../components/blocks/section";
import { Badge } from "../../components/ui/badge";
import { Count, EntityList, Quiet } from "../domains/catalog-kit";

/** The edges of a function: declared in the graph, or observed in recent executions. */
export function EdgePanel({
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
            trailing: (
              <>
                {relationship === "observed" ? <Observed edge={edge} /> : null}
                <Badge>{kind}</Badge>
              </>
            ),
          };
        })}
      />
    </Section>
  );
}

/** How often an observed edge was seen, and when last. */
function Observed({ edge }: { readonly edge: InspectorObject }) {
  const count = typeof edge.count === "number" ? edge.count : undefined;
  const last = text(edge.lastSeenAt);
  if (count === undefined && last === "") return null;
  return (
    <Quiet>
      {count === undefined
        ? null
        : `seen ${count.toLocaleString("en-US")} ${count === 1 ? "time" : "times"}`}
      {count !== undefined && last !== "" ? ", " : null}
      {last === "" ? null : (
        <>
          last{" "}
          <time dateTime={last} title={utcTimestamp(last)}>
            {formatTimestamp(last)}
          </time>
        </>
      )}
    </Quiet>
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

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}
