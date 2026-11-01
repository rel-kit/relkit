import { ShieldCheck, Wrench } from "lucide-react";
import Link from "next/link";
import { CodeBlock } from "../components/blocks/code-block";
import { DetailList } from "../components/blocks/details";
import { Section } from "../components/blocks/section";
import { EmptyState } from "../components/neon/empty-state";
import { StatusBadge, statusTone, type StatusTone } from "../components/neon/status-badge";
import { Timeline } from "../components/neon/timeline";
import { ContentTabs } from "../components/ui/tabs";
import type { InspectorApiClient } from "../lib/api";
import type { ToolApprovalView, ToolView } from "../lib/agents-model";
import { formatDuration } from "../lib/format";
import { DetailLayout } from "./detail-layout";
import { ToolApprovalActions } from "./tool-approval-actions";

/** Side effects read from calm to loud: reads are quiet, writes warn, the rest are dangerous. */
export function sideEffectTone(value: string): StatusTone {
  const word = value.toLowerCase();
  if (word === "" || word === "none" || word === "read" || word === "pure") return "neutral";
  if (word === "write" || word === "idempotent" || word === "mutation") return "warning";
  return "danger";
}

export function ToolDetailView({
  api,
  view,
  capabilities,
  generationId,
  graphHash,
  onComplete,
}: {
  readonly api: InspectorApiClient;
  readonly view: ToolView;
  readonly capabilities: readonly string[];
  readonly generationId: string;
  readonly graphHash: string;
  readonly onComplete: () => Promise<void>;
}) {
  const approvalRequired = view.approvalPolicy !== "never" && view.approvalPolicy !== "none";
  return (
    <DetailLayout
      header={{
        kicker: "Tool",
        title: view.id,
        icon: <Wrench />,
        description:
          view.description || "A tool exposes one function contract and never owns a handler.",
        badges: (
          <>
            <StatusBadge tone={sideEffectTone(view.sideEffect)} label={view.sideEffect} />
            <StatusBadge
              tone={approvalRequired ? "warning" : "neutral"}
              label={`approval ${view.approvalPolicy}`}
            />
          </>
        ),
        ...(view.targetFunctionId === "" ? {} : { meta: <span>→ {view.targetFunctionId}</span> }),
      }}
      aside={<TimelinePanel view={view} />}
    >
      <Section title="Tool detail" id="tool-identity" description="Contract and approval policy">
        <DetailList
          columns={2}
          items={[
            {
              label: "Target function",
              mono: true,
              value:
                view.targetFunctionId === "" ? (
                  "Unavailable"
                ) : (
                  <Link href={`/functions/${encodeURIComponent(view.targetFunctionId)}`}>
                    {view.targetFunctionId}
                  </Link>
                ),
            },
            {
              label: "Timeout",
              value:
                view.timeoutMs === undefined ? "Provider default" : formatDuration(view.timeoutMs),
              mono: true,
            },
            {
              label: "Side effect",
              value: <StatusBadge tone={sideEffectTone(view.sideEffect)} label={view.sideEffect} />,
            },
            {
              label: "Approval",
              value: (
                <StatusBadge
                  tone={approvalRequired ? "warning" : "neutral"}
                  label={view.approvalPolicy}
                />
              ),
            },
          ]}
        />
      </Section>
      <ApprovalPanel
        approvals={view.pendingApprovals}
        client={api}
        capabilities={capabilities}
        generationId={generationId}
        graphHash={graphHash}
        onComplete={onComplete}
      />
      <Section
        title="Inherited contract"
        description="Input, output and errors come from the target function"
      >
        <ContentTabs
          label="Tool schemas"
          items={[
            {
              id: "input",
              label: "Input schema",
              content: <CodeBlock value={view.input} label="input schema" />,
            },
            {
              id: "output",
              label: "Output schema",
              content: <CodeBlock value={view.output} label="output schema" />,
            },
            {
              id: "errors",
              label: "Errors",
              content: <CodeBlock value={view.errors} label="errors" />,
            },
          ]}
        />
      </Section>
    </DetailLayout>
  );
}

function ApprovalPanel({
  approvals,
  ...props
}: { readonly approvals: readonly ToolApprovalView[] } & Omit<
  Parameters<typeof ToolApprovalActions>[0],
  "approval"
>) {
  return (
    <Section
      title="Pending approvals"
      id="tool-approvals"
      description="Protected actions"
      flush
      actions={<Count value={approvals.length} />}
    >
      {approvals.length === 0 ? (
        <EmptyState
          variant="bare"
          size="sm"
          icon={<ShieldCheck />}
          title="No pending approval metadata is available."
          description="Calls that need approval wait here until someone approves or denies them."
        />
      ) : (
        <ul className="m-0 list-none p-0">
          {approvals.map((approval) => (
            <li
              className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-4 py-2.5 last:border-b-0"
              key={`${approval.invocationId}:${approval.toolCallId}`}
            >
              <span className="grid min-w-0 gap-0.5">
                <span className="flex items-center gap-2">
                  <StatusBadge tone="warning" label={approval.state} />
                  <code className="truncate font-mono text-xs font-medium">
                    {approval.toolCallId}
                  </code>
                </span>
                <span className="truncate font-mono text-[11px] text-muted-foreground">
                  invocation {approval.invocationId} ·{" "}
                  {approval.sideEffect || "side effect unavailable"}
                </span>
              </span>
              <ToolApprovalActions {...props} approval={approval} />
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function TimelinePanel({ view }: { readonly view: ToolView }) {
  return (
    <Section
      title="Safe execution metadata"
      id="tool-timeline"
      description="Arguments and results are not rendered"
      actions={<Count value={view.timeline.length} />}
    >
      <Timeline
        label="Tool invocation timeline"
        empty={
          <p className="m-0 text-xs text-muted-foreground">
            No invocation or span metadata is available.
          </p>
        }
        items={view.timeline.map((entry) => {
          const word = entry.outcome || entry.status || "recorded";
          return {
            id: `${entry.kind}:${entry.id}`,
            title: (
              <span className="flex min-w-0 items-center gap-2">
                <span className="shrink-0 rounded-sm bg-muted px-1.5 py-px font-mono text-[10.5px] font-semibold">
                  {entry.kind}
                </span>
                <code className="truncate font-mono text-xs">{entry.id}</code>
              </span>
            ),
            tone: statusTone(word),
            at: entry.at,
            meta: [entry.status || "recorded", ...(entry.outcome ? [entry.outcome] : [])],
          };
        })}
      />
    </Section>
  );
}

function Count({ value }: { readonly value: number }) {
  return (
    <span className="rounded-sm border border-border px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground tabular-nums">
      {value}
    </span>
  );
}
