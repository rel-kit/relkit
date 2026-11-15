import { InspectorApiError } from "./api-types";
import { BARE_FORBIDDEN_TEXT, ORIGIN_DENIED, ORIGIN_DENIED_TEXT } from "./origin-denied";
import { issueProblem, type ValidationIssue } from "./request-failure";

/** The application's answer to a refused action, under `cause` in the rejected action body. */
export interface ActionCause {
  readonly status: number;
  readonly code: string;
  readonly issues?: readonly {
    readonly path: readonly (string | number)[];
    readonly code: string;
  }[];
}

export interface ActionAnswer {
  /** One sentence in plain words. */
  readonly text: string;
  /** Set when the application ended the call with a declared error; the page links to it. */
  readonly errorId?: string;
  /** Fields that failed validation, by dotted path. */
  readonly issues?: readonly ValidationIssue[];
  /** Whether the refusal is explained by the Inspector running without a user session. */
  readonly noSession: boolean;
}

export type ActionSubject = "function" | "event";

export interface ActionAnswerOptions {
  /** Sentence for a 501: what this provider cannot do. */
  readonly unsupported?: string;
}

const ISSUE_WORDS: Readonly<Record<string, string>> = {
  invalid_type: "Wrong type",
  too_small: "Too small or too short",
  too_big: "Too large or too long",
  invalid_enum_value: "Not one of the allowed values",
  invalid_literal: "Not the expected value",
  invalid_string: "Does not match the expected format",
  invalid_union: "Matches none of the allowed shapes",
  unrecognized_keys: "Not a field of this contract",
};

/** Plain words for a schema issue code; the framework's own codes and unknown ones read as recorded. */
export function issueWords(code: string): string {
  return ISSUE_WORDS[code] ?? issueProblem(code);
}

/**
 * Reads the application's own answer from a rejected action.
 * @param error - Thrown request failure.
 * @returns The cause, or undefined when the failure was the Inspector's own.
 */
export function actionCause(error: unknown): ActionCause | undefined {
  if (!(error instanceof InspectorApiError)) return undefined;
  const cause = error.body?.cause;
  if (cause === null || typeof cause !== "object" || Array.isArray(cause)) return undefined;
  const { status, code } = cause as { status?: unknown; code?: unknown };
  return typeof status === "number" && typeof code === "string"
    ? (cause as ActionCause)
    : undefined;
}

const NO_SESSION =
  "The application refused this call (401): no user session is attached. Inspector invocations run without a session, so functions that require one can only be invoked through the application.";
const ACCESS_DENIED =
  "The application refused this call (403): its access rule does not allow a call without a user session. Inspector invocations run without a session, so functions with an access rule can only be invoked through the application.";
const CAUSE_HINT = "Open the request in Requests to see the cause.";

/**
 * Puts a failed action into words: the application's status and code when it refused the call,
 * the Inspector's own reason otherwise.
 * @param error - Thrown request failure.
 * @param subject - What the action was run on.
 * @param options - Wording for failures that depend on the action.
 * @returns A sentence, plus the declared error or invalid fields when the answer names them.
 */
export function actionAnswer(
  error: unknown,
  subject: ActionSubject,
  options: ActionAnswerOptions = {},
): ActionAnswer {
  const cause = actionCause(error);
  if (cause !== undefined) return fromCause(cause, subject);
  // The application's own problem answer, such as its origin check, is not an Inspector envelope.
  if (error instanceof InspectorApiError && error.body?.code === ORIGIN_DENIED)
    return { text: ORIGIN_DENIED_TEXT, noSession: false };
  if (error instanceof InspectorApiError && error.code === "HTTP_403" && error.body === undefined)
    return { text: BARE_FORBIDDEN_TEXT, noSession: false };
  return { text: inspectorReason(error, options), noSession: false };
}

function fromCause(cause: ActionCause, subject: ActionSubject): ActionAnswer {
  const noun = subject === "event" ? "event" : "function";
  const answer = (text: string, rest: Partial<ActionAnswer> = {}): ActionAnswer => ({
    text,
    noSession: false,
    ...rest,
  });
  switch (cause.code) {
    case ORIGIN_DENIED:
      return answer(ORIGIN_DENIED_TEXT);
    case "unauthenticated":
      return answer(NO_SESSION, { noSession: true });
    case "access-denied":
      return answer(ACCESS_DENIED, { noSession: true });
    case "validation":
      return answer(
        subject === "event"
          ? `The payload does not satisfy the event's schema (${cause.status}).`
          : `The input does not satisfy the function's input schema (${cause.status}).`,
        {
          issues: (cause.issues ?? []).map((issue) => ({
            path: issue.path.join("."),
            code: issue.code,
          })),
        },
      );
    case "provider-failure":
      return answer(`A provider the ${noun} depends on failed (${cause.status}). ${CAUSE_HINT}`);
    case "timeout":
      return answer(`The ${noun} did not finish in time (${cause.status}).`);
    case "cancelled":
      return answer(`The call was cancelled before the ${noun} finished.`);
    case "internal-error":
      return answer(`The ${noun} failed with an unexpected error (${cause.status}). ${CAUSE_HINT}`);
    default:
      return answer(`The application ended this call with its declared error (${cause.status}).`, {
        errorId: cause.code,
      });
  }
}

function inspectorReason(error: unknown, options: ActionAnswerOptions): string {
  if (!(error instanceof InspectorApiError))
    return error instanceof Error && error.message !== "" ? error.message : "The action failed.";
  if (error.kind === "network")
    return "The Inspector cannot reach the application. Start it and try again.";
  switch (error.code) {
    case "RELKIT_INSPECTOR_ACTION_NOT_FOUND":
      return "The active generation has no such event or publication (404).";
    case "RELKIT_INSPECTOR_ACTION_STATE_INELIGIBLE":
      return "The delivery's current state does not allow this action (409).";
    case "RELKIT_INSPECTOR_ACTION_UNSUPPORTED":
      return (
        options.unsupported ??
        "The active provider does not support this action (RELKIT_INSPECTOR_ACTION_UNSUPPORTED)."
      );
    default:
      return `The Inspector could not complete the action (${error.code}).`;
  }
}
