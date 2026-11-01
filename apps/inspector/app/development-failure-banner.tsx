"use client";

/** Keeps the displayed snapshot visible while failed candidate diagnostics stay collapsed. */
import { ArrowUpRight, ChevronDown } from "lucide-react";
import Link from "next/link";
import { StatusBadge } from "../components/neon/status-badge";
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
  readonly generationId?: string | undefined;
}) {
  return (
    <section
      aria-label="Development reload status"
      className="mx-4 mt-3 min-w-0 overflow-hidden rounded-lg border border-warning/35 bg-warning-soft text-xs sm:mx-6"
    >
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center gap-2.5 px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset [&::-webkit-details-marker]:hidden">
          <StatusBadge tone="warning" label="reload failed" className="shrink-0 bg-card" />
          <span
            role="status"
            className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-0.5"
          >
            <span className="sr-only">Latest reload failed.</span>
            <span className="text-foreground">
              Showing the last valid snapshot
              {generationId ? (
                <>
                  : <code className="bg-transparent p-0 font-mono text-[11px]">{generationId}</code>
                </>
              ) : (
                "."
              )}
            </span>
          </span>
          <span className="hidden text-[11px] text-muted-foreground sm:inline">Details</span>
          <span className="sr-only">Toggle error details</span>
          <ChevronDown
            aria-hidden="true"
            className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none"
          />
        </summary>
        <DevelopmentFailureDetails failure={failure} />
      </details>
      {unavailable && (
        <p className="m-0 border-t border-warning/25 px-3 py-1.5 text-[11px] text-muted-foreground">
          Build status unavailable; showing the last reported failure.
        </p>
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
    <div className="space-y-2.5 border-t border-warning/25 bg-card px-3 py-3 text-xs">
      <p className="m-0 text-muted-foreground">
        Routes and API reference still reflect this snapshot. A valid reload replaces it
        automatically.
      </p>
      <div className="neon-scroll-fade max-h-60 overflow-auto rounded-md border border-border bg-background px-3 py-2 font-mono text-[11px] leading-5 break-words whitespace-pre-wrap text-foreground">
        <p className="m-0 whitespace-pre-wrap">{failure.message}</p>
        {failure.details.length > 0 && (
          <ul className="m-0 mt-1 list-inside list-disc p-0">
            {failure.details.map((detail) => (
              <li key={detail}>{detail}</li>
            ))}
          </ul>
        )}
      </div>
      <p className="m-0 text-foreground">{failure.suggestion}</p>
      <Link
        className="inline-flex items-center gap-1 font-medium text-foreground underline underline-offset-4"
        href={failure.logsHref}
      >
        View error logs <ArrowUpRight aria-hidden="true" className="size-3.5" />
      </Link>
    </div>
  );
}
