/** Shared types for the existing documentation producers and their owned output boundary. */
export type Emit = (path: string, value: string) => Promise<void>;
export interface SourceInclude {
  readonly source: string;
  readonly output: string;
}
