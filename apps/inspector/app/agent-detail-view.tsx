import { Bot, MessageSquare, Wrench } from "lucide-react";
import Link from "next/link";
import { CodeBlock } from "../components/blocks/code-block";
import { DetailList, type DetailItem } from "../components/blocks/details";
import { Section } from "../components/blocks/section";
import { EmptyState } from "../components/neon/empty-state";
import { StatusBadge, statusTone } from "../components/neon/status-badge";
import { Timeline } from "../components/neon/timeline";
import type { AgentView } from "../lib/agents-model";
import { formatDuration } from "../lib/format";
import { DetailLayout } from "./detail-layout";

export function AgentDetailView({ view }: { readonly view: AgentView }) {
  return (
    <DetailLayout
      header={{
        kicker: "Agent",
        title: view.id,
        icon: <Bot />,
        description:
          "Model and tool execution stays bounded, correlated, and redacted at the API boundary.",
        badges: (
          <>
            <StatusBadge
              tone={view.client === "internal" ? "neutral" : "info"}
              label={view.client}
            />
            {view.model ? <StatusBadge tone="neutral" label={view.model} /> : null}
          </>
        ),
        meta: <span>{view.generatedFunctionId}</span>,
        actions: (
          <Link
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground no-underline transition-colors hover:bg-primary/90 [&_svg]:size-3.5"
            href={`/agents/${encodeURIComponent(view.id)}/chat`}
          >
            <MessageSquare aria-hidden="true" /> {view.chat ? "Open chat" : "Open runner"}
          </Link>
        ),
      }}
      aside={
        <>
          <ToolPanel ids={view.toolIds} />
          <Section title="Model and execution limits" id="agent-limits">
            <Limits value={view.limits} />
          </Section>
        </>
      }
    >
      <Section title="Agent detail" id="agent-identity">
        <DetailList
          columns={3}
          items={[
            { label: "Model", value: view.model || "Unavailable", mono: true },
            {
              label: "Generated function",
              mono: true,
              value: (
                <Link href={`/functions/${encodeURIComponent(view.generatedFunctionId)}`}>
                  {view.generatedFunctionId}
                </Link>
              ),
              copy: view.generatedFunctionId,
            },
            { label: "Allowed tools", value: String(view.toolIds.length) },
            { label: "Client", value: view.client },
            { label: "Chat", value: view.chat ? "enabled" : "runner only" },
            {
              label: "Controls",
              value: view.controls.length === 0 ? "none" : view.controls.join(", "),
              mono: true,
            },
          ]}
        />
      </Section>
      <TimelinePanel view={view} />
      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <Section title="Input schema">
          <CodeBlock value={view.input} label="input schema" maxHeight="20rem" />
        </Section>
        <Section title="Output schema">
          <CodeBlock value={view.output} label="output schema" maxHeight="20rem" />
        </Section>
      </div>
    </DetailLayout>
  );
}

function ToolPanel({ ids }: { readonly ids: readonly string[] }) {
  return (
    <Section
      title="Tools"
      id="agent-tools"
      description="Allowlist"
      flush
      actions={<Count value={ids.length} />}
    >
      {ids.length === 0 ? (
        <EmptyState variant="bare" size="sm" icon={<Wrench />} title="No tools are allowed." />
      ) : (
        <ul className="m-0 list-none p-1.5">
          {ids.map((id) => (
            <li key={id}>
              <Link
                className="flex h-8 min-w-0 items-center gap-2 rounded-md px-2 no-underline outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/50"
                href={`/tools/${encodeURIComponent(id)}`}
              >
                <Wrench aria-hidden="true" className="size-3 shrink-0 text-muted-foreground/70" />
                <code className="min-w-0 truncate font-mono text-xs text-foreground/90">{id}</code>
                <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                  function-backed
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function TimelinePanel({ view }: { readonly view: AgentView }) {
  return (
    <Section
      title="Model and tool spans"
      id="agent-timeline"
      description="Invocation timeline · prompts, tool arguments and model results are absent by default"
      actions={<Count value={view.timeline.length} />}
    >
      <div className="grid gap-4">
        <Timeline
          label="Agent invocation timeline"
          empty={
            <EmptyState
              variant="bare"
              size="sm"
              title="No invocation timeline is available."
              description="Run the agent from its chat or runner to record model and tool spans."
            />
          }
          items={view.timeline.map((entry) => {
            const word = entry.outcome || entry.status || "recorded";
            return {
              id: `${entry.kind}:${entry.id}`,
              title: (
                <span className="flex min-w-0 items-center gap-2">
                  <span className="shrink-0 rounded-sm bg-muted px-1.5 py-px font-mono text-[10.5px] font-semibold text-foreground/85">
                    {entry.kind}
                  </span>
                  <code className="truncate font-mono text-xs">{entry.toolId ?? entry.id}</code>
                </span>
              ),
              tone: statusTone(word),
              at: entry.at,
              meta: [
                entry.id,
                entry.status || "recorded",
                ...(entry.outcome ? [entry.outcome] : []),
              ],
            };
          })}
        />
        {view.spans.length === 0 ? null : (
          <ul aria-label="Spans" className="m-0 grid list-none gap-1.5 p-0">
            {view.spans.map((span) => (
              <li
                className="flex min-w-0 flex-wrap items-center gap-2 rounded-md border border-border/70 bg-muted/30 px-2.5 py-1.5"
                key={span.spanId}
              >
                <span
                  aria-hidden="true"
                  className={`size-1.5 shrink-0 rounded-[1px] ${toneDot(statusTone(span.outcome || span.status))}`}
                />
                <span className="font-mono text-[10.5px] font-semibold text-foreground/85">
                  {span.kind}
                </span>
                <code className="min-w-0 truncate font-mono text-xs text-foreground/90">
                  {span.functionId || span.toolId || "span"}
                </code>
                <span className="ml-auto flex shrink-0 items-center gap-2 font-mono text-[10.5px] text-muted-foreground tabular-nums">
                  <span>{span.profile || "profile metadata unavailable"}</span>
                  {span.toolCallId ? <span>{span.toolCallId}</span> : null}
                  {span.durationMs === undefined ? null : (
                    <span>{formatDuration(span.durationMs)}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Section>
  );
}

function Limits({ value }: { readonly value: unknown }) {
  const entries =
    value !== null && typeof value === "object" && !Array.isArray(value)
      ? Object.entries(value as Record<string, unknown>)
      : [];
  if (entries.length === 0)
    return <p className="m-0 text-xs text-muted-foreground">Provider defaults apply.</p>;
  if (entries.every(([, item]) => ["number", "string", "boolean"].includes(typeof item))) {
    const items: DetailItem[] = entries.map(([key, item]) => ({
      label: key,
      value:
        typeof item === "number" && /ms$/i.test(key)
          ? formatDuration(item)
          : typeof item === "number"
            ? item.toLocaleString("en-US")
            : String(item),
      mono: true,
    }));
    return <DetailList columns={2} items={items} />;
  }
  return <CodeBlock value={value} label="limits" maxHeight="16rem" />;
}

function Count({ value }: { readonly value: number }) {
  return (
    <span className="rounded-sm border border-border px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground tabular-nums">
      {value}
    </span>
  );
}

function toneDot(tone: ReturnType<typeof statusTone>): string {
  return {
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-danger",
    info: "bg-info",
    neutral: "bg-muted-foreground/50",
    live: "bg-live",
  }[tone];
}
