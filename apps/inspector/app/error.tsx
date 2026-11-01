"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "../components/ui/button";

export default function InspectorError({
  reset,
  error: _error,
}: {
  readonly reset: () => void;
  readonly error: unknown;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <section
      className="error-state flex max-w-2xl min-w-0 flex-col items-start gap-3 rounded-lg border border-danger/30 bg-danger-soft px-4 py-3.5"
      role="alert"
      aria-labelledby="error-heading"
    >
      <div className="flex min-w-0 items-start gap-2.5">
        <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-danger" />
        <div className="flex min-w-0 flex-col gap-1">
          <h1
            ref={headingRef}
            id="error-heading"
            tabIndex={-1}
            className="text-[13px] font-semibold text-danger outline-none"
          >
            The inspector could not load this view.
          </h1>
          <p className="m-0 text-xs leading-5 text-muted-foreground">
            The active generation is kept separate from candidate diagnostics. Retry the protocol
            request or choose another section.
          </p>
        </div>
      </div>
      <Button variant="secondary" size="sm" onPress={reset} className="ml-6.5">
        <RotateCcw aria-hidden="true" /> Try again
      </Button>
    </section>
  );
}
