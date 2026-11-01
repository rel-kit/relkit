"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ListChecks } from "lucide-react";
import { FailedState, LoadingRows } from "../../../components/blocks/block-state";
import { CodeBlock } from "../../../components/blocks/code-block";
import { DetailList } from "../../../components/blocks/details";
import { Section } from "../../../components/blocks/section";
import { StatusBadge, statusTone } from "../../../components/neon/status-badge";
import { ContentTabs } from "../../../components/ui/tabs";
import { DetailLayout } from "../../detail-layout";
import type { InspectorObject } from "../../../lib/api-types";
import { createInspectorClient } from "../../../lib/client";

export function TaskDetailClient() {
  const params = useParams<{ id: string }>();
  const id = typeof params?.id === "string" ? params.id : "";
  const api = useMemo(() => createInspectorClient(), []);
  const [task, setTask] = useState<InspectorObject>();
  const [error, setError] = useState(false);
  useEffect(() => {
    if (id === "") return;
    void api
      .taskDefinition<InspectorObject>(id)
      .then((result) => {
        setTask(record(result.task) ?? record(result));
      })
      .catch(() => setError(true));
  }, [api, id]);
  if (error)
    return (
      <div className="route-page">
        <FailedState title="The task definition is unavailable." />
      </div>
    );
  if (task === undefined)
    return (
      <div className="route-page rounded-lg border border-border bg-card">
        <LoadingRows label="Loading task definition…" rows={6} />
      </div>
    );
  const health = text(record(task.health)?.state) || text(task.health);
  return (
    <DetailLayout
      header={{
        kicker: "Task detail",
        title: text(task.taskId) || id,
        icon: <ListChecks />,
        description: "Task schema, dependencies, policy, hooks, versions, and worker capabilities.",
        badges: (
          <>
            <StatusBadge tone="neutral" label={text(task.version) || "unversioned"} />
            {health === "" ? null : <StatusBadge tone={statusTone(health)} label={health} />}
          </>
        ),
        actions: (
          <Link
            href="/jobs"
            className="inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs text-muted-foreground no-underline hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft aria-hidden="true" className="size-3.5" /> Back to job definitions
          </Link>
        ),
      }}
      aside={
        <Section title="IDs">
          <DetailList
            items={[
              {
                label: "Task",
                value: text(task.taskId) || id,
                mono: true,
                copy: text(task.taskId) || id,
              },
              { label: "Version", value: text(task.version) || "unversioned", mono: true },
              {
                label: "Concurrency",
                value:
                  typeof task.concurrency === "number"
                    ? task.concurrency.toLocaleString("en-US")
                    : text(task.concurrency) || "provider default",
              },
            ]}
          />
        </Section>
      }
    >
      <Section title="Definition">
        <ContentTabs
          label="Task detail sections"
          items={[
            {
              id: "schema",
              label: "Schema",
              content: (
                <JsonPanel
                  value={{
                    input: task.input,
                    output: task.output,
                    errors: task.errors,
                    schemaHashes: task.schemaHashes,
                  }}
                />
              ),
            },
            {
              id: "context",
              label: "Context dependencies",
              content: (
                <JsonPanel value={{ dependencies: task.dependencies, publishes: task.publishes }} />
              ),
            },
            {
              id: "policy",
              label: "Policy & resources",
              content: (
                <JsonPanel
                  value={{
                    policy: task.policy,
                    resources: task.resources,
                    concurrency: task.concurrency,
                  }}
                />
              ),
            },
            {
              id: "hooks",
              label: "Lifecycle hooks",
              content: (
                <JsonPanel
                  value={{
                    onStart: task.onStart,
                    onSuccess: task.onSuccess,
                    onFailure: task.onFailure,
                  }}
                />
              ),
            },
            {
              id: "capabilities",
              label: "Native capabilities",
              content: (
                <JsonPanel
                  value={{
                    capabilities: task.capabilities,
                    worker: task.worker,
                    health: task.health,
                  }}
                />
              ),
            },
          ]}
        />
      </Section>
    </DetailLayout>
  );
}
function JsonPanel({ value }: { readonly value: InspectorObject }) {
  return <CodeBlock value={value} label="task section" />;
}
function record(value: unknown): InspectorObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as InspectorObject)
    : undefined;
}
function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}
