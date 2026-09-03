import { Suspense } from "react";
import { LogsClient } from "./logs-client";

export default function LogsPage() {
  return (
    <Suspense fallback={<p role="status">Loading logs…</p>}>
      <LogsClient />
    </Suspense>
  );
}
