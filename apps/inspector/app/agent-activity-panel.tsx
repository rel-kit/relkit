import { Wrench } from "lucide-react";
import { CodeBlock } from "../components/blocks/code-block";
import { DetailList } from "../components/blocks/details";
import { StatusBadge, statusTone } from "../components/neon/status-badge";
import { ContentTabs } from "../components/ui/tabs";
import { cn } from "../lib/utils";
import type { AgentConversationState } from "./agent-observation";
import type { AgentClientEvent, BrowserMessagePart } from "./application-runtime-types";

type ToolPart = Extract<BrowserMessagePart, { readonly kind: "tool" }>;

export function AgentActivityPanel({
  state,
  className,
}: {
  readonly state: AgentConversationState;
  readonly className?: string;
}) {
  const snapshot = state.snapshot;
  const tools = activeTools(state);
  const progress = [...state.events]
    .reverse()
    .find((event) => event.kind === "progress" && event.scope === "run");
  const runStatus = snapshot?.thread.status ?? "Idle";
  return (
    <aside
      className={cn(
        "grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] content-start gap-3 overflow-hidden bg-muted/30 p-3",
        className,
      )}
      aria-label="Agent activity"
    >
      <div className="grid gap-2.5">
        <div className="m-0 grid grid-cols-3 gap-2">
          <div className="grid min-w-0 gap-1 rounded-md border border-border bg-card px-2.5 py-2">
            <span className="text-[10.5px] font-medium tracking-wide text-muted-foreground uppercase">
              Current run
            </span>
            <span className="m-0 min-w-0">
              <StatusBadge
                className="max-w-full truncate"
                tone={snapshot === undefined ? "neutral" : statusTone(runStatus)}
                label={runStatus}
              />
            </span>
          </div>
          <div className="grid min-w-0 gap-1 rounded-md border border-border bg-card px-2.5 py-2">
            <span className="text-[10.5px] font-medium tracking-wide text-muted-foreground uppercase">
              Active tools
            </span>
            <span className="m-0 font-mono text-xs tabular-nums">
              {tools.length === 0 ? "None" : `${tools.length} running`}
            </span>
          </div>
          <div className="grid min-w-0 gap-1 rounded-md border border-border bg-card px-2.5 py-2">
            <span className="text-[10.5px] font-medium tracking-wide text-muted-foreground uppercase">
              Nested
            </span>
            <span className="m-0 font-mono text-xs tabular-nums">
              {snapshot?.executions.length ?? 0}
            </span>
          </div>
        </div>
        {progress?.kind === "progress" ? (
          <p className="m-0 truncate rounded-md bg-live/10 px-2.5 py-1.5 font-mono text-[11px] text-live">
            {value(progress.value)}
          </p>
        ) : null}
        {tools.length === 0 ? null : (
          <ul className="m-0 grid list-none gap-1 p-0" aria-label="Active tools">
            {tools.map((tool) => (
              <li
                key={tool.toolCallId}
                className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5"
              >
                <Wrench aria-hidden="true" className="size-3 shrink-0 text-muted-foreground" />
                <code className="min-w-0 truncate font-mono text-xs">{tool.toolId}</code>
                <small className="ml-auto shrink-0 text-[11px] text-live">
                  {tool.state === "running" ? "Executing" : label(tool.state)}
                </small>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="min-h-0 overflow-y-auto">
        <ContentTabs
          label="Agent diagnostics"
          items={[
            { id: "events", label: "Events", content: <Events events={state.events} /> },
            {
              id: "executions",
              label: "Executions",
              content: <Executions value={snapshot?.executions ?? []} />,
            },
            {
              id: "state",
              label: "Raw state",
              content: <CodeBlock value={snapshot ?? {}} label="raw state" maxHeight="50vh" />,
            },
            { id: "ids", label: "IDs", content: <Ids state={state} /> },
          ]}
        />
      </div>
    </aside>
  );
}

function Executions({
  value: executions,
}: {
  readonly value: NonNullable<AgentConversationState["snapshot"]>["executions"];
}) {
  if (executions.length === 0) return <Empty>No nested executions.</Empty>;
  return (
    <ul className="m-0 grid list-none gap-1 p-0">
      {executions.map((execution) => (
        <li
          key={execution.scope.join("/")}
          className="flex min-w-0 items-center justify-between gap-2 border-b border-border/60 py-1.5 last:border-b-0"
        >
          <strong className="min-w-0 truncate font-mono text-xs font-medium">
            {execution.agent ?? execution.node ?? execution.scope.join(" / ")}
          </strong>
          <StatusBadge tone={statusTone(execution.status)} label={execution.status} />
        </li>
      ))}
    </ul>
  );
}

function Events({ events }: { readonly events: readonly AgentClientEvent[] }) {
  if (events.length === 0) return <Empty>No live events yet.</Empty>;
  return (
    <ol className="m-0 grid list-none p-0">
      {events
        .slice(-30)
        .reverse()
        .map((event) => (
          <li
            key={event.eventId}
            className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-2.5 border-b border-border/50 py-1.5 last:border-b-0"
          >
            <time className="font-mono text-[10.5px] text-muted-foreground tabular-nums">
              {clock(event.createdAt)}
            </time>
            <span className="flex min-w-0 items-baseline gap-2">
              <strong className="shrink-0 font-mono text-[11px] font-medium">{event.kind}</strong>
              {"toolCallId" in event ? (
                <code className="min-w-0 truncate font-mono text-[10.5px] text-muted-foreground">
                  {event.toolCallId}
                </code>
              ) : null}
            </span>
          </li>
        ))}
    </ol>
  );
}

function Ids({ state }: { readonly state: AgentConversationState }) {
  const snapshot = state.snapshot;
  const thread = snapshot?.thread.threadId;
  const run = snapshot?.activeRun?.runId ?? snapshot?.currentRuns.at(-1)?.runId;
  return (
    <DetailList
      items={[
        { label: "Thread", value: thread ?? "—", mono: true, ...(thread ? { copy: thread } : {}) },
        { label: "Run", value: run ?? "—", mono: true, ...(run ? { copy: run } : {}) },
        { label: "Checkpoint", value: String(snapshot?.checkpoint.sequence ?? "—"), mono: true },
        { label: "Provider epoch", value: String(snapshot?.providerEpoch ?? "—"), mono: true },
      ]}
    />
  );
}

function Empty({ children }: { readonly children: string }) {
  return <p className="m-0 py-4 text-center text-xs text-muted-foreground">{children}</p>;
}

function activeTools(state: AgentConversationState): readonly ToolPart[] {
  return state.messages.flatMap((message) =>
    message.parts.filter(
      (part): part is ToolPart =>
        part.kind === "tool" && !["succeeded", "failed", "denied"].includes(part.state),
    ),
  );
}

function label(value: string): string {
  return value.replaceAll("-", " ");
}

function value(input: unknown): string {
  if (input && typeof input === "object" && "stage" in input) return String(input.stage);
  return typeof input === "string" ? input : JSON.stringify(input);
}

function clock(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? value
    : date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });
}
