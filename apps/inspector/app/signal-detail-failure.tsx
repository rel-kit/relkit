import Link from "next/link";
import type { ReactNode } from "react";
import { Section } from "../components/blocks/section";
import type { InspectorObject } from "../lib/api-types";
import { text } from "../lib/observability-model";
import {
  issueProblem,
  requestFailure,
  type FailureCause,
  type ValidationSummary,
} from "../lib/request-failure";

/**
 * What the application recorded about a failed request: the declared error with a link to its
 * contract, the fields that failed validation, and the cause of an internal failure. It renders
 * nothing for a request that has none of these.
 */
export function FailurePanel({
  request,
  spans,
  logs,
}: {
  readonly request: InspectorObject;
  readonly spans: readonly InspectorObject[];
  readonly logs: readonly InspectorObject[];
}) {
  const failure = requestFailure(request, spans, logs);
  const unexplained = text(request.outcome) === "defect" && failure.cause === undefined;
  if (
    failure.errorId === undefined &&
    failure.validation === undefined &&
    failure.cause === undefined &&
    !unexplained
  )
    return null;
  return (
    <Section id="request-failure" title="Why this request failed">
      <div className="grid gap-4">
        {failure.errorId === undefined ? null : (
          <Block title="Declared error">
            <p className="m-0 text-xs text-foreground">
              The application ended this request with the error{" "}
              <Link
                className="text-link font-mono break-all"
                href={`/errors/${encodeURIComponent(failure.errorId)}`}
              >
                {failure.errorId}
              </Link>
              . Open it to see how the application declares it.
            </p>
          </Block>
        )}
        {failure.validation === undefined ? null : <Validation value={failure.validation} />}
        {failure.cause === undefined ? null : <Cause value={failure.cause} />}
        {unexplained ? (
          <Block title="Cause">
            <p className="m-0 text-xs text-muted-foreground">
              No cause was recorded for this request.
            </p>
          </Block>
        ) : null}
      </div>
    </Section>
  );
}

function Block({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <div className="grid min-w-0 content-start gap-1.5">
      <h3 className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {title}
      </h3>
      {children}
    </div>
  );
}

function Validation({ value }: { readonly value: ValidationSummary }) {
  return (
    <Block title="Fields that failed validation">
      {value.issues.length > 0 ? (
        <table className="w-full min-w-0 border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th scope="col" className="py-1 pr-3 font-medium">
                Field
              </th>
              <th scope="col" className="py-1 font-medium">
                Problem
              </th>
            </tr>
          </thead>
          <tbody>
            {value.issues.map((issue, index) => (
              <tr key={index} className="border-b border-border/60 last:border-b-0">
                <td className="py-1 pr-3 font-mono break-all text-foreground">
                  {issue.path === "" ? (
                    <span className="font-sans">Whole request</span>
                  ) : (
                    issue.path
                  )}
                </td>
                <td className="py-1 text-foreground">
                  {issueProblem(issue.code)}
                  {issueProblem(issue.code) === issue.code ? null : (
                    <code className="ml-2 font-mono text-[11px] text-muted-foreground">
                      {issue.code}
                    </code>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="m-0 text-xs text-muted-foreground">
          {value.count} {value.count === 1 ? "issue was" : "issues were"} counted, but none are
          listed.
        </p>
      )}
      {value.more > 0 ? (
        <p className="m-0 text-xs text-muted-foreground">and {value.more} more</p>
      ) : null}
      <p className="m-0 text-xs text-muted-foreground">
        Only the field and the kind of problem are recorded, never the values that were sent.
      </p>
    </Block>
  );
}

function Cause({ value }: { readonly value: FailureCause }) {
  const detailed = value.message !== undefined || value.stack !== undefined;
  return (
    <Block title="Cause">
      <p className="m-0 font-mono text-xs break-words text-foreground">
        <strong>{value.type}</strong>
        {value.message === undefined ? null : `: ${value.message}`}
      </p>
      {value.code === undefined ? null : (
        <p className="m-0 text-xs text-muted-foreground">
          Error code <code className="font-mono">{value.code}</code>
        </p>
      )}
      {detailed ? null : (
        <p className="m-0 text-xs text-muted-foreground">
          The cause is recorded only in development.
        </p>
      )}
      {value.stack === undefined ? null : (
        <details className="min-w-0">
          <summary className="cursor-pointer text-xs text-muted-foreground">Stack trace</summary>
          <pre className="neon-scroll-fade m-0 mt-1.5 max-h-72 overflow-auto rounded-md border border-border bg-muted/40 p-3 font-mono text-[11.5px] leading-5">
            {value.stack}
          </pre>
        </details>
      )}
    </Block>
  );
}
