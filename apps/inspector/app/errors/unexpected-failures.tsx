"use client";

import { useEffect, useState } from "react";
import { createInspectorClient } from "../../lib/client";
import { requestsHref } from "../../lib/error-occurrences";
import { Section } from "../../components/blocks/section";

/**
 * Requests that ended with a failure no declared error describes. They are not on the list of
 * declared errors, so the page links to them here with their count, read once per page load.
 */
export function UnexpectedFailures() {
  const [total, setTotal] = useState<number>();
  useEffect(() => {
    let current = true;
    createInspectorClient()
      .query("requests", { outcome: "defect", limit: 1, count: true })
      .then((page) => current && setTotal(page.total))
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, []);
  return (
    <Section
      id="unexpected-failures"
      aria-labelledby="unexpected-failures-heading"
      title={<span id="unexpected-failures-heading">Unexpected failures</span>}
      description="Requests that ended with a failure no declared error describes"
    >
      <p className="m-0 flex max-w-none flex-wrap items-baseline gap-x-3 text-xs text-muted-foreground">
        <span>
          {total === undefined
            ? "Counting the retained requests…"
            : total === 0
              ? "No retained request ended with an unexpected failure."
              : `${total.toLocaleString("en-US")} retained ${total === 1 ? "request ended" : "requests ended"} with an unexpected failure.`}
        </span>
        <a className="text-link" href={requestsHref({ outcome: "defect" })}>
          View these requests
        </a>
      </p>
    </Section>
  );
}
