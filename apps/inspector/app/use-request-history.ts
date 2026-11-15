"use client";

import { useEffect, useRef, useState } from "react";
import { InspectorApiError, type InspectorObject, type InspectorQuery } from "../lib/api-types";
import {
  createInspectorBackendStream,
  createInspectorClient,
  INSPECTOR_BACKEND_CONNECTED_EVENT,
} from "../lib/client";
import { eventRecord, matchesQuery, mergeLiveItems, signalKey } from "../lib/observability-model";
import type { FilterRejection } from "../lib/request-rejection";
import { signalEventTypes } from "../lib/signal-events";

export interface RequestHistory {
  readonly items: readonly InspectorObject[];
  readonly nextCursor: string | undefined;
  readonly state: "loading" | "ready" | "error" | "rejected";
  readonly liveState: string;
  /** Number of requests the filters select; undefined while it is being counted or unknown. */
  readonly total: number | undefined;
  /** The server's message and parameter when it refused the filters; set while `state` is "rejected". */
  readonly rejection: FilterRejection | undefined;
}

/**
 * Loads one page of requests, keeps it current from the live stream, and counts the matches
 * once per filter set. `filterKey` is the JSON of the query without its cursor and page size, so
 * paging and live updates never trigger a new count.
 */
export function useRequestHistory(query: InspectorQuery, filterKey: string): RequestHistory {
  const listed = useRef<readonly InspectorObject[]>([]);
  const [items, setItems] = useState<readonly InspectorObject[]>([]);
  const [nextCursor, setNextCursor] = useState<string>();
  const [state, setState] = useState<RequestHistory["state"]>("loading");
  const [liveState, setLiveState] = useState("connecting");
  const [total, setTotal] = useState<number>();
  const [rejection, setRejection] = useState<FilterRejection>();
  const queryKey = JSON.stringify(query);

  useEffect(() => {
    let mounted = true;
    const filters = JSON.parse(filterKey) as InspectorQuery;
    setTotal(undefined);
    createInspectorClient()
      .query<InspectorObject>("requests", { ...filters, limit: 1, count: true })
      .then((page) => mounted && setTotal(page.total))
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, [filterKey]);

  useEffect(() => {
    const current = JSON.parse(queryKey) as InspectorQuery;
    let mounted = true;
    let requestNumber = 0;
    const client = createInspectorClient();
    const refresh = async (showLoading: boolean): Promise<void> => {
      const number = ++requestNumber;
      if (showLoading) setState("loading");
      try {
        const page = await client.query<InspectorObject>("requests", current);
        if (!mounted || number !== requestNumber) return;
        listed.current = page.items;
        setItems(page.items);
        setNextCursor(page.nextCursor);
        setRejection(undefined);
        setState("ready");
      } catch (error) {
        if (!mounted || number !== requestNumber) return;
        if (
          error instanceof InspectorApiError &&
          error.code === "RELKIT_OBSERVABILITY_QUERY_INVALID"
        ) {
          setRejection({ message: error.message, parameter: error.parameter });
          setState("rejected");
        } else {
          setRejection(undefined);
          setState("error");
        }
      }
    };
    void refresh(true);
    const refreshOnConnection = (): void => void refresh(true);
    window.addEventListener(INSPECTOR_BACKEND_CONNECTED_EVENT, refreshOnConnection);
    const stream = createInspectorBackendStream({
      onStateChange: (snapshot) => mounted && setLiveState(snapshot.state),
      onEvent: (event) => {
        if (!signalEventTypes("requests").includes(event.type)) return;
        client.invalidate(["requests", "signals"]);
        const record = eventRecord(event);
        if (current.cursor === undefined && record !== undefined && matchesQuery(record, current)) {
          const merged = mergeLiveItems(listed.current, event);
          // A record that is not listed yet is a new request; one that is listed only updated.
          if (merged.length > listed.current.length)
            setTotal((count) => (count === undefined ? count : count + 1));
          listed.current = merged;
          setItems(merged);
          setState("ready");
          return;
        }
        void refresh(false);
      },
    });
    stream.start();
    return () => {
      mounted = false;
      window.removeEventListener(INSPECTOR_BACKEND_CONNECTED_EVENT, refreshOnConnection);
      stream.stop();
    };
  }, [queryKey]);

  return { items, nextCursor, state, liveState, total, rejection };
}
