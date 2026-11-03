/** Source text already owned by the normalization input; no filesystem lookup occurs. */
export interface ReplaySource {
  readonly file: string;
  readonly text: string;
}
