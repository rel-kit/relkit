/** Launch inputs for `relkit inspector`, produced by commands/inspector.ts from parsed flags. */

/** Application root plus the UI flags passed through to relkit-inspector unchanged. */
export interface InspectorLaunch {
  /** Absolute application root; also the inspector's `--project-root` and working directory. */
  readonly projectRoot: string;
  /** `--port`/`--hostname` flag/value pairs, validated by relkit-inspector itself. */
  readonly forwarded: readonly string[];
}
