/** Pure terminal rendering policy, independent of process/session ownership. */
export interface DevLogFormatOptions {
  readonly verbose?: boolean;
  readonly color?: boolean;
  readonly columns?: number;
}
