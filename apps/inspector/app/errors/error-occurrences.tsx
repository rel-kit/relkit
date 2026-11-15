"use client";

import { useEffect, useState } from "react";
import type { InspectorObject } from "../../lib/api-types";
import { createInspectorClient } from "../../lib/client";
import { requestsHref } from "../../lib/error-occurrences";
import { formatTimestamp } from "../../lib/format";
import { requestLabel, text } from "../../lib/observability-model";
import { Section } from "../../components/blocks/section";
import { StatusBadge, statusTone } from "../../components/neon/status-badge";
import { EntityList, Quiet } from "../domains/catalog-kit";

const RECENT = 5;

/**
 * The retained requests that ended with one declared error: how many, a link to all of them, and
 * the latest few. The count is read once when the page opens, not on every live update.
 */
export function ErrorOccurrences({ errorId }: { readonly errorId: string }) {
  const [state, setState] = useState<
    { readonly total: number | undefined; readonly items: readonly InspectorObject[] } | "failed"
  >();
  useEffect(() => {
    let current = true;
    createInspectorClient()
      .query<InspectorObject>("requests", { errorId, limit: RECENT, count: true })
      .then((page) => current && setState({ total: page.total, items: page.items }))
      .catch(() => current && setState("failed"));
    return () => {
      current = false;
    };
  }, [errorId]);
  const total = state === undefined || state === "failed" ? undefined : state.total;
  const items = state === undefined || state === "failed" ? [] : state.items;
  return (
    <Section
      id="error-occurrences"
      aria-labelledby="error-occurrences-heading"
      title={<span id="error-occurrences-heading">Occurrences</span>}
      description="Retained requests that ended with this error"
      actions={
        <a className="text-link text-xs" href={requestsHref({ errorId })}>
          Open in Requests
        </a>
      }
      flush
    >
      <p className="m-0 border-b border-border px-4 py-2 text-xs text-muted-foreground">
        {state === undefined
          ? "Counting the retained requests…"
          : state === "failed"
            ? "The request history could not be read."
            : total === undefined
              ? `The latest ${items.length} of the retained requests are shown.`
              : total === 0
                ? "No retained request ended with this error."
                : `${total.toLocaleString("en-US")} retained ${total === 1 ? "request ended" : "requests ended"} with this error.`}
      </p>
      {items.length === 0 ? null : (
        <EntityList
          label="Latest requests that ended with this error"
          empty=""
          rows={items.map((item, index) => {
            const label = requestLabel(item);
            const requestId = text(item.requestId);
            const status = typeof item.status === "number" ? String(item.status) : "";
            return {
              key: requestId || String(index),
              href: requestId === "" ? undefined : `/requests/${encodeURIComponent(requestId)}`,
              title: `${label.method} ${label.title}`.trim(),
              trailing: (
                <>
                  <Quiet>{formatTimestamp(text(item.startedAt))}</Quiet>
                  {status === "" ? null : <StatusBadge tone={statusTone(status)} label={status} />}
                </>
              ),
            };
          })}
        />
      )}
    </Section>
  );
}
