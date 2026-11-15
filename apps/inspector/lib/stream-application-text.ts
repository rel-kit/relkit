/** Interface text for the Inspector's stream, application and history states. Backticks mark code. */
import type { ApplicationLink, InspectorState } from "./stream-application";
import type { StreamConnectionState } from "./stream-protocol";

export interface ApplicationNotice {
  readonly title: string;
  readonly body: string;
  readonly next: string;
}

const START_DEV =
  "Start `relkit dev` with `inspector: { enabled: true }` in the app config. The Inspector connects on its own.";

/**
 * The banner every page shows while the application or the Inspector is away.
 * @param formatTime - Formats an ISO time for the reader, with its zone.
 */
export function applicationNotice(
  state: InspectorState,
  formatTime: (iso: string) => string,
): ApplicationNotice | undefined {
  if (state.stream === "reconnecting" || state.stream === "offline")
    return {
      title: "The Inspector is not answering",
      body: "This page cannot reach the `relkit inspector` process. It keeps what it loaded and reconnects on its own.",
      next: "If it does not reconnect, run `relkit inspector` again in the project.",
    };
  const application = state.application;
  const since = application.since === undefined ? undefined : formatTime(application.since);
  switch (application.state) {
    case "unreachable":
      return {
        title: "The application is not connected",
        body: `${
          application.sessionId === undefined
            ? "The `relkit dev` session"
            : `The \`relkit dev\` session \`${application.sessionId}\``
        } stopped answering${since === undefined ? "" : ` at ${since}`}. Retained history is still shown; live updates are paused.`,
        next: START_DEV,
      };
    case "waiting":
      return {
        title: "Waiting for a development session",
        body: `No running \`relkit dev\` session was found for this project${
          since === undefined ? "" : ` since ${since}`
        }. Retained history is still shown.`,
        next: START_DEV,
      };
    case "ambiguous":
      return {
        title: "Several development sessions found",
        body: `${application.sessions.length} \`relkit dev\` sessions are running for this project (${application.sessions
          .map((id) => `\`${id}\``)
          .join(", ")}), and the Inspector cannot choose one. Retained history is still shown.`,
        next: "Stop the sessions you do not need, or restart `relkit inspector` with `--connection-file` set to one session's connection file.",
      };
    default:
      return undefined;
  }
}

/** What a page that acts on the running application shows instead of its controls. */
export function needsApplicationNotice(link: ApplicationLink): ApplicationNotice | undefined {
  if (link === "connected" || link === "checking") return undefined;
  return {
    title: "Unavailable while the application is not connected",
    body: "This page reads from or acts on the running application.",
    next:
      link === "ambiguous"
        ? "Restart `relkit inspector` with `--connection-file` to choose a session."
        : "Start `relkit dev` with `inspector: { enabled: true }` in the app config.",
  };
}

const APPLICATION_LABELS: Record<ApplicationLink, string> = {
  checking: "checking",
  connected: "connected",
  waiting: "no session",
  unreachable: "unreachable",
  ambiguous: "several sessions",
};

export function applicationLabel(link: ApplicationLink): string {
  return APPLICATION_LABELS[link];
}

/** The live-update word for a list backed by history: paused while the application is away. */
export function liveUpdates(stream: StreamConnectionState | string, link: ApplicationLink): string {
  if (stream !== "connected") return stream;
  return link === "connected" || link === "checking" ? "connected" : "paused";
}
