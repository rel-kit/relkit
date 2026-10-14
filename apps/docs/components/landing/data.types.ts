/** Describes the source-backed examples and their rendered presentation. */
export interface LandingExample {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly source: string;
  readonly guide: string;
}
export interface RenderedLandingExample extends LandingExample {
  readonly highlightedCode: string;
}
