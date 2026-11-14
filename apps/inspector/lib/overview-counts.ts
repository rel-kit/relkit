/**
 * The overview's request tiles (IN-16): counts over every retained request when the history can
 * count them, and a sample labelled as "the last 100" when it cannot.
 */
import { formatRate } from "./overview-model";

/** The newest-requests sample behind the trend line. */
export interface RequestSample {
  readonly total: number;
  readonly failed: number;
  /** More requests are retained than the sample holds. */
  readonly truncated: boolean;
}

/** Matches over the whole retained history, from `count=true` queries. */
export interface RequestCounts {
  readonly total: number;
  readonly failed: number;
}

export interface Tile {
  readonly value: string;
  readonly hint: string;
}

const number = (value: number) => value.toLocaleString("en-US");

export function requestTiles(
  sample: RequestSample,
  counts: RequestCounts | undefined,
): { readonly requests: Tile; readonly errorRate: Tile; readonly failed: number } {
  const whole = counts ?? (sample.truncated ? undefined : sample);
  if (whole !== undefined) {
    const hint =
      whole.total === 0
        ? "no requests retained"
        : sample.truncated
          ? `retained · trend of the last ${number(sample.total)}`
          : "retained in history";
    return {
      requests: { value: number(whole.total), hint },
      errorRate: {
        value: formatRate(whole.total === 0 ? undefined : whole.failed / whole.total),
        hint: `${number(whole.failed)} of ${number(whole.total)} retained answered 5xx`,
      },
      failed: whole.failed,
    };
  }
  const last = `the last ${number(sample.total)} requests`;
  return {
    requests: { value: `${number(sample.total)}+`, hint: `last ${number(sample.total)} requests` },
    errorRate: {
      value: formatRate(sample.total === 0 ? undefined : sample.failed / sample.total),
      hint: `${number(sample.failed)} of ${last} answered 5xx`,
    },
    failed: sample.failed,
  };
}
