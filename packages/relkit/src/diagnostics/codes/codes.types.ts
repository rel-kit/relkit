/** One stable `RELKIT_*` code with the text its generated docs page and terminal output use.
 * @example const entry: DiagnosticCodeEntry = { code: "RELKIT_SCHEMA_UNAVAILABLE", title: "Schema has no JSON Schema", happened: "…", fix: "…" };
 */
export interface DiagnosticCodeEntry {
  /** The code exactly as RelKit emits it. */
  readonly code: `RELKIT_${string}`;
  /** Short sentence-case title naming the problem, without a trailing period. */
  readonly title: string;
  /** What happened, in one or two plain sentences. */
  readonly happened: string;
  /** The next step, in one or two imperative sentences. */
  readonly fix: string;
  /** Hand-written docs page that replaces the generated one, as a site path. */
  readonly page?: `/docs/${string}`;
}
