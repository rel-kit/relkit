"use client";

import { useEffect, useRef } from "react";

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
    <section className="error-state" role="alert" aria-labelledby="error-heading">
      <p className="eyebrow">INSPECTOR STATUS</p>
      <h1 ref={headingRef} id="error-heading" tabIndex={-1}>
        The inspector could not load this view.
      </h1>
      <p>
        The active generation is kept separate from candidate diagnostics. Retry the protocol
        request or choose another section.
      </p>
      <button className="button-link" type="button" onClick={reset}>
        Try again
      </button>
    </section>
  );
}
