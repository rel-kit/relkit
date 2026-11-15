import { ORIGIN_DENIED, ORIGIN_DENIED_TEXT } from "./origin-denied";

export interface RouteOutcome {
  readonly tone: "success" | "danger" | "neutral";
  /** One sentence for the status line. */
  readonly text: string;
}

const SESSION_HINT =
  "The Inspector sends requests with this browser's cookies for the application, so if you are signed in to the application in this browser, that session is used.";

/**
 * Puts the response to a sent route request into words, for the status line beside the button.
 * @param result - Status and parsed body of the application's response.
 * @returns The tone and one sentence naming the status, the problem code when the body has one,
 * and why a 401 or 403 happened.
 */
export function routeOutcome(result: {
  readonly status: number;
  readonly body: unknown;
}): RouteOutcome {
  const { status } = result;
  if (status >= 200 && status < 300)
    return { tone: "success", text: `Request completed (${status}).` };
  if (status >= 300 && status < 400)
    return { tone: "neutral", text: `The application answered with a redirect (${status}).` };
  if (status === 401)
    return {
      tone: "danger",
      text: `The application refused this request (401): no user session is attached. ${SESSION_HINT}`,
    };
  if (status === 403 && problemCode(result.body) === ORIGIN_DENIED)
    return { tone: "danger", text: ORIGIN_DENIED_TEXT };
  if (status === 403)
    return {
      tone: "danger",
      text: `The application refused this request (403): the caller does not have access. ${SESSION_HINT}`,
    };
  const code = problemCode(result.body);
  return {
    tone: "danger",
    text:
      code === undefined
        ? `The application answered ${status}.`
        : `The application answered ${status} with the problem code ${code}.`,
  };
}

function problemCode(body: unknown): string | undefined {
  if (body === null || typeof body !== "object" || Array.isArray(body)) return undefined;
  const code = (body as { code?: unknown }).code;
  return typeof code === "string" && code !== "" ? code : undefined;
}
