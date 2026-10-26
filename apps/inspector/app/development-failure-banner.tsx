"use client";

/** Keeps the displayed snapshot visible while failed candidate diagnostics stay collapsed. */
import { AlertTriangle, ChevronDown } from "lucide-react";
import type { DevelopmentFailure } from "../lib/development-failure";
import { useDevelopmentFailure } from "../lib/use-development-failure";

/** Reads reload status without replacing the active graph or blocking page content.
 * @param props - Identity of the snapshot currently displayed by the shell.
 * @returns A compact notice while a failed candidate remains unresolved, otherwise nothing.
 */
export function DevelopmentFailureBanner({ generationId }: { readonly generationId?: string }) {
  const { failure, unavailable } = useDevelopmentFailure();
  return failure === undefined ? null : (
    <DevelopmentFailureNotice
      failure={failure}
      unavailable={unavailable}
      generationId={generationId}
    />
  );
}

/** Shows snapshot identity above an initially collapsed diagnostic disclosure.
 * @param props - Last failure, status availability, and displayed generation identity.
 * @returns A keyboard-accessible notice that leaves the workspace usable.
 */
export function DevelopmentFailureNotice({
  failure,
  unavailable = false,
  generationId,
}: {
  readonly failure: DevelopmentFailure;
  readonly unavailable?: boolean;
  readonly generationId?: string;
}) {
  return (
    <section
      aria-label="Development reload status"
      className="mx-4 mt-3 min-w-0 rounded-lg border border-[var(--line)] bg-[var(--panel)] text-xs sm:mx-6"
    >
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-3 py-2.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--warning)] [&::-webkit-details-marker]:hidden">
          <AlertTriangle aria-hidden="true" className="size-4 shrink-0 text-[var(--warning)]" />
          <span role="status" className="flex min-w-0 flex-1 flex-wrap gap-x-3 gap-y-1">
            <span className="font-semibold text-[var(--warning)]">Latest reload failed</span>
            <span>
              Showing the last valid snapshot
              {generationId ? (
                <>
                  : <code>{generationId}</code>
                </>
              ) : (
                "."
              )}
            </span>
          </span>
          <span className="sr-only">Toggle error details</span>
          <ChevronDown aria-hidden="true" className="size-4 shrink-0 group-open:rotate-180" />
        </summary>
        <DevelopmentFailureDetails failure={failure} />
      </details>
      {unavailable && (
        <p className="px-3 pb-2.5">Build status unavailable; showing the last reported failure.</p>
      )}
    </section>
  );
}

/** Keeps full diagnostics scrollable without allowing long output to dominate the workspace.
 * @param props - Failure details, recovery guidance, and the filtered log link.
 * @returns The content shown only when the notice is expanded.
 */
function DevelopmentFailureDetails({ failure }: { readonly failure: DevelopmentFailure }) {
  return (
    <div className="space-y-2 border-t border-[var(--line)] px-3 py-3 text-sm">
      <p>
        Routes and API reference still reflect this snapshot. A valid reload replaces it
        automatically.
      </p>
      <div className="max-h-60 overflow-auto whitespace-pre-wrap break-words font-mono text-xs">
        <p className="whitespace-pre-wrap">{failure.message}</p>
        {failure.details.length > 0 && (
          <ul className="list-inside list-disc">
            {failure.details.map((detail) => (
              <li key={detail}>{detail}</li>
            ))}
          </ul>
        )}
      </div>
      <p>{failure.suggestion}</p>
      <a className="inline-block underline underline-offset-4" href={failure.logsHref}>
        View error logs
      </a>
    </div>
  );
}
