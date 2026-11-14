/** Value-free description of the environment files a one-shot command would read. */

/** One candidate environment file, in increasing precedence. */
export interface OneShotEnvironmentFile {
  /** File name relative to the application root, such as `.env.local`. */
  readonly name: string;
  /** Absolute path of the candidate. */
  readonly path: string;
  /** Whether the file exists. */
  readonly exists: boolean;
}

/** Which environment files apply to an application and who loads them. */
export interface OneShotEnvironmentFiles {
  /** Runtime the CLI runs on. */
  readonly runtime: "bun" | "node";
  /**
   * Whether the runtime itself loaded the files before the CLI started: Bun loads them from the
   * directory it started in; Node loads none, so the CLI reads them for one-shot commands.
   */
  readonly loadedByRuntime: boolean;
  /** Candidates selected by the startup `NODE_ENV`, lowest precedence first. */
  readonly files: readonly OneShotEnvironmentFile[];
}

/** Process environment shape shared with `process.env`. */
export type OneShotEnvironmentValues = Readonly<Record<string, string | undefined>>;

/** Inputs of a one-shot environment resolution; the defaults describe this process. */
export interface OneShotEnvironmentOptions {
  /** Environment the command started with; defaults to `process.env`. Its `NODE_ENV` picks the files. */
  readonly inherited?: OneShotEnvironmentValues;
  /** Runtime to resolve for; defaults to the runtime this CLI runs on. */
  readonly runtime?: "bun" | "node";
}
