"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FailedState, LoadingRows } from "../components/blocks/block-state";
import { PageHeader } from "../components/blocks/page-header";
import { Section } from "../components/blocks/section";
import { StatusBadge, statusTone } from "../components/neon/status-badge";
import {
  EMPTY_SIGNAL_FILTERS,
  queryFromFilters,
  type SignalFilters,
} from "../lib/observability-model";
import { countLabel, filterProblems, hasActiveFilters } from "../lib/request-filters";
import { listRejectionMessage, withRejection } from "../lib/request-rejection";
import {
  DEFAULT_PAGE_SIZE,
  newerCursor,
  parseRequestsLocation,
  requestsSearch,
  trailAfter,
  type PageTrail,
  type RequestsLocation,
} from "../lib/requests-url";
import { RequestsPager } from "./requests-pager";
import { RuntimeStatus } from "./runtime-status";
import { SignalRows } from "./signal-rows";
import { SignalsFilters } from "./signals-filters";
import { useRequestHistory } from "./use-request-history";
import { useLiveUpdates } from "../lib/stream-application-store";

const REJECTED =
  "The Inspector did not accept these filters. Check the status, method and path values, then apply them again.";

/**
 * The Requests page. The URL holds the filters, page size and page cursor, so a filtered view
 * reloads, can be shared, and works with the browser's back button.
 */
export function SignalsClient() {
  const router = useRouter();
  const params = useSearchParams();
  const search = params.toString();
  const location = useMemo(() => parseRequestsLocation(new URLSearchParams(search)), [search]);
  const { filters, limit, cursor } = location;
  const [draft, setDraft] = useState<SignalFilters>(filters);
  const [announcement, setAnnouncement] = useState("Loading requests…");
  const query = useMemo(() => queryFromFilters(filters, limit, cursor), [filters, limit, cursor]);
  const filterKey = useMemo(() => {
    const { cursor: _cursor, limit: _limit, ...rest } = queryFromFilters(filters, limit);
    return JSON.stringify(rest);
  }, [filters, limit]);
  const history = useRequestHistory(query, filterKey);
  const live = useLiveUpdates(history.liveState);
  const trail = useRef<PageTrail | undefined>(undefined);
  const problems = useMemo(() => filterProblems(draft), [draft]);
  const [submitted, setSubmitted] = useState(false);

  // A new URL (apply, reset, back, a shared link) replaces what the form shows.
  const filtersKey = JSON.stringify(filters);
  useEffect(() => {
    setDraft(JSON.parse(filtersKey) as SignalFilters);
    setSubmitted(false);
  }, [filtersKey]);
  useEffect(() => {
    trail.current = trailAfter(trail.current, filterKey, cursor);
  }, [filterKey, cursor]);
  useEffect(() => {
    setAnnouncement(
      history.state === "ready"
        ? `Requests loaded. ${history.items.length} on this page.`
        : history.state === "loading"
          ? "Loading requests…"
          : "Requests could not be loaded.",
    );
  }, [history.state, history.items.length]);

  const go = (next: RequestsLocation): void => {
    const target = requestsSearch(next);
    router.push(target === "" ? "/requests" : `/requests?${target}`, { scroll: false });
  };
  const apply = (next: SignalFilters): void => {
    setSubmitted(true);
    if (filterProblems(next).length > 0) {
      setAnnouncement("Some filter values are not valid. Fix them to apply the filters.");
      return;
    }
    setAnnouncement("Filters applied. Loading requests…");
    go({ filters: next, limit });
  };
  // Problems show once applied was tried, and for a URL that carries a value the API refuses.
  // The server's own message for a refused value replaces the page's message at that field.
  const own = submitted || JSON.stringify(draft) === filtersKey ? problems : [];
  const refused = history.state === "rejected" ? history.rejection : undefined;
  const shown = withRejection(own, refused, filters, draft);
  const listMessage = listRejectionMessage(refused);
  const rejection = refused?.message ?? shown[0]?.message ?? REJECTED;
  const total = history.total;
  const filtered = hasActiveFilters(filters);

  return (
    <div className="route-page">
      <PageHeader
        title="Requests"
        description="Retained redacted telemetry. Capture and history are bounded; external sampling is independent."
        badges={
          <StatusBadge
            tone="neutral"
            label={total === undefined ? "Counting…" : countLabel(total, filtered)}
          />
        }
        actions={
          <div className="flex items-center gap-2" role="status" aria-live="polite">
            <StatusBadge
              tone={live === "connected" ? "live" : statusTone(live)}
              label={`Live: ${live}`}
            />
            <span className="sr-only">{announcement}</span>
          </div>
        }
      />
      <SignalsFilters
        value={draft}
        limit={limit}
        problems={shown}
        rejected={
          history.state === "rejected" && shown.length === 0
            ? (listMessage ?? REJECTED)
            : listMessage
        }
        onChange={setDraft}
        onLimitChange={(value) => go({ filters, limit: value })}
        onSubmit={() => apply(draft)}
        onReset={() => go({ filters: EMPTY_SIGNAL_FILTERS, limit: DEFAULT_PAGE_SIZE })}
        onStatus={(status) => apply({ ...draft, status })}
      />
      <Section
        flush
        title="History"
        description={`Newest first · ${limit} per page${cursor === undefined ? "" : " · older page"}`}
        actions={
          <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
            {history.items.length} on this page
          </span>
        }
      >
        {history.state === "loading" && <LoadingRows label="Loading requests…" rows={8} />}
        {(history.state === "error" || history.state === "rejected") && (
          <FailedState
            className="m-3"
            title={
              history.state === "rejected"
                ? "These filters were not accepted."
                : "The requests API is unavailable."
            }
            description={
              history.state === "rejected"
                ? rejection
                : "Retained history is read from the active backend. Check that it is running."
            }
          />
        )}
        {history.state === "ready" && <SignalRows items={history.items} />}
      </Section>
      <RequestsPager
        hasNewer={cursor !== undefined}
        hasOlder={history.nextCursor !== undefined}
        disabled={history.state === "loading"}
        onNewer={() => go({ filters, limit, ...cursorOf(trail.current) })}
        onOlder={() =>
          history.nextCursor !== undefined && go({ filters, limit, cursor: history.nextCursor })
        }
      />
      <RuntimeStatus telemetryOnly />
    </div>
  );
}

function cursorOf(trail: PageTrail | undefined): { cursor?: string } {
  const cursor = trail === undefined ? undefined : newerCursor(trail);
  return cursor === undefined ? {} : { cursor };
}
