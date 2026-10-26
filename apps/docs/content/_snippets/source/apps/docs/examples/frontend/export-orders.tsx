"use client";

/** Submits one commerce export and observes the accepted run without replaying an uncertain submission. */
import { useJobRun, useJobTrigger, useRelkitClient } from "@relkit/client/react";

/** Keeps the accepted receipt separate from the task's eventual output.
 * @returns One explicit submission button and its receipt, observation, or failure state. */
export function ExportOrders() {
  const { status } = useRelkitClient();
  const submit = useJobTrigger("exportOrders");
  const run = useJobRun("exportOrders", submit.data ? { runId: submit.data.runId } : {});

  return (
    <section>
      <button
        disabled={status !== "ready" || !submit.isIdle}
        onClick={() => submit.mutate({ input: { orderIds: ["order-1"] } })}
      >
        Export orders
      </button>
      {submit.isPending && <p role="status">Submitting…</p>}
      {submit.isError && (
        <p role="alert">{String(submit.error)}. Check the outcome before submitting again.</p>
      )}
      {submit.data && <p>Run ID: {submit.data.runId}</p>}
      <p role="status">
        Connection: {run.connection}; run: {run.run?.status ?? "not accepted"}
      </p>
    </section>
  );
}
