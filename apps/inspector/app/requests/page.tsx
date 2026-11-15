import { Suspense } from "react";
import { SignalsClient } from "../signals-client";

export default function RequestsPage() {
  return (
    <Suspense fallback={<p role="status">Loading requests…</p>}>
      <SignalsClient />
    </Suspense>
  );
}
