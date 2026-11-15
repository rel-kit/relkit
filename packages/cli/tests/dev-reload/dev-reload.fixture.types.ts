/** Shapes used by the development-loop test fixture. */

/** A generated application on disk. */
export interface DevFixture {
  readonly root: string;
  /**
   * Writes a project file.
   * @param file - Project-relative path.
   * @param text - New contents.
   */
  readonly write: (file: string, text: string) => void;
  /**
   * Reads a project file.
   * @param file - Project-relative path.
   * @returns Its contents.
   */
  readonly read: (file: string) => string;
  /** Deletes the application. */
  readonly remove: () => void;
}

/** A handler's answer: its revision and the serving process. */
export interface ServedRevision {
  readonly message: string;
  readonly pid: number;
}

/** A running `relkit dev`. */
export interface DevProcess {
  /** Process ID of the `relkit dev` CLI, for tests that signal it alone. */
  readonly pid: number;
  /** Resolves with the CLI's exit status once it exits. */
  readonly exited: Promise<number>;
  /** Public origin of the development front, such as `http://127.0.0.1:51234`. */
  readonly origin: string;
  /**
   * Requests a route.
   * @param path - Route path.
   * @returns The decoded answer, or undefined when the route does not answer 200.
   */
  readonly get: (path: string) => Promise<ServedRevision | undefined>;
  /**
   * Sends a request (GET unless `init` says otherwise) and returns the raw response, whatever its status.
   * @param path - Route path.
   * @param init - Optional method, headers and body.
   * @returns The response.
   */
  readonly request: (path: string, init?: RequestInit) => Promise<Response>;
  /**
   * Polls a route until it serves a message.
   * @param path - Route path.
   * @param message - Expected message.
   * @param deadlineMs - Milliseconds before failing.
   * @returns The matching answer.
   */
  readonly waitFor: (path: string, message: string, deadlineMs?: number) => Promise<ServedRevision>;
  /** @returns Everything dev wrote to stdout and stderr so far. */
  readonly output: () => string;
  /** Stops the dev process group. */
  readonly stop: () => Promise<void>;
}
