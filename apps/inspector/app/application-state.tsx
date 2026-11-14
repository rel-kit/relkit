"use client";

/**
 * The shell's view of the Inspector's three states (IN-09, IN-10, IN-48): the header status, the
 * banner every page shows while the application is away, and the stand-in for pages that need
 * the running application.
 */
import { PlugZap, Unplug } from "lucide-react";
import type { ReactNode } from "react";
import { PageHeader } from "../components/blocks/page-header";
import { StatusBadge, type StatusTone } from "../components/neon/status-badge";
import { EmptyState } from "../components/neon/empty-state";
import { formatTimestamp } from "../lib/format";
import { historyAvailability, type ApplicationLink } from "../lib/stream-application";
import { useInspectorState } from "../lib/stream-application-store";
import {
  applicationLabel,
  applicationNotice,
  needsApplicationNotice,
} from "../lib/stream-application-text";

/** Renders text whose backtick-quoted parts are code. */
export function CodeText({ text }: { readonly text: string }) {
  return (
    <>
      {text.split("`").map((part, index) =>
        index % 2 === 1 ? (
          <code key={index} className="rounded-sm bg-muted px-1 font-mono text-[0.95em]">
            {part}
          </code>
        ) : (
          part
        ),
      )}
    </>
  );
}

const STREAM_TONES: Record<string, StatusTone> = {
  connecting: "live",
  connected: "success",
  reconnecting: "warning",
  offline: "danger",
};
const APPLICATION_TONES: Record<ApplicationLink, StatusTone> = {
  checking: "live",
  connected: "success",
  waiting: "warning",
  unreachable: "danger",
  ambiguous: "warning",
};
const HISTORY_TONES: Record<string, StatusTone> = {
  checking: "live",
  ready: "success",
  degraded: "danger",
  unavailable: "neutral",
};

/** Three named states in the header: the stream to the Inspector, the application, history. */
export function InspectorStatus() {
  const state = useInspectorState();
  const history = historyAvailability(state);
  const items = [
    {
      id: "stream",
      name: "Inspector stream",
      short: "stream",
      value: state.stream,
      tone: STREAM_TONES[state.stream] ?? "neutral",
    },
    {
      id: "application",
      name: "Application",
      short: "app",
      value: applicationLabel(state.application.state),
      tone: APPLICATION_TONES[state.application.state],
    },
    {
      id: "history",
      name: "History",
      short: "history",
      value: history,
      tone: HISTORY_TONES[history] ?? "neutral",
    },
  ] as const;
  return (
    <ul
      aria-label="Inspector status"
      className="health-badge m-0 flex list-none items-center gap-1 p-0"
    >
      {items.map((item) => (
        <li key={item.id}>
          <StatusBadge
            data-testid={`inspector-${item.id}-state`}
            data-state={item.id === "application" ? state.application.state : item.value}
            tone={item.tone}
            title={`${item.name}: ${item.value}`}
            label={`${item.short} ${item.value}`}
          />
        </li>
      ))}
    </ul>
  );
}

/** Says, under the header of every page, that the application is away and what to do. */
export function ApplicationBanner() {
  const state = useInspectorState();
  const notice = applicationNotice(state, (iso) => formatTimestamp(iso, { date: false }));
  if (notice === undefined) return null;
  return (
    <section
      aria-label="Application status"
      data-testid="application-banner"
      data-state={state.stream === "connected" ? state.application.state : state.stream}
      className="mx-4 mt-3 flex min-w-0 items-start gap-2.5 rounded-lg border border-warning/35 bg-warning-soft px-3 py-2 text-xs leading-5 sm:mx-6"
    >
      <Unplug aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-warning" />
      <div role="status" className="min-w-0 space-y-0.5">
        <p className="m-0 font-medium text-foreground">{notice.title}</p>
        <p className="m-0 text-muted-foreground">
          <CodeText text={notice.body} />
        </p>
        <p className="m-0 text-foreground">
          <CodeText text={notice.next} />
        </p>
      </div>
    </section>
  );
}

/** Shows its children only while the application is connected (or not yet known). */
export function NeedsApplication({
  children,
  page,
}: {
  readonly children: ReactNode;
  /** The page title, when it stands in for a whole page rather than one panel. */
  readonly page?: string;
}) {
  const { application } = useInspectorState();
  const notice = needsApplicationNotice(application.state);
  if (notice === undefined) return <>{children}</>;
  return (
    <div data-testid="needs-application" className={page ? "route-page" : "min-w-0"}>
      {page === undefined ? null : <PageHeader title={page} />}
      <EmptyState
        size={page ? "md" : "sm"}
        icon={<PlugZap />}
        title={notice.title}
        description={
          <>
            {notice.body} <CodeText text={notice.next} />
          </>
        }
      />
    </div>
  );
}
