import { Suspense } from "react";
import { TracesClient } from "./traces-client";

export default function TracesPage() {
  return (
    <Suspense fallback={<p role="status">Loading traces…</p>}>
      <TracesClient />
    </Suspense>
  );
}
