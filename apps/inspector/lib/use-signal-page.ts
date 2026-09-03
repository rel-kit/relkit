"use client";

import { useEffect, useRef, useState } from "react";
import type { InspectorObject } from "./api-types";
import {
  createInspectorBackendStream,
  createInspectorClient,
  INSPECTOR_BACKEND_CONNECTED_EVENT,
} from "./client";
import { logQuery } from "./log-query";

export function useSignalPage(
  kind: "logs" | "traces",
  queryKey: string,
  blocked: boolean,
  revision: number,
) {
  const [items, setItems] = useState<readonly InspectorObject[]>([]);
  const [nextCursor, setNextCursor] = useState<string>();
  const [state, setState] = useState("loading");
  const [live, setLive] = useState("connecting");
  const [pending, setPending] = useState(false);
  const [storage, setStorage] = useState<InspectorObject>();
  const hold = useRef(blocked);
  useEffect(() => {
    hold.current = blocked;
  }, [blocked]);
  useEffect(() => {
    let disposed = false;
    let loading = false;
    let dirty = false;
    let unapplied = false;
    let newest = "";
    let connection = "";
    const client = createInspectorClient();
    const params = new URLSearchParams(queryKey);
    const refresh = async (initial = false) => {
      if (loading) {
        dirty = true;
        return;
      }
      loading = true;
      dirty = false;
      client.invalidate([kind, "signals"]);
      try {
        const query = logQuery(params);
        const { cursor: _, ...headQuery } = query;
        const held = !initial && hold.current;
        const page = await client.query(kind, held ? { ...headQuery, limit: 1 } : query);
        if (disposed) return;
        const head =
          initial && query.cursor ? await client.query(kind, { ...headQuery, limit: 1 }) : page;
        if (disposed) return;
        const cursor = String(
          head.items[0]?.cursor ?? (head.items[0] ? JSON.stringify(head.items[0]) : ""),
        );
        if (!initial && (held || hold.current)) {
          unapplied =
            cursor !== "" &&
            (/^\d+$/.test(cursor) && /^\d+$/.test(newest)
              ? BigInt(cursor) > BigInt(newest)
              : cursor !== newest);
          setPending(unapplied);
          return;
        }
        newest = cursor;
        unapplied = false;
        setPending(false);
        setItems(page.items);
        setNextCursor(page.nextCursor);
        setState("ready");
      } catch {
        if (!disposed) setState("error");
      } finally {
        loading = false;
      }
    };
    const notify = () => {
      dirty = true;
    };
    setState("loading");
    setPending(false);
    void refresh(true);
    const timer = setInterval(() => {
      if ((dirty || (unapplied && !hold.current)) && !loading) {
        void refresh();
      }
    }, 500);
    const readStorage = () => {
      void client
        .request<InspectorObject>("/_relkit/v1/storage", {
          responseProtocols: ["relkit.observability.query"],
          cache: "no-store",
        })
        .then((value) => {
          if (!disposed) setStorage(value);
        })
        .catch(() => {
          if (!disposed) setStorage({ state: "unavailable" });
        });
    };
    readStorage();
    const statusTimer = setInterval(readStorage, 10_000);
    const stream = createInspectorBackendStream({
      onStateChange: (snapshot) => {
        if (!disposed) {
          setLive(snapshot.state);
          if (snapshot.state === "connected" && connection !== "connected") notify();
          connection = snapshot.state;
        }
      },
      onEvent: (event) => {
        if (
          kind === "logs"
            ? event.type === "log.emitted"
            : ["span.started", "span.completed", "request.completed"].includes(event.type)
        )
          notify();
      },
    });
    window.addEventListener(INSPECTOR_BACKEND_CONNECTED_EVENT, notify);
    stream.start();
    return () => {
      disposed = true;
      clearInterval(timer);
      clearInterval(statusTimer);
      stream.stop();
      window.removeEventListener(INSPECTOR_BACKEND_CONNECTED_EVENT, notify);
    };
  }, [kind, queryKey, revision]);
  return { items, nextCursor, state, live, pending, storage };
}
