"use client";

import { FileCode2, KeyRound, ShieldCheck, Variable } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { FailedState, LoadingRows } from "../components/blocks/block-state";
import { DetailList } from "../components/blocks/details";
import { PageHeader } from "../components/blocks/page-header";
import { Section } from "../components/blocks/section";
import { EmptyState } from "../components/neon/empty-state";
import { SegmentedFilter } from "../components/neon/history-list";
import { StatusBadge, statusTone } from "../components/neon/status-badge";
import { TreeExplorer, type TreeGroup } from "../components/neon/tree-explorer";
import { createInspectorBackendStream, createInspectorClient } from "../lib/client";
import {
  normalizeEnvironment,
  type EnvironmentFieldView,
  type GenerationView,
} from "../lib/env-diagnostics-model";
import {
  environmentFlags,
  groupEnvironment,
  requirementLabel,
  type EnvironmentGrouping,
} from "../lib/overview-environment";
import { SourceLink } from "./source-link";

const PAGE_LIMIT = 100;
const MAX_PAGES = 10;

interface EnvironmentState {
  readonly status: "loading" | "ready" | "error";
  readonly fields: readonly EnvironmentFieldView[];
  readonly active?: GenerationView;
  readonly truncated: boolean;
}

export function EnvironmentClient() {
  const [revision, setRevision] = useState(0);
  const [liveState, setLiveState] = useState("connecting");
  const [data, setData] = useState<EnvironmentState>({
    status: "loading",
    fields: [],
    truncated: false,
  });
  const [grouping, setGrouping] = useState<EnvironmentGrouping>("prefix");
  const [selected, setSelected] = useState<string>();

  useEffect(() => {
    const stream = createInspectorBackendStream({
      onStateChange: (snapshot) => setLiveState(snapshot.state),
      onInvalidate: (tags) => tags.includes("env") && setRevision((value) => value + 1),
    });
    stream.start();
    return () => stream.stop();
  }, []);

  useEffect(() => {
    let disposed = false;
    const api = createInspectorClient();
    setData((current) => ({ ...current, status: "loading" }));
    void (async () => {
      const fields: EnvironmentFieldView[] = [];
      let active: GenerationView | undefined;
      let cursor: string | undefined;
      let pages = 0;
      do {
        const payload = await api.env({
          limit: PAGE_LIMIT,
          ...(cursor === undefined ? {} : { cursor }),
        });
        const snapshot = normalizeEnvironment(payload);
        active ??= snapshot.active;
        fields.push(...snapshot.fields);
        cursor = payload.nextCursor;
        pages += 1;
      } while (cursor !== undefined && pages < MAX_PAGES);
      return { fields, active, truncated: cursor !== undefined };
    })().then(
      ({ fields, active, truncated }) => {
        if (disposed) return;
        setData({
          status: "ready",
          fields,
          truncated,
          ...(active === undefined ? {} : { active }),
        });
      },
      () => {
        if (!disposed) setData((current) => ({ ...current, status: "error" }));
      },
    );
    return () => {
      disposed = true;
    };
  }, [revision]);

  const groups = useMemo(() => groupEnvironment(data.fields, grouping), [data.fields, grouping]);
  const tree = useMemo<readonly TreeGroup[]>(
    () =>
      groups.map((group) => ({
        id: group.id,
        label: group.label,
        icon:
          grouping === "source" ? (
            <FileCode2 />
          ) : grouping === "sensitivity" ? (
            <ShieldCheck />
          ) : (
            <Variable />
          ),
        summary: summary(group.fields),
        children: group.fields.map((field) => ({
          id: field.name,
          label: field.name,
          keywords: `${field.type} ${field.description ?? ""} ${environmentFlags(field)
            .map((flag) => flag.label)
            .join(" ")}`,
          icon: field.sensitive ? <KeyRound /> : <Variable />,
          badge: (
            <span className="flex shrink-0 items-center gap-1">
              {environmentFlags(field).map((flag) => (
                <StatusBadge key={flag.label} tone={flag.tone} label={flag.label} />
              ))}
            </span>
          ),
          detail: field.sensitive ? `${field.type} · masked` : field.type,
        })),
      })),
    [groups, grouping],
  );
  const current =
    data.fields.find((field) => field.name === selected) ?? data.fields[0] ?? undefined;
  const secrets = data.fields.filter((field) => field.sensitive).length;

  return (
    <div className="route-page">
      <PageHeader
        title="Environment"
        description="Value-free environment metadata from the active graph. Values never leave the app; only their declared shape is shown."
        badges={
          <span className="inline-flex items-center gap-2" role="status" aria-live="polite">
            <StatusBadge tone={statusTone(liveState)} label={`live: ${liveState}`} />
            {data.status === "ready" && (
              <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                {data.fields.length} keys · {secrets} secret{secrets === 1 ? "" : "s"}
              </span>
            )}
          </span>
        }
        {...(data.active === undefined
          ? {}
          : {
              meta: (
                <>
                  <span>{data.active.generationId}</span>
                  <span className="truncate" title={data.active.graphHash}>
                    {data.active.graphHash}
                  </span>
                </>
              ),
            })}
        actions={
          <SegmentedFilter
            label="Group environment variables by"
            value={grouping}
            onChange={setGrouping}
            options={[
              { value: "prefix", label: "Prefix" },
              { value: "source", label: "Source" },
              { value: "sensitivity", label: "Sensitivity" },
            ]}
          />
        }
      />

      {data.status === "error" && (
        <FailedState
          title="Environment metadata could not be loaded."
          description="Previously loaded keys remain visible."
          onRetry={() => setRevision((value) => value + 1)}
        />
      )}

      {data.status === "loading" && data.fields.length === 0 ? (
        <LoadingRows label="Loading environment metadata" rows={6} />
      ) : data.fields.length === 0 ? (
        data.status === "ready" ? (
          <EmptyState
            icon={<Variable />}
            title="No environment variables declared"
            description="Keys declared in relkit.config.ts appear here with their type and requirement."
          />
        ) : null
      ) : (
        <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <TreeExplorer
            title="Environment variables"
            subtitle={
              data.truncated
                ? `First ${data.fields.length} keys; more are declared.`
                : `${data.fields.length} keys in ${groups.length} group${groups.length === 1 ? "" : "s"}`
            }
            icon={<Variable />}
            groups={tree}
            searchLabel="Search keys, types and flags"
            defaultOpen={groups.map((group) => group.id)}
            onSelectLeaf={(leaf) => setSelected(leaf.id)}
            {...(current === undefined ? {} : { selectedLeaf: current.name })}
            key={grouping}
          />
          {current !== undefined && <KeyDetails field={current} />}
        </div>
      )}
    </div>
  );
}

function KeyDetails({ field }: { readonly field: EnvironmentFieldView }) {
  return (
    <Section
      id="environment-key"
      title={<span className="font-mono">{field.name}</span>}
      description={field.type}
      className="lg:sticky lg:top-16"
      actions={
        <span className="flex items-center gap-1">
          {environmentFlags(field).map((flag) => (
            <StatusBadge key={flag.label} tone={flag.tone} label={flag.label} />
          ))}
        </span>
      }
    >
      <DetailList
        items={[
          { label: "Name", value: field.name, mono: true, copy: field.name },
          { label: "Type", value: field.type, mono: true },
          { label: "Requirement", value: requirementLabel(field) },
          { label: "Default", value: field.hasDefault ? "Default declared" : "No default" },
          {
            label: "Sensitivity",
            value: field.sensitive ? "Sensitive · value masked" : "Non-sensitive",
          },
          ...(field.requiredIn.length === 0
            ? []
            : [{ label: "Required in", value: field.requiredIn.join(", "), mono: true }]),
          {
            label: "Source",
            mono: true,
            value: field.source ? <SourceLink source={field.source} /> : "Unavailable",
          },
          { label: "Description", value: field.description ?? "No description provided." },
        ]}
      />
    </Section>
  );
}

function summary(fields: readonly EnvironmentFieldView[]): string {
  const secrets = fields.filter((field) => field.sensitive).length;
  return secrets === 0
    ? `${fields.length}`
    : `${fields.length} · ${secrets} secret${secrets === 1 ? "" : "s"}`;
}
