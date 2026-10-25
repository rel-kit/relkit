"use client";

/** Consumes the commerce report route as a cancellable typed stream inside the client provider. */
import { useRelkitClient, useStream } from "@relkit/client/react";

/** Starts one report explicitly and displays its validated progress items.
 * @returns Start/cancel controls and visible progress or stream failure. */
export function Report() {
  const { status } = useRelkitClient();
  const report = useStream("GET /reports/:reportId");

  return (
    <section>
      <button
        disabled={status !== "ready"}
        onClick={() => void report.start({ reportId: "daily" })}
      >
        Run report
      </button>
      <button onClick={() => report.cancel()}>Cancel report</button>
      <p role="status">Completed: {report.items.map((item) => item.completed).join(", ")}</p>
      {report.error && <p role="alert">{String(report.error)}</p>}
    </section>
  );
}
