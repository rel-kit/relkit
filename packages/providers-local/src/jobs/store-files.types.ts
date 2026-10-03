/** Stable journal, index and checkpoint filenames below one owned root. */
export interface JobStorePaths {
  readonly records: string;
  readonly index: string;
  readonly checkpoint: string;
}
