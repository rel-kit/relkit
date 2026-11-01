import { Database, HardDrive } from "lucide-react";
import { CodeBlock } from "../components/blocks/code-block";
import { DetailList } from "../components/blocks/details";
import { Section } from "../components/blocks/section";
import { StatusBadge, statusTone, type StatusTone } from "../components/neon/status-badge";
import type { OperationStatus, ResourceOperationView, ResourceView } from "../lib/resources-model";
import { DetailLayout } from "./detail-layout";
import { ResourceExplorer } from "./resource-explorer";
import { SourceLink } from "./source-link";

export function ResourceDetailView({ view }: { readonly view: ResourceView }) {
  const label = view.kind === "bucket" ? "Bucket" : "Cache";
  const runtime = view.runtimeState ?? "not reported";
  return (
    <DetailLayout
      header={{
        kicker: label,
        title: view.id,
        icon: view.kind === "bucket" ? <HardDrive /> : <Database />,
        description:
          "Provider storage remains behind the versioned API; this page is read-only metadata.",
        badges: (
          <>
            <StatusBadge tone={statusTone(runtime)} label={runtime} />
            <StatusBadge tone="neutral" label={view.profile} />
          </>
        ),
        meta: <SourceLink source={view.descriptor.source} />,
      }}
      aside={
        <>
          <OperationPanel operations={view.operations} />
          {Object.keys(view.stats).length > 0 && <StatsPanel stats={view.stats} />}
        </>
      }
    >
      <Section title={`${label} detail`} id="resource-identity">
        <DetailList
          columns={3}
          items={[
            { label: "Profile", value: view.profile, mono: true },
            {
              label: "Capabilities",
              value:
                view.capabilities.length === 0 ? (
                  "None advertised"
                ) : (
                  <span className="flex flex-wrap gap-1">
                    {view.capabilities.map((capability) => (
                      <span
                        key={capability}
                        className="rounded-sm bg-muted px-1.5 py-px font-mono text-[10.5px]"
                      >
                        {capability}
                      </span>
                    ))}
                  </span>
                ),
            },
            { label: "Source", value: <SourceLink source={view.descriptor.source} /> },
          ]}
        />
      </Section>
      <ResourceExplorer kind={view.kind} id={view.id} />
      <PolicyPanel view={view} />
    </DetailLayout>
  );
}

function OperationPanel({ operations }: { readonly operations: readonly ResourceOperationView[] }) {
  return (
    <Section
      title="Provider operations"
      id="resource-operations"
      description="Safe operation metadata"
      flush
      actions={
        <span className="rounded-sm border border-border px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground tabular-nums">
          {operations.length}
        </span>
      }
    >
      {operations.length === 0 ? (
        <p className="m-0 px-4 py-6 text-center text-xs text-muted-foreground">
          No operations are declared.
        </p>
      ) : (
        <ul className="m-0 list-none p-0">
          {operations.map((operation) => (
            <li
              className="flex h-9 items-center justify-between gap-3 border-b border-border/60 px-4 last:border-b-0"
              key={operation.name}
            >
              <code className="truncate font-mono text-xs">{operation.name}</code>
              <StatusBadge
                tone={operationTone(operation.status)}
                label={statusLabel(operation.status)}
              />
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function PolicyPanel({ view }: { readonly view: ResourceView }) {
  const descriptor = view.descriptor;
  const cache = view.kind === "cache";
  return (
    <Section
      title={cache ? "Cache schema and TTL" : "Bucket object policy"}
      id="resource-policy"
      description={cache ? "Cache inspection is bounded and read-only." : "Declared policy"}
    >
      {cache ? (
        <div className="grid gap-4">
          <DetailList
            columns={2}
            items={[
              { label: "Default TTL", value: formatMs(descriptor.defaultTtlMs), mono: true },
              { label: "Maximum TTL", value: formatMs(descriptor.maxTtlMs), mono: true },
            ]}
          />
          <div className="grid min-w-0 gap-3 lg:grid-cols-2">
            <div className="grid min-w-0 gap-1.5">
              <h3 className="m-0 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                Key schema
              </h3>
              <CodeBlock value={descriptor.keySchema} label="key schema" maxHeight="18rem" />
            </div>
            <div className="grid min-w-0 gap-1.5">
              <h3 className="m-0 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                Value schema
              </h3>
              <CodeBlock value={descriptor.valueSchema} label="value schema" maxHeight="18rem" />
            </div>
          </div>
        </div>
      ) : (
        <DetailList
          columns={3}
          items={[
            { label: "Visibility", value: descriptor.visibility || "Unavailable" },
            {
              label: "Maximum object bytes",
              value: formatNumber(descriptor.maxObjectBytes),
              mono: true,
            },
            {
              label: "Allowed content types",
              value: descriptor.allowedContentTypes?.join(", ") || "Provider default",
              mono: true,
            },
          ]}
        />
      )}
    </Section>
  );
}

function StatsPanel({ stats }: { readonly stats: Readonly<Record<string, number>> }) {
  return (
    <Section title="Counters" id="resource-stats" description="Safe runtime state">
      <DetailList
        columns={2}
        items={Object.entries(stats).map(([key, value]) => ({
          label: key,
          value: (
            <span className="font-mono text-sm font-medium tabular-nums">
              {value.toLocaleString("en-US")}
            </span>
          ),
        }))}
      />
    </Section>
  );
}

function operationTone(status: OperationStatus): StatusTone {
  return status === "declared" || status === "supported"
    ? "success"
    : status === "unsupported"
      ? "danger"
      : "neutral";
}

function statusLabel(status: OperationStatus): string {
  return status === "declared"
    ? "Contract operation"
    : status === "supported"
      ? "Provider capability"
      : status === "unsupported"
        ? "Unsupported"
        : "Not advertised";
}

function formatNumber(value: number | undefined): string {
  return value === undefined ? "Provider default" : value.toLocaleString("en-US");
}

function formatMs(value: number | undefined): string {
  return value === undefined ? "Provider default" : `${value.toLocaleString("en-US")} ms`;
}
