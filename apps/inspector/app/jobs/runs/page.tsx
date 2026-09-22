import { Suspense } from "react";
import { JobsRunsClient } from "./runs-client";

export default function JobsRunsPage() {
  return (
    <Suspense fallback={<p role="status">Loading runs…</p>}>
      <JobsRunsClient />
    </Suspense>
  );
}
