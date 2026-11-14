import Link from "next/link";
import type { InspectorObject } from "../../lib/api-types";
import type { ActionAnswer } from "../../lib/action-answer";
import { ActionAnswerView } from "../action-answer-view";

/** What an event action did, kept beside the control that ran it. */
export type ActionOutcomeState =
  | {
      readonly kind: "success";
      readonly text: string;
      /** The publication the action created, when it created one. */
      readonly publicationId?: string;
    }
  | { readonly kind: "failure"; readonly answer: ActionAnswer };

/** The outcome of one control: a sentence with links on success, the application's answer on failure. */
export function ActionOutcome({
  outcome,
  publications,
}: {
  readonly outcome: ActionOutcomeState | undefined;
  readonly publications: readonly InspectorObject[];
}) {
  if (outcome === undefined) return null;
  if (outcome.kind === "failure") return <ActionAnswerView answer={outcome.answer} />;
  const created = publications.find((item) => item.instanceId === outcome.publicationId);
  const traceId = typeof created?.traceId === "string" ? created.traceId : "";
  return (
    <p
      className="m-0 flex max-w-none flex-wrap items-baseline gap-x-3 text-xs text-success"
      role="status"
    >
      <span>{outcome.text}</span>
      {outcome.publicationId === undefined ? null : (
        <a className="text-link" href={`#publication-${outcome.publicationId}`}>
          Show the publication
        </a>
      )}
      {traceId === "" ? null : (
        <Link className="text-link" href={`/traces/${encodeURIComponent(traceId)}`}>
          Open its trace
        </Link>
      )}
    </p>
  );
}
