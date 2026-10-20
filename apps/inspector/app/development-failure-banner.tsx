"use client";

import { AlertTriangle } from "lucide-react";
import type { DevelopmentFailure } from "../lib/development-failure";
import { useDevelopmentFailure } from "../lib/use-development-failure";

export function DevelopmentFailureBanner() {
  const { failure, unavailable } = useDevelopmentFailure();
  return failure === undefined ? null : (
    <DevelopmentFailureNotice failure={failure} unavailable={unavailable} />
  );
}

export function DevelopmentFailureNotice({
  failure,
  unavailable = false,
}: {
  readonly failure: DevelopmentFailure;
  readonly unavailable?: boolean;
}) {
  return (
    <section
      role="alert"
      aria-labelledby="development-failure-heading"
      className="mx-6 mt-4 flex min-w-0 gap-3 rounded-lg border border-[var(--danger)] bg-[var(--panel)] p-4 text-sm"
    >
      <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-[var(--danger)]" />
      <div className="min-w-0 space-y-2 break-words">
        <h2 id="development-failure-heading" className="font-semibold text-[var(--danger)]">
          Latest reload failed
        </h2>
        <p>
          The previous working version is still serving. Routes and API reference have not updated.
        </p>
        <p className="whitespace-pre-wrap">{failure.message}</p>
        {failure.details.length > 0 && (
          <ul className="list-inside list-disc">
            {failure.details.map((detail) => (
              <li key={detail}>{detail}</li>
            ))}
          </ul>
        )}
        <p>{failure.suggestion}</p>
        <a className="inline-block underline underline-offset-4" href={failure.logsHref}>
          View error logs
        </a>
        {unavailable && <p>Build status is unavailable. This is the last reported failure.</p>}
      </div>
    </section>
  );
}
